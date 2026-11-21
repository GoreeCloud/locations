/**
 * Local form-only validation. Coordinates are kept in the authenticated JSON
 * request body, never serialized into URLs, browser history or diagnostics.
 */
export function nearbyBody(latitudeText, longitudeText, radiusText = '1000') {
  function coordinate(value, minimum, maximum, name) {
    if (typeof value !== 'string' || !/^-?\d{1,3}(?:\.\d{1,10})?$/.test(value.trim())) {
      throw new Error('Enter a valid ' + name + ' as a decimal number.');
    }
    const number = Number(value.trim());
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
      throw new Error(name + ' must be between ' + minimum + ' and ' + maximum + '.');
    }
    return number;
  }
  const latitude = coordinate(latitudeText, -90, 90, 'Latitude');
  const longitude = coordinate(longitudeText, -180, 180, 'Longitude');
  const radiusMeters = Number(radiusText);
  if (!['250','1000','5000','25000'].includes(String(radiusText)) || !Number.isFinite(radiusMeters)) {
    throw new Error('Select a supported search radius.');
  }
  return { latitude, longitude, radiusMeters, limit:100 };
}
