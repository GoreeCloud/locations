import http from 'node:http';
import { createDatabase } from './database.mjs';
import { makeHandler } from './app.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const db = createDatabase(databaseUrl);
await db.initialize();
await db.cleanup();
const handler = makeHandler(db, { bootstrapToken: process.env.BOOTSTRAP_TOKEN, webOrigin: process.env.WEB_ORIGIN });
const server = http.createServer({ maxHeaderSize: 16384 }, handler);
server.requestTimeout = 30000;
server.headersTimeout = 15000;
server.keepAliveTimeout = 5000;
const port = Number(process.env.PORT || 8787);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
server.listen(port, '0.0.0.0', () => console.info('locations-api listening', { port }));
const prune = setInterval(() => db.cleanup().catch(err => console.error('retention_cleanup_failed', { code: err.code || 'unknown' })), 3600000);
prune.unref();
async function stop() {
  clearInterval(prune);
  server.close(async () => { await db.pool.end(); process.exit(0); });
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
