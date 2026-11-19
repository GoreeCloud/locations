import { HttpError, digest, newToken, secureEquals, emailAddress, passwordInput, hashPassword, verifyPassword, uuid, pointInput, positiveLimit } from './security.mjs';

const isBool = v => typeof v === 'boolean';
const ACCESS_MS = 30 * 86400000;
const daysMs = 86400000;
const authAttempts = new Map();
function throttle(key, max = 12) {
  const now = Date.now();
  if (authAttempts.size > 10000) authAttempts.clear();
  const item = authAttempts.get(key);
  const value = !item || item.expires <= now ? { count: 0, expires: now + 15 * 60000 } : item;
  value.count++;
  authAttempts.set(key, value);
  if (value.count > max) throw new HttpError(429, 'Too many attempts; try again later');
}
function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer'
  });
  res.end(body);
}
async function body(req, maxBytes = 32768) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new HttpError(400, 'Invalid JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError(400, 'JSON object required');
  return parsed;
}
function timestamp(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime())) throw new HttpError(400, 'Invalid timestamp');
  return new Date(value).toISOString();
}
export function makeHandler(db, options) {
  if (!options || typeof options.bootstrapToken !== 'string' || options.bootstrapToken.length < 32) {
    throw new Error('BOOTSTRAP_TOKEN must contain at least 32 characters');
  }
  const allowedOrigin = options.webOrigin || '';
  async function authenticated(req) {
    const match = /^Bearer ([A-Za-z0-9_-]{32,128})$/.exec(req.headers.authorization || '');
    if (!match) throw new HttpError(401, 'Authentication required');
    const result = await db.query(
      'SELECT a.id, a.email, a.recording_enabled, a.retention_days FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=$1 AND s.expires_at>now()',
      [digest(match[1])]
    );
    if (!result.rowCount) throw new HttpError(401, 'Session expired or invalid');
    return result.rows[0];
  }
  async function issueSession(q, accountId) {
    const token = newToken();
    await q('INSERT INTO sessions(account_id,token_hash,expires_at) VALUES ($1,$2,now()+interval \'30 days\')',
      [accountId, digest(token)]);
    return { token, expiresAt: new Date(Date.now() + ACCESS_MS).toISOString() };
  }
  async function circleMember(circleId, accountId) {
    const r = await db.query('SELECT role, sharing_enabled FROM circle_members WHERE circle_id=$1 AND account_id=$2', [circleId, accountId]);
    if (!r.rowCount) throw new HttpError(404, 'Circle not found');
    return r.rows[0];
  }
  async function canRead(viewerId, ownerId) {
    if (viewerId === ownerId) return true;
    const r = await db.query(
      'SELECT EXISTS(SELECT 1 FROM accounts a JOIN circle_members m ON m.account_id=a.id JOIN circle_members viewer ON viewer.circle_id=m.circle_id WHERE a.id=$2 AND a.recording_enabled=true AND m.sharing_enabled=true AND viewer.account_id=$1) AS allowed',
      [viewerId, ownerId]
    );
    return r.rows[0]?.allowed === true;
  }
  async function handle(req, res) {
    const origin = req.headers.origin;
    res.setHeader('vary', 'Origin');
    if (allowedOrigin && origin === allowedOrigin) {
      res.setHeader('access-control-allow-origin', allowedOrigin);
      res.setHeader('access-control-allow-headers', 'Authorization, Content-Type');
      res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    }
    if (req.method === 'OPTIONS') {
      if (origin && origin !== allowedOrigin) throw new HttpError(403, 'Origin not allowed');
      res.writeHead(204); res.end(); return;
    }
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if (req.method === 'GET' && path === '/healthz') {
      await db.query('SELECT 1');
      return json(res, 200, { status: 'ok' });
    }
    if (req.method === 'POST' && path === '/v1/auth/bootstrap') {
      const input = await body(req);
      throttle('bootstrap:' + (req.socket.remoteAddress || 'unknown'), 8);
      if (!secureEquals(input.bootstrapToken, options.bootstrapToken)) throw new HttpError(401, 'Invalid bootstrap credentials');
      const email = emailAddress(input.email);
      const password = await hashPassword(passwordInput(input.password));
      const account = await db.transaction(async q => {
        await q('SELECT pg_advisory_xact_lock(83528027)');
        const existing = await q('SELECT EXISTS (SELECT 1 FROM accounts) AS found');
        if (existing.rows[0].found) throw new HttpError(409, 'Server already initialized');
        const created = await q('INSERT INTO accounts(email,password_hash) VALUES ($1,$2) RETURNING id,email', [email,password]);
        return created.rows[0];
      });
      const session = await issueSession(db.query, account.id);
      return json(res, 201, { account, ...session });
    }
    if (req.method === 'POST' && path === '/v1/auth/login') {
      const input = await body(req);
      const email = emailAddress(input.email);
      throttle('login:' + (req.socket.remoteAddress || 'unknown') + ':' + email);
      const r = await db.query('SELECT id,password_hash FROM accounts WHERE email=$1', [email]);
      const match = r.rowCount && await verifyPassword(input.password, r.rows[0].password_hash);
      if (!match) throw new HttpError(401, 'Invalid credentials');
      const session = await issueSession(db.query, r.rows[0].id);
      return json(res, 200, session);
    }
    if (req.method === 'POST' && path === '/v1/auth/join') {
      const input = await body(req);
      throttle('join:' + (req.socket.remoteAddress || 'unknown'), 20);
      const inviteToken = String(input.inviteToken || '');
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(inviteToken)) throw new HttpError(400, 'Invalid invitation');
      const email = emailAddress(input.email);
      const password = await hashPassword(passwordInput(input.password));
      const account = await db.transaction(async q => {
        const invitation = await q('SELECT circle_id FROM invites WHERE token_hash=$1 AND expires_at>now() AND used_at IS NULL FOR UPDATE', [digest(inviteToken)]);
        if (!invitation.rowCount) throw new HttpError(404, 'Invitation expired or used');
        const created = await q('INSERT INTO accounts(email,password_hash) VALUES ($1,$2) RETURNING id,email', [email,password]);
        await q('INSERT INTO circle_members(circle_id,account_id) VALUES ($1,$2)', [invitation.rows[0].circle_id,created.rows[0].id]);
        await q('UPDATE invites SET used_at=now() WHERE token_hash=$1', [digest(inviteToken)]);
        return created.rows[0];
      });
      const session = await issueSession(db.query, account.id);
      return json(res, 201, { account, ...session });
    }
    const me = await authenticated(req);
    if (req.method === 'POST' && path === '/v1/auth/logout') {
      const token = req.headers.authorization.slice(7);
      await db.query('DELETE FROM sessions WHERE account_id=$1 AND token_hash=$2', [me.id, digest(token)]);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && path === '/v1/me') {
      return json(res, 200, { account: me });
    }
    if (req.method === 'PATCH' && path === '/v1/privacy') {
      const input = await body(req);
      if (!isBool(input.recordingEnabled) && input.retentionDays === undefined) throw new HttpError(400, 'No privacy changes');
      if (input.recordingEnabled !== undefined && !isBool(input.recordingEnabled)) throw new HttpError(400, 'Invalid recording setting');
      if (input.retentionDays !== undefined && (!Number.isInteger(input.retentionDays) || input.retentionDays < 1 || input.retentionDays > 365)) throw new HttpError(400, 'Invalid retention days');
      const result = await db.query(
        'UPDATE accounts SET recording_enabled=COALESCE($2,recording_enabled), retention_days=COALESCE($3,retention_days) WHERE id=$1 RETURNING id,email,recording_enabled,retention_days',
        [me.id, input.recordingEnabled ?? null, input.retentionDays ?? null]
      );
      await db.cleanup();
      return json(res, 200, { account: result.rows[0] });
    }
    if (req.method === 'POST' && (path === '/v1/locations' || path === '/v1/locations/batch')) {
      if (!me.recording_enabled) throw new HttpError(403, 'Enable recording first');
      const input = await body(req, path.endsWith('/batch') ? 300000 : 32768);
      const points = path.endsWith('/batch') ? input.positions : [input];
      if (!Array.isArray(points) || points.length < 1 || points.length > 500) throw new HttpError(400, 'Invalid positions batch');
      const values = points.map(pointInput);
      await db.transaction(async q => {
        // Lock consent against a concurrent user revocation; stale session snapshots are never sufficient.
        const consent = await q('SELECT recording_enabled FROM accounts WHERE id=$1 FOR UPDATE', [me.id]);
        if (!consent.rowCount || consent.rows[0].recording_enabled !== true) {
          throw new HttpError(403, 'Enable recording first');
        }
        for (const p of values) {
          await q('INSERT INTO positions(account_id,latitude,longitude,accuracy_m,captured_at,source) VALUES ($1,$2,$3,$4,$5,$6)',
            [me.id,p.latitude,p.longitude,p.accuracyM,p.capturedAt,p.source]);
        }
      });
      return json(res, 201, { accepted: values.length });
    }
    if (req.method === 'GET' && path === '/v1/locations') {
      const owner = url.searchParams.has('userId') ? uuid(url.searchParams.get('userId')) : me.id;
      if (!(await canRead(me.id,owner))) throw new HttpError(404, 'History not available');
      const limit = positiveLimit(url.searchParams.get('limit'));
      const from = timestamp(url.searchParams.get('from'), new Date(Date.now()-30*daysMs).toISOString());
      const until = timestamp(url.searchParams.get('until'), new Date().toISOString());
      if (new Date(from) > new Date(until)) throw new HttpError(400, 'Invalid date range');
      const rows = await db.query(
        'SELECT p.id,p.latitude,p.longitude,p.accuracy_m,p.captured_at,p.source FROM positions p WHERE p.account_id=$1 AND p.captured_at BETWEEN $2 AND $3 AND (p.account_id=$5 OR EXISTS (SELECT 1 FROM accounts a JOIN circle_members sharing ON sharing.account_id=a.id JOIN circle_members viewer ON viewer.circle_id=sharing.circle_id WHERE a.id=p.account_id AND a.recording_enabled=true AND sharing.sharing_enabled=true AND viewer.account_id=$5)) ORDER BY p.captured_at DESC,p.id DESC LIMIT $4',
        [owner,from,until,limit,me.id]
      );
      return json(res, 200, { userId: owner, positions: rows.rows });
    }
    if (req.method === 'GET' && path === '/v1/locations/latest') {
      const rows = await db.query(
        'SELECT a.id AS user_id, a.email, p.latitude,p.longitude,p.accuracy_m,p.captured_at FROM accounts a JOIN LATERAL (SELECT latitude,longitude,accuracy_m,captured_at FROM positions WHERE account_id=a.id ORDER BY captured_at DESC,id DESC LIMIT 1) p ON true WHERE a.id=$1 OR (a.recording_enabled=true AND EXISTS(SELECT 1 FROM circle_members viewer JOIN circle_members m ON viewer.circle_id=m.circle_id WHERE viewer.account_id=$1 AND m.account_id=a.id AND m.sharing_enabled=true))',
        [me.id]
      );
      return json(res, 200, { positions: rows.rows });
    }
    if (req.method === 'GET' && path === '/v1/export/geojson') {
      const r = await db.query(
        'SELECT latitude,longitude,accuracy_m,captured_at,source FROM positions WHERE account_id=$1 ORDER BY captured_at DESC,id DESC LIMIT 50001',
        [me.id]
      );
      if (r.rows.length > 50000) throw new HttpError(413, 'Export exceeds 50,000 positions; export in smaller ranges is not yet implemented');
      return json(res, 200, { type: 'FeatureCollection', features: r.rows.map(p => ({
        type: 'Feature', geometry: { type: 'Point', coordinates: [p.longitude,p.latitude] },
        properties: { capturedAt: p.captured_at, accuracyM: p.accuracy_m, source: p.source }
      })) });
    }
    if (req.method === 'DELETE' && path === '/v1/me/locations') {
      const r = await db.query('DELETE FROM positions WHERE account_id=$1', [me.id]);
      return json(res, 200, { deleted: r.rowCount });
    }
    if (req.method === 'GET' && path === '/v1/circles') {
      const r = await db.query(
        'SELECT c.id,c.name,c.owner_id,m.role,m.sharing_enabled FROM circles c JOIN circle_members m ON m.circle_id=c.id WHERE m.account_id=$1 ORDER BY c.name',
        [me.id]
      );
      return json(res, 200, { circles: r.rows });
    }
    if (req.method === 'POST' && path === '/v1/circles') {
      const input = await body(req);
      if (typeof input.name !== 'string' || input.name.trim().length < 1 || input.name.trim().length > 80) throw new HttpError(400, 'Invalid circle name');
      const circle = await db.transaction(async q => {
        const created = await q('INSERT INTO circles(name,owner_id) VALUES ($1,$2) RETURNING id,name', [input.name.trim(),me.id]);
        await q("INSERT INTO circle_members(circle_id,account_id,role) VALUES ($1,$2,'owner')", [created.rows[0].id,me.id]);
        return created.rows[0];
      });
      return json(res, 201, { circle });
    }
    const members = /^\/v1\/circles\/([^/]+)\/members$/.exec(path);
    if (members && req.method === 'GET') {
      const circleId = uuid(members[1]);
      await circleMember(circleId, me.id);
      const r = await db.query('SELECT a.id,a.email,m.role,m.sharing_enabled FROM circle_members m JOIN accounts a ON a.id=m.account_id WHERE m.circle_id=$1 ORDER BY a.email', [circleId]);
      return json(res, 200, { members: r.rows });
    }
    const sharing = /^\/v1\/circles\/([^/]+)\/sharing$/.exec(path);
    if (sharing && req.method === 'PATCH') {
      const circleId = uuid(sharing[1]);
      const input = await body(req);
      if (!isBool(input.enabled)) throw new HttpError(400, 'Invalid sharing setting');
      const r = await db.query('UPDATE circle_members SET sharing_enabled=$3 WHERE circle_id=$1 AND account_id=$2 RETURNING sharing_enabled', [circleId,me.id,input.enabled]);
      if (!r.rowCount) throw new HttpError(404, 'Circle not found');
      return json(res, 200, { sharingEnabled: r.rows[0].sharing_enabled });
    }
    const invites = /^\/v1\/circles\/([^/]+)\/invites$/.exec(path);
    if (invites && req.method === 'POST') {
      const circleId = uuid(invites[1]);
      const member = await circleMember(circleId, me.id);
      if (member.role !== 'owner') throw new HttpError(403, 'Only owner can invite');
      const token = newToken();
      await db.query("INSERT INTO invites(token_hash,circle_id,creator_id,expires_at) VALUES ($1,$2,$3,now()+interval '24 hours')",
        [digest(token),circleId,me.id]);
      return json(res, 201, { inviteToken: token, expiresAt: new Date(Date.now()+daysMs).toISOString() });
    }
    if (req.method === 'POST' && path === '/v1/invites/accept') {
      const input = await body(req);
      if (!/^[A-Za-z0-9_-]{32,128}$/.test(input.inviteToken || '')) throw new HttpError(400, 'Invalid invitation');
      const accepted = await db.transaction(async q => {
        const record = await q('SELECT circle_id FROM invites WHERE token_hash=$1 AND expires_at>now() AND used_at IS NULL FOR UPDATE', [digest(input.inviteToken)]);
        if (!record.rowCount) throw new HttpError(404, 'Invitation expired or used');
        await q('INSERT INTO circle_members(circle_id,account_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [record.rows[0].circle_id,me.id]);
        await q('UPDATE invites SET used_at=now() WHERE token_hash=$1', [digest(input.inviteToken)]);
        return record.rows[0].circle_id;
      });
      return json(res, 200, { circleId: accepted, sharingEnabled: false });
    }
    const leave = /^\/v1\/circles\/([^/]+)\/leave$/.exec(path);
    if (leave && req.method === 'POST') {
      const circleId = uuid(leave[1]);
      const member = await circleMember(circleId,me.id);
      if (member.role === 'owner') throw new HttpError(409, 'Owner cannot leave their circle');
      await db.query('DELETE FROM circle_members WHERE circle_id=$1 AND account_id=$2', [circleId,me.id]);
      return json(res, 200, { ok: true });
    }
    throw new HttpError(404, 'Not found');
  }
  return (req, res) => {
    Promise.resolve(handle(req, res)).catch(error => {
      if (res.headersSent) { res.destroy(); return; }
      const status = error instanceof HttpError ? error.status : error.code === '23505' ? 409 : 500;
      if (status === 500) console.error('request_failed', { method: req.method, path: new URL(req.url, 'http://localhost').pathname, code: error.code || 'internal' });
      json(res, status, { error: status === 500 ? 'Internal server error' : status === 409 && !(error instanceof HttpError) ? 'Already exists' : error.message });
    });
  };
}
