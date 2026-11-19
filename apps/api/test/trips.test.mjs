import test from 'node:test';
import assert from 'node:assert/strict';
import { haversineMeters, inferTrips } from '../src/trips.mjs';

const base = Date.parse('2026-11-18T12:00:00.000Z');
const fix = (seconds, latitude, longitude, accuracyM = 5) => ({
  captured_at: new Date(base + seconds * 1000).toISOString(),
  latitude, longitude, accuracy_m: accuracyM
});
test('haversine distance is zero for equal points and ~111 km for one latitude degree', () => {
  assert.equal(haversineMeters({latitude:0,longitude:0},{latitude:0,longitude:0}),0);
  assert.ok(Math.abs(haversineMeters({latitude:0,longitude:0},{latitude:1,longitude:0})-111195)<15);
});
test('detects trip independent of input order', () => {
  const points = [fix(0,32.7,-86.7),fix(300,32.705,-86.697),fix(600,32.711,-86.691),fix(900,32.714,-86.689)];
  const trips = inferTrips([...points].reverse());
  assert.equal(trips.length,1);
  assert.ok(trips[0].distanceMeters>1200);
  assert.equal(trips[0].durationSeconds,900);
  assert.equal(trips[0].pointCount,4);
  assert.deepEqual(trips[0].start,{latitude:32.7,longitude:-86.7});
  assert.deepEqual(trips[0].geometry.coordinates[0],[-86.7,32.7]);
});
test('stationary GPS jitter is not a trip', () => {
  assert.deepEqual(inferTrips([fix(0,32.7,-86.7),fix(100,32.70001,-86.70002),fix(200,32.69999,-86.70001),fix(300,32.70002,-86.7)]),[]);
});
test('implausible instantaneous jump is not a trip', () => {
  assert.deepEqual(inferTrips([fix(0,32.7,-86.7),fix(1,36,-82),fix(2,36.001,-82.001)]),[]);
});
test('long gaps split trips and results are latest-first', () => {
  const points = [
    fix(0,32.7,-86.7),fix(300,32.705,-86.695),fix(600,32.711,-86.69),
    fix(10800,32.8,-86.6),fix(11100,32.806,-86.595),fix(11400,32.813,-86.589)
  ];
  const trips = inferTrips(points);
  assert.equal(trips.length,2);
  assert.ok(trips[0].endedAt > trips[1].endedAt);
});
test('reported high GPS inaccuracy is not counted as motion', () => {
  assert.deepEqual(inferTrips([fix(0,32.7,-86.7,300),fix(300,32.7009,-86.7,300),fix(600,32.7018,-86.7,300)]),[]);
});
test('invalid points, duplicate timestamps and tiny samples do not generate a route', () => {
  const points=[fix(0,32.7,-86.7),{...fix(10,32.701,-86.7),latitude:91},fix(0,32.701,-86.7),fix(180,32.703,-86.7),{longitude:0,latitude:0,captured_at:'no'}];
  assert.deepEqual(inferTrips(points),[]);
});
test('does not mutate history and rejects invalid input', () => {
  const history=[fix(0,32.7,-86.7),fix(10,32.7001,-86.7)];
  const initial=JSON.stringify(history);
  inferTrips(history);
  assert.equal(JSON.stringify(history),initial);
  assert.throws(()=>inferTrips(null),TypeError);
});
