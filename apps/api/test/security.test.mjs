import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emailAddress, hashPassword, verifyPassword, pointInput, positiveLimit,
  secureEquals, uuid, HttpError, newToken
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
test('pagination is bounded and numeric', () => {
  assert.equal(positiveLimit(null), 500);
  assert.equal(positiveLimit('20'), 20);
  for (const v of ['1e3', '-1', '1001', 'nope', '0']) assert.throws(() => positiveLimit(v), HttpError);
});
