/**
 * Forward-only migration runner.
 *
 * Applies every `migrations/*.sql` not yet recorded, in filename order, each inside its own
 * transaction. There is no `down` — a mistake is corrected by a new migration, because a
 * rollback that has already been applied to production data is a second mistake.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is not set. Refusing to guess a database to migrate.');
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name        text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
  )
`);

const { rows } = await client.query('SELECT name FROM schema_migrations');
const applied = new Set(rows.map((row) => row.name));

const pending = readdirSync(migrationsDir)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .filter((name) => !applied.has(name));

if (pending.length === 0) {
  console.log('Nothing to apply — the database is current.');
} else {
  for (const name of pending) {
    const sql = readFileSync(new URL(name, `file://${migrationsDir}`), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`applied ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      console.error(`FAILED ${name} — rolled back. Nothing after it was applied.`);
      console.error(error instanceof Error ? error.message : error);
      await client.end();
      process.exit(1);
    }
  }
}

await client.end();
