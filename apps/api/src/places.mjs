import { HttpError, coordinateInput } from './security.mjs';

// Personal-only saved locations are not geofence triggers, location alerts, or
// member-visible places. No third-party reverse geocoding or place inference.
export function privatePlaceInput(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !['name','latitude','longitude','radiusMeters'].includes(k))) {
    throw new HttpError(400, 'Invalid private place');
  }
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  if (name.length < 1 || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new HttpError(400, 'Place name must contain 1–80 printable characters');
  }
  const latitude = coordinateInput(value.latitude,-90,90,'latitude');
  const longitude = coordinateInput(value.longitude,-180,180,'longitude');
  const radiusMeters = value.radiusMeters ?? 125;
  if (!Number.isSafeInteger(radiusMeters) || radiusMeters < 50 || radiusMeters > 5000) {
    throw new HttpError(400,'Place radius must be a whole number between 50 and 5000 meters');
  }
  return { name, latitude, longitude, radiusMeters };
}
