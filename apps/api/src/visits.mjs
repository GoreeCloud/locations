import { haversineMeters } from './trips.mjs';

// User-owned, offline visit estimates. No external maps, geocoding or location sharing.
// Not evidence of presence, safety, arrival or a geofence event.
function asPoint(row, maxAccuracyMeters) {
  if (!row || typeof row !== 'object') return null;
  const latitude = Number(row.latitude), longitude = Number(row.longitude);
  const at = new Date(row.captured_at ?? row.capturedAt).valueOf();
  const rawAccuracy = row.accuracy_m ?? row.accuracyM;
  const accuracyM = rawAccuracy == null ? 0 : Number(rawAccuracy);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(at) || !Number.isFinite(accuracyM) ||
      accuracyM < 0 || accuracyM > maxAccuracyMeters) return null;
  return { latitude, longitude, accuracyM, at };
}

export function inferVisits(rows, {
  radiusMeters = 125,
  minDurationMs = 10 * 60000,
  minPoints = 3,
  maxGapMs = 45 * 60000,
  maxAccuracyMeters = 150,
} = {}) {
  if (!Array.isArray(rows)) throw new TypeError('Expected location history array');
  const points = rows.map(p => asPoint(p,maxAccuracyMeters)).filter(Boolean)
    .sort((a,b) => a.at - b.at);
  let group = [], sumLat = 0, sumLonSin = 0, sumLonCos = 0;
  const visits = [];
  function center() {
    const radians = Math.atan2(sumLonSin, sumLonCos);
    return { latitude:sumLat / group.length, longitude:radians * 180 / Math.PI };
  }
  function flush() {
    if (group.length < minPoints) return;
    const first = group[0], last = group[group.length - 1];
    const duration = last.at - first.at;
    if (duration < minDurationMs) return;
    const centerPoint = center();
    const observedRadius = Math.max(...group.map(p => haversineMeters(p,centerPoint)));
    if (observedRadius > radiusMeters) return;
    visits.push({
      arrivedAt:new Date(first.at).toISOString(),
      departedAt:new Date(last.at).toISOString(),
      durationSeconds:Math.round(duration/1000),
      pointCount:group.length,
      latitude:Number(centerPoint.latitude.toFixed(6)),
      longitude:Number(centerPoint.longitude.toFixed(6)),
      observedRadiusMeters:Math.round(observedRadius)
    });
  }
  function reset(point) {
    group = [point]; sumLat = point.latitude;
    sumLonSin = Math.sin(point.longitude * Math.PI / 180);
    sumLonCos = Math.cos(point.longitude * Math.PI / 180);
  }
  for (const p of points) {
    if (!group.length) { reset(p); continue; }
    const previous = group[group.length - 1];
    const gap = p.at - previous.at;
    const distanceFromCenter = haversineMeters(p,center());
    if (gap <= 0 || gap > maxGapMs || distanceFromCenter > radiusMeters) {
      flush();
      reset(p);
    } else {
      group.push(p);
      sumLat += p.latitude;
      sumLonSin += Math.sin(p.longitude * Math.PI / 180);
      sumLonCos += Math.cos(p.longitude * Math.PI / 180);
    }
  }
  flush();
  return visits.sort((a,b) => b.departedAt.localeCompare(a.departedAt));
}
