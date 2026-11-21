// Shared safety boundary for one-off authorized importer CLIs.
// Use only built-in Node APIs; never log credentials or personal coordinates.
import { open, stat } from 'node:fs/promises';

export const MAX_IMPORT_BYTES = 64 * 1024 * 1024;
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function privateApiBase(raw) {
  if (typeof raw !== 'string') throw new Error('API_URL is required');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Invalid API_URL'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
    throw new Error('API_URL requires HTTPS, or HTTP loopback only');
  }
  if (url.username || url.password || url.search || url.hash ||
      (url.pathname !== '/api' && url.pathname !== '/api/')) {
    throw new Error('API_URL must end with /api and contain no credentials, query or fragment');
  }
  return url.origin + '/api';
}

export function privateBearerToken(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(value)) {
    throw new Error('IMPORT_API_TOKEN must be a valid session token');
  }
  return value;
}

export async function readJsonFileBounded(filename, maxBytes = MAX_IMPORT_BYTES) {
  if (typeof filename !== 'string' || !filename) throw new Error('Import filename required');
  const metadata = await stat(filename);
  if (!metadata.isFile() || metadata.size > maxBytes) {
    throw new Error('Import must be a regular JSON file within the configured size limit');
  }
  const handle = await open(filename,'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > maxBytes) {
      throw new Error('Import file exceeds permitted size');
    }
    const contents = await handle.readFile();
    if (contents.byteLength > maxBytes) throw new Error('Import file grew beyond the permitted size');
    return JSON.parse(contents.toString('utf8'));
  } finally {
    await handle.close();
  }
}

export async function readJsonResponseBounded(response, maxBytes = MAX_IMPORT_BYTES) {
  const reported = response.headers.get('content-length');
  if (reported !== null && Number.isFinite(Number(reported)) && Number(reported) > maxBytes) {
    await response.body?.cancel().catch(()=>{});
    throw new Error('Remote report exceeds permitted size');
  }
  if (!response.body) throw new Error('Empty remote JSON report');
  const chunks = [];
  let bytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) throw new Error('Remote report exceeds permitted size');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks,bytes).toString('utf8'));
  } finally {
    try { await reader.cancel(); } catch { /* stream is already done or closed */ }
    reader.releaseLock();
  }
}

export async function submitBatch(api, token, positions) {
  if (!Array.isArray(positions) || positions.length < 1 || positions.length > 250) {
    throw new Error('Import batch size out of range');
  }
  const res = await fetch(api + '/v1/locations/batch',{
    method:'POST',
    headers:{ Authorization:'Bearer ' + token, 'Content-Type':'application/json', Accept:'application/json' },
    body:JSON.stringify({ positions }),
    signal:AbortSignal.timeout(20000),
    redirect:'error'
  });
  if (!res.ok) throw new Error('Private import request rejected: HTTP ' + res.status);
  const payload = await readJsonResponseBounded(res, 8192);
  if (!Number.isSafeInteger(payload?.accepted) || payload.accepted < 0 || payload.accepted > positions.length) {
    throw new Error('Invalid private import acknowledgement');
  }
  return payload.accepted;
}
