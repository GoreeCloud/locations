#!/usr/bin/env node
// Import a GeoJSON FeatureCollection exported by Dawarich or another GPX/GeoJSON converter.
// No database bypass: the signed-in owner must enable recording explicitly first.
import { createHash } from 'node:crypto';
import { privateApiBase, privateBearerToken, readJsonFileBounded, submitBatch } from './import-utils.mjs';
import { pointInput } from '../apps/api/src/security.mjs';

const [filename] = process.argv.slice(2);
const rawApi = process.env.API_URL || 'http://127.0.0.1:8080/api';
const rawToken = process.env.IMPORT_API_TOKEN;
if (!filename || !rawToken) {
  console.error('Usage: IMPORT_API_TOKEN=<signed-in-account-token> API_URL=https://your-server/api node scripts/import-geojson.mjs data.geojson');
  process.exit(2);
}
const api = privateApiBase(rawApi);
const token = privateBearerToken(rawToken);
const contents = await readJsonFileBounded(filename);
if (!contents || typeof contents !== 'object' || contents.type !== 'FeatureCollection' || !Array.isArray(contents.features)) {
  throw new Error('Expected GeoJSON FeatureCollection');
}
if (contents.features.length > 200000) throw new Error('Import has over 200,000 points; split input file.');
const points = [];
let skipped = 0;
for (const feature of contents.features) {
  if (feature?.type !== 'Feature' || feature.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) {
    skipped++; continue;
  }
  const [longitude, latitude] = feature.geometry.coordinates;
  const props = feature.properties || {};
  const capturedAt = props.capturedAt || props.timestamp || props.time || props.recorded_at || props.timestamp_ms;
  let capture;
  try { capture = typeof capturedAt === 'number' ? new Date(capturedAt).toISOString() : capturedAt; }
  catch { skipped++; continue; }
  if (!capture) { skipped++; continue; }
  const accuracyM = props.accuracyM ?? props.accuracy ?? null;
  try {
    const point = pointInput({ latitude, longitude, accuracyM, capturedAt: capture, source: 'geojson' });
    const key = createHash('sha256').update(JSON.stringify([point.capturedAt,point.latitude,point.longitude,point.accuracyM])).digest('hex');
    points.push({ ...point, clientKey: 'geojson_' + key });
  } catch { skipped++; }
}
if (!points.length) throw new Error('No valid, timestamped positions found.');
let saved = 0;
for (let i=0;i<points.length;i+=250) {
  saved += await submitBatch(api,token,points.slice(i,i+250));
}
console.log(JSON.stringify({ imported:saved, skipped },null,2));
