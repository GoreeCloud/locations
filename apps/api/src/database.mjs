import pg from 'pg';
import { readFile } from 'node:fs/promises';

export function createDatabase(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000 });
  const query = (sql, params = []) => pool.query(sql, params);
  const transaction = async action => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await action((sql, params = []) => client.query(sql, params));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  };
  const initialize = async () => {
    const sql = await readFile(new URL('../../../migrations/001_init.sql', import.meta.url), 'utf8');
    await transaction(async run => {
      await run('SELECT pg_advisory_xact_lock(83528026)');
      await run(sql);
    });
  };
  const cleanup = async () => {
    await query("DELETE FROM positions p USING accounts a WHERE p.account_id = a.id AND p.captured_at < now() - (a.retention_days * interval '1 day')");
    await query('DELETE FROM sessions WHERE expires_at < now()');
    await query('DELETE FROM invites WHERE expires_at < now() OR used_at IS NOT NULL');
  };
  return { pool, query, transaction, initialize, cleanup };
}
