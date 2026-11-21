#!/usr/bin/env node
// Export large, account-owned histories as private GeoJSON using bounded API pages.
// A complete private file appears only after every authenticated page succeeds.
import { open, link, unlink, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const [destination] = process.argv.slice(2);
const token = process.env.EXPORT_API_TOKEN;
const endpoint = process.env.API_URL || 'http://127.0.0.1:8080/api';
const pageSize = Number(process.env.EXPORT_PAGE_SIZE ?? 3000);
const maxPoints = Number(process.env.EXPORT_MAX_POINTS ?? 2000000);

if (!destination || !token) {
  console.error('Usage: EXPORT_API_TOKEN=<private-session> API_URL=https://your-server/api node scripts/export-geojson.mjs /private/destination.geojson');
  process.exitCode = 2;
} else {
  let handle, tempPath;
  try {
    const root = new URL(endpoint);
    const allowedLocal = ['localhost','127.0.0.1','[::1]'].includes(root.hostname);
    if (!(root.protocol === 'https:' || (root.protocol === 'http:' && allowedLocal)) ||
        root.username || root.password || root.search || root.hash) {
      throw new Error('API_URL must be HTTPS, or HTTP loopback without embedded credentials or query');
    }
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 5000 ||
        !Number.isSafeInteger(maxPoints) || maxPoints < 1 || maxPoints > 5000000) {
      throw new Error('EXPORT_PAGE_SIZE must be 1..5000 and EXPORT_MAX_POINTS must be 1..5000000');
    }
    const base = root.toString().replace(/\/$/,'');
    const outputPath = resolve(destination);
    try { await lstat(outputPath); throw Object.assign(new Error('Destination exists'),{code:'EEXIST'}); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    // A temporary private file shares the destination directory so hard-link publication
    // never silently overwrites an existing export and never crosses filesystems.
    tempPath = join(dirname(outputPath), '.gclocations-export-' + randomBytes(12).toString('hex') + '.tmp');
    handle = await open(tempPath,'wx',0o600);
    await handle.writeFile('{"type":"FeatureCollection","features":[');
    let beforeId = null;
    let exported = 0;
    let pages = 0;
    let prefix = '';
    const cursors = new Set();
    while (true) {
      if (++pages > 10000) throw new Error('Too many export pages; split this export');
      const url = new URL(base + '/v1/export/geojson/page');
      url.searchParams.set('limit',String(pageSize));
      if (beforeId !== null) url.searchParams.set('beforeId', beforeId);
      const res = await fetch(url, {
        headers:{ Authorization:'Bearer ' + token, Accept:'application/json' },
        redirect:'error',
        signal:AbortSignal.timeout(20000)
      });
      if (!res.ok) throw new Error('Private export request failed: HTTP ' + res.status);
      const payload = await res.json();
      if (payload.type !== 'FeatureCollection' || !Array.isArray(payload.features) ||
          payload.features.length > pageSize || typeof payload.hasMore !== 'boolean') {
        throw new Error('Invalid server GeoJSON export page');
      }
      if (exported + payload.features.length > maxPoints) {
        throw new Error('Export exceeds configured EXPORT_MAX_POINTS; no output file was published');
      }
      for (const feature of payload.features) {
        if (feature?.type !== 'Feature' || feature.geometry?.type !== 'Point' ||
            !Array.isArray(feature.geometry.coordinates) ||
            feature.geometry.coordinates.length !== 2 ||
            !feature.geometry.coordinates.every(Number.isFinite)) {
          throw new Error('Invalid point geometry from export server');
        }
        await handle.writeFile(prefix + JSON.stringify(feature));
        prefix = ',';
        exported++;
      }
      if (!payload.hasMore) {
        if (payload.nextBeforeId !== null) throw new Error('Malformed final export cursor');
        break;
      }
      const cursor = payload.nextBeforeId;
      if (typeof cursor !== 'string' || !/^[1-9][0-9]{0,18}$/.test(cursor) ||
          cursors.has(cursor) || (beforeId !== null && BigInt(cursor) >= BigInt(beforeId)) ||
          payload.features.length === 0) {
        throw new Error('Invalid or repeated server export cursor');
      }
      cursors.add(cursor);
      beforeId = cursor;
    }
    await handle.writeFile(']}\n');
    await handle.sync();
    await handle.close();
    handle = null;
    // link() refuses to replace an existing path. The restrictive 0600 mode is retained.
    await link(tempPath,outputPath);
    await unlink(tempPath);
    tempPath = null;
    console.log('Exported ' + exported + ' private location records to a mode-0600 GeoJSON file.');
  } catch (error) {
    // No secret/token, URL, or coordinates in error output.
    console.error('GeoJSON export failed: ' + (error.code === 'EEXIST' ?
      'destination already exists; choose a different path' :
      error instanceof Error ? error.message : 'unknown error'));
    process.exitCode = 1;
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (tempPath) await unlink(tempPath).catch(() => {});
  }
}
