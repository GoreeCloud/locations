import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createDatabase } from '../src/database.mjs';
import { makeHandler } from '../src/app.mjs';

// Never point this test at real user data. Only localhost + explicitly named disposable DB.
const rawUrl = process.env.TEST_DATABASE_URL;
test('PostGIS: private accounts, circle consent, retention and export/deletion', { skip: !rawUrl }, async () => {
  const target = new URL(rawUrl);
  if (!['127.0.0.1','localhost'].includes(target.hostname) || target.pathname !== '/locations_test') {
    throw new Error('Refusing integration test against non-local or non-locations_test database');
  }
  const db = createDatabase(rawUrl);
  const server = createServer(makeHandler(db, {
    bootstrapToken: 'synthetic-bootstrap-token-for-integration-testing-only',
    webOrigin: 'http://localhost:5173',
  }));
  let base = '';
  const suffix = randomUUID();
  const aliceEmail = 'alice-' + suffix + '@example.invalid';
  const bobEmail = 'bob-' + suffix + '@example.invalid';
  const charlieEmail = 'charlie-' + suffix + '@example.invalid';
  const password = 'synthetic-private-test-password-1234';
  async function call(method, path, token, data, expectedStatus) {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    const payload = await res.json();
    if (expectedStatus !== undefined) {
      assert.equal(res.status, expectedStatus, method + ' ' + path + ' ' + JSON.stringify(payload));
    }
    return { status: res.status, payload };
  }
  try {
    await db.initialize();
    const existing = await db.query('SELECT COUNT(*)::int AS n FROM accounts');
    assert.equal(existing.rows[0].n, 0, 'Integration DB must start empty');
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = 'http://127.0.0.1:' + server.address().port;
    // The owner is created exactly once. Nothing is recorded or shared by default.
    const initialized = await call('POST','/v1/auth/bootstrap',null, {
      bootstrapToken: 'synthetic-bootstrap-token-for-integration-testing-only',
      email: aliceEmail, password
    },201);
    const alice = initialized.payload.account;
    const aliceToken = initialized.payload.token;
    assert.equal((await call('GET','/v1/me',aliceToken,null,200)).payload.account.recording_enabled,false);
    await call('POST','/v1/auth/bootstrap',null,{
      bootstrapToken:'synthetic-bootstrap-token-for-integration-testing-only',
      email:'second-' + suffix + '@example.invalid', password
    },409);
    const point = { latitude:32.7, longitude:-86.7, accuracyM:12, source:'synthetic', capturedAt:new Date().toISOString() };
    await call('POST','/v1/locations',aliceToken,point,403);
    await call('PATCH','/v1/privacy',aliceToken,{recordingEnabled:true},200);
    await call('POST','/v1/locations',aliceToken,point,201);
    assert.equal((await call('GET','/v1/locations',aliceToken,null,200)).payload.positions.length,1);
    const circleId = (await call('POST','/v1/circles',aliceToken,{name:'Synthetic family'},201)).payload.circle.id;
    const inviteBob = (await call('POST','/v1/circles/'+circleId+'/invites',aliceToken,{},201)).payload.inviteToken;
    const joinedBob = await call('POST','/v1/auth/join',null,{email:bobEmail,password,inviteToken:inviteBob},201);
    const bobToken = joinedBob.payload.token;
    const bobId = joinedBob.payload.account.id;
    assert.equal((await call('GET','/v1/circles',bobToken,null,200)).payload.circles[0].sharing_enabled,false);
    // Token is one-use and cannot register or invite a different person.
    await call('POST','/v1/auth/join',null,{email:'duplicate-'+suffix+'@example.invalid',password,inviteToken:inviteBob},404);
    await call('GET','/v1/locations?userId='+alice.id,bobToken,null,404);
    assert.equal((await call('GET','/v1/locations/latest',bobToken,null,200)).payload.positions.length,0);
    await call('PATCH','/v1/circles/'+circleId+'/sharing',aliceToken,{enabled:true},200);
    assert.equal((await call('GET','/v1/locations?userId='+alice.id,bobToken,null,200)).payload.positions.length,1);
    assert.equal((await call('GET','/v1/locations/latest',bobToken,null,200)).payload.positions.length,1);
    // Sharing another member's points requires BOTH their recording and individual sharing enabled.
    await call('POST','/v1/locations',bobToken,{...point,latitude:32.8},403);
    await call('PATCH','/v1/privacy',bobToken,{recordingEnabled:true},200);
    await call('POST','/v1/locations',bobToken,{...point,latitude:32.8},201);
    await call('GET','/v1/locations?userId='+bobId,aliceToken,null,404);
    await call('PATCH','/v1/circles/'+circleId+'/sharing',bobToken,{enabled:true},200);
    assert.equal((await call('GET','/v1/locations?userId='+bobId,aliceToken,null,200)).payload.positions.length,1);
    // A person in a separate circle must not see Bob's position.
    const separateCircle = (await call('POST','/v1/circles',aliceToken,{name:'Separate circle'},201)).payload.circle.id;
    const inviteCharlie = (await call('POST','/v1/circles/'+separateCircle+'/invites',aliceToken,{},201)).payload.inviteToken;
    const charlieToken = (await call('POST','/v1/auth/join',null,{
      email:charlieEmail,password,inviteToken:inviteCharlie
    },201)).payload.token;
    await call('GET','/v1/locations?userId='+bobId,charlieToken,null,404);
    await call('PATCH','/v1/circles/'+circleId+'/sharing',bobToken,{enabled:false},200);
    await call('GET','/v1/locations?userId='+bobId,aliceToken,null,404);
    await call('PATCH','/v1/circles/'+circleId+'/sharing',aliceToken,{enabled:false},200);
    await call('GET','/v1/locations?userId='+alice.id,bobToken,null,404);
    // A false recording preference also invalidates sharing without erasing owner-visible history.
    await call('PATCH','/v1/circles/'+circleId+'/sharing',aliceToken,{enabled:true},200);
    await call('PATCH','/v1/privacy',aliceToken,{recordingEnabled:false},200);
    await call('GET','/v1/locations?userId='+alice.id,bobToken,null,404);
    assert.equal((await call('GET','/v1/locations',aliceToken,null,200)).payload.positions.length,1);
    await call('POST','/v1/locations',aliceToken,point,403);
    // Export is account-scoped, and deletion has no effect on another account's positions.
    const geo = (await call('GET','/v1/export/geojson',aliceToken,null,200)).payload;
    assert.equal(geo.type,'FeatureCollection');
    assert.equal(geo.features.length,1);
    assert.deepEqual(geo.features[0].geometry.coordinates,[-86.7,32.7]);
    const batch = await call('POST','/v1/locations/batch',bobToken,{
      positions:[{...point,latitude:40},{...point,latitude:99}]
    },400);
    assert.match(batch.payload.error,/Coordinates out of range/);
    assert.equal((await call('GET','/v1/locations',bobToken,null,200)).payload.positions.length,1);
    // Retention uses capture time, never received time; no deletion of recent points.
    await call('PATCH','/v1/privacy',bobToken,{retentionDays:1},200);
    await call('POST','/v1/locations',bobToken,{...point,latitude:34,capturedAt:new Date(Date.now()-3*86400000).toISOString()},201);
    await db.cleanup();
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM positions WHERE account_id=$1',[bobId])).rows[0].n,1);
    assert.equal((await call('DELETE','/v1/me/locations',aliceToken,null,200)).payload.deleted,1);
    assert.equal((await call('GET','/v1/locations',aliceToken,null,200)).payload.positions.length,0);
    assert.equal((await call('GET','/v1/locations',bobToken,null,200)).payload.positions.length,1);
    // Trip inference is scoped to the requesting account, not a shared circle.
    const startMs = Date.now() - 20 * 60000;
    const samples = [0, 300, 600].map((seconds,i) => ({
      ...point,
      latitude: 32.8 + i * 0.005,
      longitude: -86.7 + i * 0.005,
      capturedAt: new Date(startMs + seconds * 1000).toISOString()
    }));
    await call('POST','/v1/locations/batch',bobToken,{positions:samples},201);
    const ownTrips = (await call('GET','/v1/trips',bobToken,null,200)).payload;
    assert.ok(ownTrips.trips.length >= 1);
    assert.ok(ownTrips.trips[0].distanceMeters > 500);
    assert.equal(ownTrips.methodology,'heuristic-offline-v1');
    assert.equal((await call('GET','/v1/trips',charlieToken,null,200)).payload.trips.length,0);
    await call('GET','/v1/trips?userId='+bobId,charlieToken,null,400);
    // A logged-out bearer token is unusable, including for history.
    await call('POST','/v1/auth/logout',aliceToken,null,200);
    await call('GET','/v1/me',aliceToken,null,401);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    try {
      await db.query('DELETE FROM accounts WHERE email=ANY($1::text[])',[[aliceEmail,bobEmail,charlieEmail]]);
    } finally {
      await db.pool.end();
    }
  }
});
