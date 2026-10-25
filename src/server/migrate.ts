import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pool, withTransaction } from './db.js';

const migration = await readFile(resolve('migrations/001_initial.sql'), 'utf8');
await withTransaction(async (client) => {
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = await client.query('SELECT version FROM schema_migrations WHERE version=$1', ['001_initial']);
  if (applied.rowCount) return;
  const existing = await client.query("SELECT to_regclass('public.users') AS users");
  if (existing.rows[0]?.users) {
    await client.query('INSERT INTO schema_migrations(version) VALUES($1)', ['001_initial']);
    return;
  }
  await client.query(migration);
  await client.query('INSERT INTO schema_migrations(version) VALUES($1)', ['001_initial']);
});
console.log('Database migration applied.');
await pool.end();
