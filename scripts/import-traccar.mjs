#!/usr/bin/env node
// Pull YOUR authorized Traccar history via upstream REST reports and import under your account.
// Traccar server credentials are never sent to GoreeCloud Locations.
import { pointInput } from '../apps/api/src/security.mjs';
import { createHash } from 'node:crypto';
import { privateApiBase, privateBearerToken, readJsonResponseBounded, submitBatch } from './import-utils.mjs';

const base = (process.env.TRACCAR_URL || '').replace(/\/$/, '');
const user = process.env.TRACCAR_USERNAME;
const password = process.env.TRACCAR_PASSWORD;
const deviceId = Number(process.env.TRACCAR_DEVICE_ID);
const rawApi = process.env.API_URL || 'http://127.0.0.1:8080/api';
const rawToken = process.env.IMPORT_API_TOKEN;
const from = process.env.IMPORT_FROM;
const to = process.env.IMPORT_TO;
if (!base.startsWith('https://') || !user || !password || !Number.isSafeInteger(deviceId) || deviceId < 1 || !rawToken || !from || !to ||
    !Number.isFinite(Date.parse(from)) || !Number.isFinite(Date.parse(to)) || new Date(to)<=new Date(from)) {
  console.error('Required: TRACCAR_URL=https://server TRACCAR_USERNAME TRACCAR_PASSWORD TRACCAR_DEVICE_ID IMPORT_API_TOKEN IMPORT_FROM=ISO8601 IMPORT_TO=ISO8601; optional API_URL');
  process.exit(2);
}
const api = privateApiBase(rawApi);
const token = privateBearerToken(rawToken);
const upstream = new URL(base);
if (upstream.username || upstream.password || upstream.search || upstream.hash) throw new Error('Invalid Traccar URL');
const report = new URL(base + '/api/reports/route');
report.searchParams.set('deviceId',String(deviceId));
report.searchParams.set('from',new Date(from).toISOString());
report.searchParams.set('to',new Date(to).toISOString());
const res = await fetch(report, {
  headers: { Authorization: 'Basic '+Buffer.from(user+':'+password).toString('base64'), Accept: 'application/json' },
  redirect:'error',
  signal:AbortSignal.timeout(45000)
});
if (!res.ok) throw new Error('Traccar report request failed: HTTP '+res.status);
const rows = await readJsonResponseBounded(res);
if (!Array.isArray(rows)) throw new Error('Unexpected Traccar report format');
if (rows.length > 200000) throw new Error('Split report into smaller date ranges');
const positions = [];
let skipped = 0;
for (const row of rows) {
  try {
    const point = pointInput({ latitude: row.latitude, longitude: row.longitude, accuracyM: row.accuracy ?? null,
      capturedAt: row.fixTime || row.deviceTime || row.serverTime, source: 'traccar' });
    const key = createHash('sha256').update(JSON.stringify([deviceId,point.capturedAt,point.latitude,point.longitude,point.accuracyM])).digest('hex');
    positions.push({ ...point, clientKey: 'traccar_' + key });
  } catch { skipped++; }
}
let imported = 0;
for (let i=0;i<positions.length;i+=250) {
  imported += await submitBatch(api,token,positions.slice(i,i+250));
}
console.log(JSON.stringify({ imported, skipped, deviceId, from, to },null,2));
