#!/usr/bin/env node
// Import a GeoJSON FeatureCollection exported by Dawarich or another GPX/GeoJSON converter.
// No database bypass: the signed-in owner must enable recording explicitly first.
import { readFile } from 'node:fs/promises';
import { pointInput } from '../apps/api/src/security.mjs';

const [filename] = process.argv.slice(2);
const api = (process.env.API_URL || 'http://127.0.0.1:8080/api').replace(/\/$/, '');
const token = process.env.IMPORT_API_TOKEN;
if (!filename || !token) {
  console.error('Usage: IMPORT_API_TOKEN=<signed-in-account-token> API_URL=http://localhost:8080/api node scripts/import-geojson.mjs data.geojson');
  process.exit(2);
}
const contents = JSON.parse(await readFile(filename,'utf8'));
if (contents.type !== 'FeatureCollection' || !Array.isArray(contents.features)) {
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
  const capture = typeof capturedAt === 'number' ? new Date(capturedAt).toISOString() : capturedAt;
  if (!capture) { skipped++; continue; }
  const accuracyM = props.accuracyM ?? props.accuracy ?? null;
  try { points.push(pointInput({ latitude, longitude, accuracyM, capturedAt: capture, source: 'geojson' })); }
  catch { skipped++; }
}
if (!points.length) throw new Error('No valid, timestamped positions found.');
let saved = 0;
for (let i=0;i<points.length;i+=250) {
  const res = await fetch(api+'/v1/locations/batch', {
    method: 'POST', headers: { Authorization: 'Bearer '+token, 'Content-Type':'application/json' },
    body: JSON.stringify({ positions: points.slice(i,i+250) })
  });
  if (!res.ok) throw new Error('Import stopped after '+saved+' points: '+res.status+' '+(await res.text()).slice(0,250));
  saved += Number((await res.json()).accepted);
}
console.log(JSON.stringify({ imported:saved, skipped },null,2));
