import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emailAddress, hashPassword, verifyPassword, pointInput, positiveLimit,
  secureEquals, uuid, HttpError, newToken, coordinateParam, radiusParam
} from '../src/security.mjs';

test('email canonicalization and rejection', () => {
  assert.equal(emailAddress('  Person@Example.COM  '), 'person@example.com');
  assert.throws(() => emailAddress('not-an-address'), HttpError);
});
test('strong scrypt hashing and constant-time credential verification', async () => {
  const record = await hashPassword('very-strong-password-123');
  assert.match(record, /^scrypt:/);
  assert.notEqual(record, await hashPassword('very-strong-password-123'));
  assert.equal(await verifyPassword('very-strong-password-123', record), true);
  assert.equal(await verifyPassword('wrong', record), false);
  assert.equal(await verifyPassword('irrelevant', 'invalid'), false);
  assert.rejects(hashPassword('short'), HttpError);
});
test('token entropy, digest comparison and uuid format', () => {
  assert.notEqual(newToken(), newToken());
  assert.equal(secureEquals('alpha', 'alpha'), true);
  assert.equal(secureEquals('alpha', 'beta'), false);
  assert.equal(uuid('6b0740d1-347b-47f0-b0c7-8581fc75163a'), '6b0740d1-347b-47f0-b0c7-8581fc75163a');
  assert.throws(() => uuid('bad'));
});
test('coordinates and measurement boundaries', () => {
  const p = pointInput({ latitude: 0, longitude: 180, accuracyM: 10 });
  assert.equal(p.longitude, 180);
  assert.match(p.capturedAt, /^\d{4}-/);
  for (const v of [
    { latitude: 91, longitude: 0 },
    { latitude: 0, longitude: -181 },
    { latitude: '0', longitude: 0 },
    { latitude: NaN, longitude: 0 },
    { latitude: 0, longitude: 0, accuracyM: -1 },
    { latitude: 0, longitude: 0, capturedAt: 'nonsense' },
    { latitude: 0, longitude: 0, capturedAt: '3000-01-01' }
  ]) assert.throws(() => pointInput(v), HttpError);
});
test('client idempotency key validation', () => {
  const valid = pointInput({ latitude: 0, longitude: 0, clientKey: 'traccar_abc-123:device.0' });
  assert.equal(valid.clientKey, 'traccar_abc-123:device.0');
  for (const value of ['', 'hello world', 'x'.repeat(161), 'secret?foo=bar', 22, [], {}]) {
    assert.throws(() => pointInput({ latitude: 0, longitude: 0, clientKey: value }), HttpError);
  }
  assert.equal(pointInput({ latitude: 0, longitude: 0 }).clientKey, null);
});
test('private geospatial query parameters are finite, bounded, and syntax-checked', () => {
  assert.equal(coordinateParam('-86.7',-180,180,'longitude'),-86.7);
  assert.equal(coordinateParam('90',-90,90,'latitude'),90);
  assert.equal(radiusParam(null),1000);
  assert.equal(radiusParam('25000'),25000);
  assert.equal(radiusParam('12.5'),12.5);
  for (const invalid of ['91','-91','NaN','Infinity','1e1','0;DROP TABLE',' 1',null]) {
    assert.throws(()=>coordinateParam(invalid,-90,90,'latitude'),HttpError);
  }
  for (const invalid of ['0','25001','Infinity','1e3','-1','1.234','123456',{},'4 km']) {
    assert.throws(()=>radiusParam(invalid),HttpError);
  }
});
test('pagination is bounded and numeric', () => {
  assert.equal(positiveLimit(null), 500);
  assert.equal(positiveLimit('20'), 20);
  for (const v of ['1e3', '-1', '1001', 'nope', '0']) assert.throws(() => positiveLimit(v), HttpError);
});
