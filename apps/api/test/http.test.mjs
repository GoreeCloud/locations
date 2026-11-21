import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { makeHandler } from '../src/app.mjs';

const db = {
  query: async () => ({ rows: [{ '?column?': 1 }], rowCount: 1 })
};
async function withServer(run) {
  const server = createServer(makeHandler(db, { bootstrapToken: '0123456789abcdef0123456789abcdef', webOrigin: 'http://localhost:5173' }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run('http://127.0.0.1:' + server.address().port); }
  finally { await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve())); }
}
test('health is minimal, does not disclose server configuration', () => withServer(async origin => {
  const res = await fetch(origin + '/healthz');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
  assert.equal(res.headers.get('cache-control'), 'no-store');
}));
test('all private APIs require a bearer session', () => withServer(async origin => {
  for (const path of ['/v1/me','/v1/locations','/v1/trips','/v1/locations/latest','/v1/circles','/v1/export/geojson']) {
    const res = await fetch(origin + path);
    assert.equal(res.status, 401, path);
    assert.equal((await res.json()).error, 'Authentication required');
  }
}));
test('CORS only trusts the configured origin', () => withServer(async origin => {
  const safe = await fetch(origin + '/healthz', { headers: { Origin: 'http://localhost:5173' } });
  assert.equal(safe.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const unsafe = await fetch(origin + '/healthz', { headers: { Origin: 'https://example.invalid' } });
  assert.equal(unsafe.headers.get('access-control-allow-origin'), null);
}));
test('bootstrap rejects wrong setup token before database mutations', () => withServer(async origin => {
  const res = await fetch(origin + '/v1/auth/bootstrap', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bootstrapToken: 'wrong', email: 'owner@example.org', password: 'correct-password-123' })
  });
  assert.equal(res.status, 401);
}));
test('request body parser rejects malformed input', () => withServer(async origin => {
  const res = await fetch(origin + '/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
}));

test('login throttles one network peer despite rotating identities or spoofed forwarding headers', () => withServer(async origin => {
  const status = [];
  for (let i = 0; i < 41; i++) {
    const res = await fetch(origin + '/v1/auth/login', {
      method:'POST',
      headers:{'Content-Type':'application/json','X-Forwarded-For':'192.0.2.' + (i%250+1)},
      body:JSON.stringify({email:'rotating-' + i + '@example.invalid',password:'wrong-password'})
    });
    status.push(res.status);
  }
  assert.equal(status.filter(s=>s===401).length,40);
  assert.equal(status[40],429);
}));

test('bootstrap budget limits repeated invalid setup credentials before database work', () => withServer(async origin => {
  for (let i = 0; i < 8; i++) {
    const res = await fetch(origin + '/v1/auth/bootstrap',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({bootstrapToken:'incorrect',email:'owner@example.invalid',password:'fake-password-value'})
    });
    assert.equal(res.status,401);
  }
  const rejected = await fetch(origin + '/v1/auth/bootstrap',{
    method:'POST',headers:{'Content-Type':'application/json'},body:'{bad'
  });
  assert.equal(rejected.status,429);
}));
