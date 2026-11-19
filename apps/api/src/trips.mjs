// Offline, deterministic trip estimates. No geocoding, network calls, AI, or outside analytics.
// Callers must enforce account-scoped authorization before invoking this module.
const EARTH_RADIUS_M = 6371008.8;
const radians = deg => deg * Math.PI / 180;

export function haversineMeters(a, b) {
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const q = Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(Math.max(0, q))));
}

function asPoint(row) {
  if (!row || typeof row !== 'object') return null;
  const latitude = Number(row.latitude), longitude = Number(row.longitude);
  const at = new Date(row.captured_at ?? row.capturedAt).valueOf();
  const accuracy = row.accuracy_m ?? row.accuracyM;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      !Number.isFinite(at)) return null;
  return { latitude, longitude, at, accuracyM: accuracy == null ? 0 : Math.max(0, Number(accuracy) || 0) };
}

/** Heuristic trip estimates, never a geofence/safety or arrival oracle. */
export function inferTrips(rows, {
  minDistanceMeters = 350, minDurationMs = 60000, minPoints = 3,
  maxGapMs = 45 * 60000, maxSpeedKmh = 220, minStepMeters = 30
} = {}) {
  if (!Array.isArray(rows)) throw new TypeError('Expected array of positions');
  const points = rows.map(asPoint).filter(Boolean).sort((a,b) => a.at - b.at);
  const results = [];
  let group = [], meters = 0;
  function flush() {
    if (group.length < minPoints || meters < minDistanceMeters) return;
    const first = group[0], last = group[group.length - 1];
    const durationMs = last.at - first.at;
    if (durationMs < minDurationMs) return;
    results.push({
      startedAt: new Date(first.at).toISOString(),
      endedAt: new Date(last.at).toISOString(),
      durationSeconds: Math.round(durationMs / 1000),
      distanceMeters: Math.round(meters),
      pointCount: group.length,
      start: { latitude: first.latitude, longitude: first.longitude },
      end: { latitude: last.latitude, longitude: last.longitude },
      geometry: { type: 'LineString', coordinates: group.map(p => [p.longitude, p.latitude]) }
    });
  }
  for (const point of points) {
    if (!group.length) { group = [point]; continue; }
    const prev = group[group.length - 1], gap = point.at - prev.at;
    const distance = haversineMeters(prev, point);
    const speedKmh = gap > 0 ? distance / gap * 3600 : Infinity;
    if (gap <= 0 || gap > maxGapMs || speedKmh > maxSpeedKmh) {
      flush(); group = [point]; meters = 0; continue;
    }
    group.push(point);
    const confidenceThreshold = Math.max(minStepMeters, prev.accuracyM, point.accuracyM);
    if (distance >= confidenceThreshold) meters += distance;
  }
  flush();
  return results.sort((a,b) => b.endedAt.localeCompare(a.endedAt));
}
