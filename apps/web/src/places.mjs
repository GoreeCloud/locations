import { nearbyBody } from './nearby.mjs';

// Client validation mirrors (does not replace) the authenticated server contract.
// Only a direct user action sends the label and coordinates in an HTTPS JSON body.
export function privatePlaceBody(nameText, latitudeText, longitudeText, radiusText='250') {
  const name = typeof nameText === 'string' ? nameText.trim() : '';
  if (name.length < 1 || name.length > 80 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error('Choose a printable place name of 1–80 characters.');
  }
  const { latitude, longitude, radiusMeters } = nearbyBody(latitudeText,longitudeText,radiusText);
  if (radiusMeters > 5000) throw new Error('Saved place radius must not exceed 5 kilometers.');
  return { name,latitude,longitude,radiusMeters };
}
