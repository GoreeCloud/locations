// A bounded, per-API-process defensive rate limiter.
// This is NOT a distributed/authentication edge rate limiter; deployment still needs
// a trusted reverse-proxy limiter and brute-force monitoring before public exposure.
import { digest, HttpError } from './security.mjs';

const WINDOW_MS = 15 * 60_000;
function makeBucket(clock, capacity) {
  const records = new Map();
  return {
    check(key, max) {
      const now = clock();
      let record = records.get(key);
      if (!record || now >= record.expires) {
        record = { count: 0, expires: now + WINDOW_MS };
      }
      record.count++;
      // Refresh insertion order: frequently attacked keys should not be
      // removed just because the map is full of unrelated addresses.
      records.delete(key);
      records.set(key, record);
      if (records.size > capacity) {
        for (const [oldKey, item] of records) {
          if (now >= item.expires) records.delete(oldKey);
          if (records.size <= capacity) break;
        }
        while (records.size > capacity) records.delete(records.keys().next().value);
      }
      if (record.count > max) throw new HttpError(429, 'Too many attempts; try again later');
    },
    get size() { return records.size; },
  };
}

export function createAuthLimiter({ clock = Date.now, maxEntries = 10_000 } = {}) {
  if (typeof clock !== 'function' || !Number.isSafeInteger(maxEntries) || maxEntries < 2) {
    throw new TypeError('Invalid authentication limiter options');
  }
  const perIp = makeBucket(clock, maxEntries);
  const perIdentity = makeBucket(clock, maxEntries);
  return {
    checkIp(address, action) {
      // Never trust X-Forwarded-For or other attacker-controlled HTTP headers.
      const ip = typeof address === 'string' && address ? address : 'unknown';
      const limits = { bootstrap: 8, login: 40, join: 20, password: 20 };
      if (!Object.hasOwn(limits, action)) throw new TypeError('Unknown authentication action');
      perIp.check(action + ':' + ip, limits[action]);
    },
    checkIdentity(identity, action) {
      if (typeof identity !== 'string' || !['login', 'password'].includes(action)) {
        throw new TypeError('Invalid identity limiter action');
      }
      // Never retain literal account emails in this in-memory defense table.
      perIdentity.check(action + ':' + digest(identity), action === 'login' ? 12 : 8);
    },
    get sizes() { return { byIp: perIp.size, byIdentity: perIdentity.size }; },
  };
}
