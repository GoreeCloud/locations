import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthLimiter } from '../src/auth-limit.mjs';
import { HttpError } from '../src/security.mjs';

test('per-address authentication limits cannot be evaded by cycling email addresses', () => {
  const limiter = createAuthLimiter();
  for (let attempt = 0; attempt < 40; attempt++) {
    limiter.checkIp('127.0.0.1', 'login');
    limiter.checkIdentity('different-' + attempt + '@example.invalid', 'login');
  }
  assert.throws(() => limiter.checkIp('127.0.0.1','login'), e => e instanceof HttpError && e.status === 429);
  limiter.checkIp('192.0.2.5', 'login');
});

test('per-account limit applies even when attacker changes source address', () => {
  const limiter = createAuthLimiter();
  for (let attempt = 0; attempt < 12; attempt++) {
    limiter.checkIp('192.0.2.' + attempt, 'login');
    limiter.checkIdentity('target@example.invalid', 'login');
  }
  assert.throws(() => limiter.checkIdentity('target@example.invalid','login'),
    e => e instanceof HttpError && e.status === 429);
  limiter.checkIdentity('another@example.invalid', 'login');
});

test('revoke-others and account-erasure password checks have a small budget', () => {
  const limiter = createAuthLimiter();
  for (let i = 0; i < 8; i++) limiter.checkIdentity('account-uuid','password');
  assert.throws(() => limiter.checkIdentity('account-uuid','password'),
    e => e instanceof HttpError && e.status === 429);
});

test('rolling window resets after expiry and storage remains bounded', () => {
  let now = 0;
  const limiter = createAuthLimiter({ clock: () => now, maxEntries: 4 });
  for (let i = 0; i < 40; i++) limiter.checkIp('127.0.0.1','login');
  assert.throws(() => limiter.checkIp('127.0.0.1','login'),HttpError);
  now = 16 * 60_000;
  limiter.checkIp('127.0.0.1','login');
  for (let i = 0; i < 150; i++) {
    limiter.checkIp('192.0.2.' + i, 'join');
    limiter.checkIdentity('person-' + i + '@example.invalid','login');
  }
  assert.ok(limiter.sizes.byIp <= 4);
  assert.ok(limiter.sizes.byIdentity <= 4);
  assert.throws(() => createAuthLimiter({maxEntries:1}),TypeError);
});

test('unknown operations and malformed identities fail closed', () => {
  const limiter = createAuthLimiter();
  assert.throws(() => limiter.checkIp('127.0.0.1','not-an-auth-operation'),TypeError);
  assert.throws(() => limiter.checkIdentity(null,'login'),TypeError);
  assert.throws(() => limiter.checkIdentity('valid@example.invalid','invalid'),TypeError);
});
