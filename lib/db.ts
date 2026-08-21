/**
 * Database access.
 *
 * One tiny query interface with two drivers behind it:
 *
 *   DATABASE_URL set   → node-postgres against your real Postgres
 *   DATABASE_URL unset → PGlite, Postgres compiled to WASM, running in-process
 *
 * The SQL is identical either way, so what gets exercised in development and in
 * the test suite is the same SQL that runs in production. PGlite is a local
 * convenience, not a second dialect to maintain.
 */

import { readFileSync } from 'fs';
import path from 'path';

export type Row = Record<string, unknown>;

export type Db = {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Single row or null — the common case, without the `[0]` dance. */
  one<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T | null>;
  close(): Promise<void>;
};

let instance: Promise<Db> | null = null;

function schemaSql(): string {
  return readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
}

async function createPostgres(url: string): Promise<Db> {
  const { Pool } = await import('pg');
  const pool = new Pool({
    connectionString: url,
    // Hosted Postgres (Neon, Supabase, RDS) terminates TLS with its own chain;
    // plain local instances have no TLS at all.
    ssl: /\blocalhost\b|\b127\.0\.0\.1\b/.test(url) ? false : { rejectUnauthorized: false },
  });
  await pool.query(schemaSql());

  return {
    async query<T extends Row>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return result.rows as T[];
    },
    async one<T extends Row>(sql: string, params: unknown[] = []): Promise<T | null> {
      const result = await pool.query(sql, params);
      return (result.rows[0] as T | undefined) ?? null;
    },
    async close() {
      await pool.end();
    },
  };
}

async function createPglite(dataDir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(dataDir);
  await pg.exec(schemaSql());

  return {
    async query<T extends Row>(sql: string, params: unknown[] = []) {
      const result = await pg.query(sql, params);
      return result.rows as T[];
    },
    async one<T extends Row>(sql: string, params: unknown[] = []): Promise<T | null> {
      const result = await pg.query(sql, params);
      return (result.rows[0] as T | undefined) ?? null;
    },
    async close() {
      await pg.close();
    },
  };
}

/** Process-wide handle. Schema is applied on first use; the DDL is idempotent. */
export function getDb(): Promise<Db> {
  if (!instance) {
    const url = process.env.DATABASE_URL;
    instance = url
      ? createPostgres(url)
      : // A directory keeps edits across dev-server restarts. `memory://` gives a
        // throwaway database, which is what the test suite asks for.
        createPglite(process.env.PGLITE_DIR || path.join(process.cwd(), '.pglite'));
  }
  return instance;
}

/** Which driver is in play — surfaced in the UI so nobody mistakes one for the other. */
export function driverName(): 'postgres' | 'pglite' {
  return process.env.DATABASE_URL ? 'postgres' : 'pglite';
}

/** Fresh in-memory database, for tests. Never touches the dev data directory. */
export function createTestDb(): Promise<Db> {
  return createPglite(undefined);
}

/** Resets the cached handle. Tests only. */
export function resetDb(): void {
  instance = null;
}
