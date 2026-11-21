import test from 'node:test';
import assert from 'node:assert/strict';
import { inferVisits } from '../src/visits.mjs';

const base = Date.parse('2026-11-20T12:00:00Z');
const fix = (seconds, latitude, longitude, accuracyM=6) => ({
  captured_at:new Date(base+seconds*1000).toISOString(),
  latitude, longitude, accuracy_m:accuracyM
});
test('stationary location fixes over 15 minutes form a single visit', () => {
  const points=[fix(0,32.7,-86.7),fix(300,32.70003,-86.70001),fix(600,32.69997,-86.70002),fix(900,32.7,-86.7)];
  const visits=inferVisits(points);
  assert.equal(visits.length,1);
  assert.equal(visits[0].durationSeconds,900);
  assert.equal(visits[0].pointCount,4);
  assert.ok(visits[0].observedRadiusMeters < 10);
  assert.ok(Math.abs(visits[0].latitude-32.7)<0.0001);
  assert.ok(Math.abs(visits[0].longitude+86.7)<0.0001);
});
test('moving path does not become an idle stay', () => {
  const points=[fix(0,32.7,-86.7),fix(300,32.705,-86.7),fix(600,32.710,-86.7),fix(900,32.715,-86.7)];
  assert.deepEqual(inferVisits(points),[]);
});
test('too brief or insufficient samples do not qualify', () => {
  assert.deepEqual(inferVisits([fix(0,32.7,-86.7),fix(60,32.7,-86.7),fix(120,32.7,-86.7)]),[]);
  assert.deepEqual(inferVisits([fix(0,32.7,-86.7),fix(3600,32.7,-86.7)]),[]);
});
test('long logging gaps split visits instead of implying presence', () => {
  const points=[
    fix(0,32.7,-86.7),fix(300,32.7,-86.7),fix(900,32.7,-86.7),
    fix(7200,32.7,-86.7),fix(7500,32.7,-86.7),fix(8100,32.7,-86.7)
  ];
  const visits=inferVisits(points);
  assert.equal(visits.length,2);
  assert.equal(visits[0].durationSeconds,900);
  assert.ok(visits[0].departedAt > visits[1].departedAt);
});
test('a stay spanning the antimeridian uses circular longitude rather than the wrong globe center', () => {
  const points = [fix(0,0,179.9997),fix(300,0,-179.9999),fix(900,0,179.9998)];
  const visits = inferVisits(points);
  assert.equal(visits.length,1);
  assert.ok(Math.abs(visits[0].longitude)>179.99);
  assert.ok(visits[0].observedRadiusMeters < 125);
});
test('very inaccurate fixes cannot form visits', () => {
  assert.deepEqual(inferVisits([fix(0,32.7,-86.7,700),fix(300,32.7,-86.7,700),fix(900,32.7,-86.7,700)]),[]);
});
test('invalid and duplicate timestamp points do not create false stays', () => {
  assert.deepEqual(inferVisits([fix(0,32.7,-86.7),fix(0,32.7,-86.7),fix(300,32.7,-86.7),{...fix(900,32.7,-86.7),latitude:999}]),[]);
});
test('input history remains unchanged and order-independent', () => {
  const points=[fix(900,32.7,-86.7),fix(0,32.7,-86.7),fix(300,32.7,-86.7)];
  const saved=JSON.stringify(points);
  const visits=inferVisits(points);
  assert.equal(visits.length,1);
  assert.equal(JSON.stringify(points),saved);
  assert.throws(()=>inferVisits(null),TypeError);
});
