/**
 * Health check.
 *
 * Exists to answer one question before anything depends on the answer: does the
 * deployed app actually reach its database, over the driver and TLS settings it
 * thinks it is using? A green page proves nothing — the demo street renders
 * without ever opening a connection.
 */

import { driverName, getDb } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Connection strings carry credentials; they must never reach a response. */
function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/postgres(?:ql)?:\/\/[^\s]*/gi, 'postgres://[redacted]');
}

export async function GET() {
  const started = Date.now();
  try {
    const db = await getDb();
    const now = await db.one<{ now: Date }>('select now() as now');
    const tables = await db.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'
        order by table_name`,
    );
    // Sessions belong to Clerk since migration 005; there is no table to count.
    const counts = await db.one<{ users: string; lots: string; logos: string }>(
      `select (select count(*) from users)     as users,
              (select count(*) from lots)      as lots,
              (select count(*) from lot_logos) as logos`,
    );

    return Response.json({
      ok: true,
      driver: driverName(),
      databaseTime: now?.now ?? null,
      tables: tables.map((t) => t.table_name),
      counts,
      elapsedMs: Date.now() - started,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        driver: driverName(),
        error: safeError(error),
        elapsedMs: Date.now() - started,
      },
      { status: 503 },
    );
  }
}
