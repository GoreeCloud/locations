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
    // Inspect real PostGIS extension, policy constraints and privacy/replay indexes.
    const postgis = await db.query("SELECT extname FROM pg_extension WHERE extname='postgis'");
    assert.equal(postgis.rowCount,1,'PostGIS extension must be installed');
    const indices = await db.query("SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND tablename='positions'");
    const indexNames = new Set(indices.rows.map(x=>x.indexname));
    for (const name of ['positions_pkey','positions_account_time_idx','positions_account_client_key_idx','positions_geography_idx']) {
      assert.ok(indexNames.has(name),'Missing required privacy/scalability index: '+name);
    }
    const constraints = await db.query("SELECT conname FROM pg_constraint WHERE conrelid='positions'::regclass");
    const constraintNames = new Set(constraints.rows.map(x=>x.conname));
    for (const name of ['positions_account_id_fkey','positions_latitude_check','positions_longitude_check','positions_accuracy_m_check']) {
      assert.ok(constraintNames.has(name),'Missing required position constraint: '+name);
    }
    const existing = await db.query('SELECT COUNT(*)::int AS n FROM accounts');
    assert.equal(existing.rows[0].n, 0, 'Integration DB must start empty');
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = 'http://127.0.0.1:' + server.address().port;
    // The owner is created exactly once. Nothing is recorded or shared by default.
    const bootstrapPayload = {
      bootstrapToken: 'synthetic-bootstrap-token-for-integration-testing-only',
      email: aliceEmail, password
    };
    const competing = await Promise.all([
      call('POST','/v1/auth/bootstrap',null,bootstrapPayload),
      call('POST','/v1/auth/bootstrap',null,bootstrapPayload)
    ]);
    assert.deepEqual(competing.map(x=>x.status).sort(),[201,409],
      'Concurrent bootstrap requests must create exactly one owner');
    const initialized = competing.find(x=>x.status===201);
    const alice = initialized.payload.account;
    const aliceToken = initialized.payload.token;
    assert.equal((await call('GET','/v1/me',aliceToken,null,200)).payload.account.recording_enabled,false);
    // Each account can list only its own active sessions and revoke others with a password.
    const aliceOtherToken = (await call('POST','/v1/auth/login',null,{email:aliceEmail,password},200)).payload.token;
    const sessionsBefore = (await call('GET','/v1/me/sessions',aliceToken,null,200)).payload.sessions;
    assert.equal(sessionsBefore.length,2);
    assert.equal(sessionsBefore.filter(s => s.current).length,1);
    assert.equal(sessionsBefore.some(s => 'token_hash' in s || 'token' in s),false);
    assert.equal((await call('GET','/v1/me/sessions',aliceOtherToken,null,200)).payload.sessions.length,2);
    await call('POST','/v1/me/sessions/revoke-others',aliceToken,{password:'invalid'},401);
    assert.equal((await call('POST','/v1/me/sessions/revoke-others',aliceToken,{password},200)).payload.revoked,1);
    await call('GET','/v1/me',aliceOtherToken,null,401);
    assert.equal((await call('GET','/v1/me/sessions',aliceToken,null,200)).payload.sessions.length,1);
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
    const attempts = await Promise.all([
      call('POST','/v1/auth/join',null,{email:bobEmail,password,inviteToken:inviteBob}),
      call('POST','/v1/auth/join',null,{email:bobEmail,password,inviteToken:inviteBob})
    ]);
    assert.deepEqual(attempts.map(x=>x.status).sort(),[201,404],
      'Concurrent redemptions of a single-use token must produce exactly one member');
    const joinedBob = attempts.find(x=>x.status===201);
    const bobToken = joinedBob.payload.token;
    const bobId = joinedBob.payload.account.id;
    // Places are account-owned labels, never visible to a sharing circle.
    const privateHome = {
      name:'Synthetic private home', latitude:32.7, longitude:-86.7, radiusMeters:125
    };
    const alicePlace = (await call('POST','/v1/me/places',aliceToken,privateHome,201)).payload.place;
    assert.equal(alicePlace.name,privateHome.name);
    assert.equal(alicePlace.radius_m,125);
    assert.equal((await call('GET','/v1/me/places',aliceToken,null,200)).payload.places.length,1);
    assert.equal((await call('GET','/v1/me/places',bobToken,null,200)).payload.places.length,0);
    await call('DELETE','/v1/me/places/'+alicePlace.id,bobToken,{confirmName:privateHome.name},404);
    await call('DELETE','/v1/me/places/'+alicePlace.id,aliceToken,{confirmName:'wrong name'},404);
    await call('POST','/v1/me/places?latitude=33',aliceToken,privateHome,400);
    await call('POST','/v1/me/places',aliceToken,{...privateHome,accountId:bobId},400);
    await call('POST','/v1/me/places',aliceToken,{...privateHome,latitude:99},400);
    await call('DELETE','/v1/me/places/'+alicePlace.id,aliceToken,{confirmName:privateHome.name},200);
    assert.equal((await call('GET','/v1/me/places',aliceToken,null,200)).payload.places.length,0);
    // One place remains to verify cascade, and parallel requests respect the 25-place cap.
    await call('POST','/v1/me/places',aliceToken,{...privateHome,name:'Private place deleted with account'},201);
    const crowded = await Promise.all(Array.from({length:25},(_,i) =>
      call('POST','/v1/me/places',aliceToken,{...privateHome,name:'Synthetic place '+i})
    ));
    assert.equal(crowded.filter(x=>x.status===201).length,24);
    assert.equal(crowded.filter(x=>x.status===409).length,1);
    assert.equal((await call('GET','/v1/me/places',aliceToken,null,200)).payload.places.length,25);
    assert.equal((await call('GET','/v1/circles',bobToken,null,200)).payload.circles[0].sharing_enabled,false);
    // Token is one-use and cannot register or invite a different person.
    await call('POST','/v1/auth/join',null,{email:'duplicate-'+suffix+'@example.invalid',password,inviteToken:inviteBob},404);
    await call('POST','/v1/auth/join',null,{email:'bad-'+suffix+'@example.invalid',password,inviteToken:'invalid-token'},400);
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
    // No coordinates in URLs: spatial search accepts authenticated JSON POST bodies only.
    // Shared circle membership never grants this personal PostGIS vicinity endpoint.
    const vicinity = {latitude:32.8,longitude:-86.7,radiusMeters:200};
    const nearbyBob = (await call('POST','/v1/locations/nearby',bobToken,vicinity,200)).payload;
    assert.ok(nearbyBob.positions.some(p=>Math.abs(p.latitude-32.8)<0.000001));
    assert.ok(nearbyBob.positions.every(p=>Number(p.distance_m)<=200));
    assert.equal(nearbyBob.radiusMeters,200);
    assert.equal((await call('POST','/v1/locations/nearby',aliceToken,vicinity,200)).payload.positions.length,0);
    assert.equal((await call('POST','/v1/locations/nearby',charlieToken,vicinity,200)).payload.positions.length,0);
    assert.equal((await call('POST','/v1/locations/nearby',aliceToken,{...vicinity,latitude:32.7},200)).payload.positions.length,1);
    await call('POST','/v1/locations/nearby',aliceToken,{...vicinity,userId:bobId},400);
    await call('POST','/v1/locations/nearby',bobToken,{...vicinity,latitude:91},400);
    await call('POST','/v1/locations/nearby',bobToken,{...vicinity,longitude:-181},400);
    await call('POST','/v1/locations/nearby',bobToken,{...vicinity,radiusMeters:0},400);
    await call('POST','/v1/locations/nearby',bobToken,{...vicinity,limit:1001},400);
    await call('POST','/v1/locations/nearby',bobToken,{...vicinity,latitude:'32.8'},400);
    await call('POST','/v1/locations/nearby?unexpected=yes',bobToken,vicinity,400);
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
    const beforeInvalidBatch = (await db.query('SELECT COUNT(*)::int AS n FROM positions WHERE account_id=$1',[bobId])).rows[0].n;
    const oversized = await call('POST','/v1/locations/batch',bobToken,{ positions:Array(501).fill(point) },400);
    assert.match(oversized.payload.error,/Invalid positions batch/);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM positions WHERE account_id=$1',[bobId])).rows[0].n,beforeInvalidBatch);
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
    // Retries are atomic and idempotent per account, without leaking client keys into stored rows.
    const keyed = { ...point, clientKey: 'integration_replay_cross_account_2026' };
    assert.deepEqual((await call('POST','/v1/locations',bobToken,keyed,201)).payload, {accepted:1,duplicates:0});
    assert.deepEqual((await call('POST','/v1/locations',bobToken,keyed,201)).payload, {accepted:0,duplicates:1});
    assert.deepEqual((await call('POST','/v1/locations/batch',bobToken,{positions:[keyed,keyed]},201)).payload, {accepted:0,duplicates:2});
    const hashed = await db.query('SELECT client_key_hash FROM positions WHERE account_id=$1 AND source=$2 AND client_key_hash IS NOT NULL',[bobId,'synthetic']);
    assert.equal(hashed.rows.length,1);
    assert.match(hashed.rows[0].client_key_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(hashed.rows[0].client_key_hash, keyed.clientKey);
    await call('PATCH','/v1/privacy',aliceToken,{recordingEnabled:true},200);
    assert.deepEqual((await call('POST','/v1/locations',aliceToken,keyed,201)).payload, {accepted:1,duplicates:0});
    await call('PATCH','/v1/privacy',aliceToken,{recordingEnabled:false},200);
    // Account-only cursor pagination yields every saved point exactly once.
    const expected = (await db.query('SELECT COUNT(*)::int AS n FROM positions WHERE account_id=$1',[bobId])).rows[0].n;
    let beforeId = null;
    const ids = [];
    let finished = false;
    for (let page = 0; page < 30; page++) {
      const suffix = beforeId ? '&beforeId=' + encodeURIComponent(beforeId) : '';
      const data = (await call('GET','/v1/export/geojson/page?limit=2' + suffix,bobToken,null,200)).payload;
      assert.equal(data.type, 'FeatureCollection');
      assert.ok(data.features.length <= 2);
      for (const feature of data.features) {
        assert.equal(feature.geometry.type,'Point');
        ids.push(feature.id);
      }
      if (!data.hasMore) {
        assert.equal(data.nextBeforeId, null);
        finished = true;
        break;
      }
      assert.match(data.nextBeforeId, /^[1-9][0-9]*$/);
      beforeId = data.nextBeforeId;
    }
    assert.equal(finished, true);
    assert.equal(ids.length, expected);
    assert.equal(new Set(ids).size, expected);
    assert.equal((await call('GET','/v1/export/geojson/page',charlieToken,null,200)).payload.features.length,0);
    await call('GET','/v1/export/geojson/page?limit=0',bobToken,null,400);
    await call('GET','/v1/export/geojson/page?beforeId=-1',bobToken,null,400);
    await call('GET','/v1/export/geojson/page?beforeId=9223372036854775808',bobToken,null,400);
    // Visit estimates are derived only from personal history. Circle access never grants this endpoint.
    const visitStart = Date.now() - 40*60000;
    const visitPoints = [0,300,600,900].map((seconds,i) => ({
      latitude:32.2 + (i%2)*0.00001, longitude:-86.2,
      accuracyM:8, capturedAt:new Date(visitStart + seconds*1000).toISOString(),
      source:'synthetic_visit'
    }));
    assert.equal((await call('POST','/v1/locations/batch',bobToken,{positions:visitPoints},201)).payload.accepted,4);
    const ownVisits = (await call('GET','/v1/visits',bobToken,null,200)).payload;
    assert.equal(ownVisits.methodology,'heuristic-private-visits-v1');
    assert.ok(ownVisits.visits.some(v => v.pointCount >= 4 && Math.abs(v.latitude-32.2)<0.0001));
    assert.equal((await call('GET','/v1/visits',charlieToken,null,200)).payload.visits.length,0);
    await call('GET','/v1/visits?userId='+bobId,charlieToken,null,400);
    await call('GET','/v1/visits?points=0',bobToken,null,400);
    await call('GET','/v1/visits?from=not-a-date',bobToken,null,400);
    // A logged-out bearer token is unusable, including for history.
    await call('POST','/v1/auth/logout',aliceToken,null,200);
    await call('GET','/v1/me',aliceToken,null,401);

    // Deletion requires current password, exact confirmation, and no shared owned circles.
    const currentAliceToken = (await call('POST','/v1/auth/login',null,{email:aliceEmail,password},200)).payload.token;
    await call('DELETE','/v1/me',currentAliceToken,{password},400);
    await call('DELETE','/v1/me',currentAliceToken,{password:'incorrect-password-1234',confirmation:'DELETE ACCOUNT'},401);
    await call('DELETE','/v1/me',currentAliceToken,{password,confirmation:'DELETE ACCOUNT'},409);
    await call('DELETE','/v1/circles/'+circleId,bobToken,{confirmName:'Synthetic family'},403);
    await call('DELETE','/v1/circles/'+circleId,currentAliceToken,{confirmName:'wrong name'},400);
    // A member can leave without owner approval, immediately withdrawing location visibility.
    await call('POST','/v1/circles/'+circleId+'/leave',bobToken,{},200);
    await call('GET','/v1/locations?userId='+bobId,currentAliceToken,null,404);
    await call('GET','/v1/locations?userId='+alice.id,bobToken,null,404);
    assert.ok((await call('GET','/v1/locations',bobToken,null,200)).payload.positions.length>=1);
    await call('POST','/v1/circles/'+circleId+'/leave',bobToken,{},404);
    await call('DELETE','/v1/circles/'+circleId,currentAliceToken,{confirmName:'Synthetic family'},200);
    assert.equal((await call('GET','/v1/circles',bobToken,null,200)).payload.circles.length,0);
    assert.ok((await db.query('SELECT COUNT(*)::int AS n FROM positions WHERE account_id=$1',[bobId])).rows[0].n >= 1);
    await call('DELETE','/v1/circles/'+separateCircle,currentAliceToken,{confirmName:'Separate circle'},200);
    assert.equal((await call('GET','/v1/circles',charlieToken,null,200)).payload.circles.length,0);
    await call('DELETE','/v1/me',currentAliceToken,{password,confirmation:'DELETE ACCOUNT'},200);
    assert.equal((await db.query('SELECT count(*)::integer AS n FROM saved_places WHERE account_id=$1',[alice.id])).rows[0].n,0);
    await call('GET','/v1/me',currentAliceToken,null,401);
    await call('POST','/v1/auth/login',null,{email:aliceEmail,password},401);
    assert.ok((await call('GET','/v1/locations',bobToken,null,200)).payload.positions.length>=1);
    await call('DELETE','/v1/me',bobToken,{password,confirmation:'DELETE ACCOUNT'},200);
    await call('GET','/v1/me',bobToken,null,401);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM positions WHERE account_id=$1',[bobId])).rows[0].n,0);
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    try {
      await db.query('DELETE FROM accounts WHERE email=ANY($1::text[])',[[aliceEmail,bobEmail,charlieEmail]]);
    } finally {
      await db.pool.end();
    }
  }
});
