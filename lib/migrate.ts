/**
 * Schema migrations.
 *
 * The schema used to be one `create table if not exists` file replayed on every
 * boot. That can create things but cannot change them — the moment a column has
 * to be dropped or added, replaying the file is silently a no-op and the
 * database drifts from the code.
 *
 * So: numbered SQL files in `db/migrations`, applied in filename order, each
 * recorded once in `schema_migrations`. Rules that keep this honest:
 *
 *   - a migration that has run is never edited; changes go in a new file
 *   - each runs inside a transaction, so a failure leaves nothing half-applied
 *   - an advisory lock serialises concurrent boots, so two instances starting
 *     together cannot both apply the same migration
 *
 * `001_initial_schema.sql` is the original file unchanged. Replaying it against
 * the already-deployed database is a no-op, which is what lets an existing
 * instance adopt this mechanism without a manual step.
 */

import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import type { Db } from './db';

/** Arbitrary but fixed: the lock key every instance agrees to contend on. */
const MIGRATION_LOCK_KEY = 4460871;

export function migrationsDir(): string {
  return path.join(process.cwd(), 'db', 'migrations');
}

export type Migration = { name: string; sql: string };

export function loadMigrations(): Migration[] {
  return readdirSync(migrationsDir())
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .map((file) => ({
      name: file,
      sql: readFileSync(path.join(migrationsDir(), file), 'utf8'),
    }));
}

/**
 * Applies whatever has not run yet. Returns the names actually applied, so a
 * caller can log a real change rather than a reassuring no-op.
 */
export async function migrate(db: Db): Promise<string[]> {
  await db.exec(`
    create table if not exists schema_migrations (
      name       text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  await db.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  try {
    const done = new Set(
      (await db.query<{ name: string }>('select name from schema_migrations')).map((r) => r.name),
    );

    const applied: string[] = [];
    for (const migration of loadMigrations()) {
      if (done.has(migration.name)) continue;

      await db.exec('begin');
      try {
        await db.exec(migration.sql);
        await db.query('insert into schema_migrations (name) values ($1)', [migration.name]);
        await db.exec('commit');
        applied.push(migration.name);
      } catch (error) {
        await db.exec('rollback');
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`migration ${migration.name} failed: ${detail}`);
      }
    }
    return applied;
  } finally {
    await db.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  }
}

/** Names of migrations present on disk but not yet recorded as applied. */
export async function pendingMigrations(db: Db): Promise<string[]> {
  const done = new Set(
    (await db
      .query<{ name: string }>('select name from schema_migrations')
      .catch(() => [] as { name: string }[])
    ).map((r) => r.name),
  );
  return loadMigrations()
    .map((m) => m.name)
    .filter((name) => !done.has(name));
}
