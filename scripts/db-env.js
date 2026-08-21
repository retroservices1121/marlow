/**
 * Picks the right connection string for a command run from a developer machine.
 *
 * Under `railway run --service Postgres`, Railway injects BOTH `DATABASE_URL`
 * (pointing at `postgres.railway.internal`, resolvable only inside their
 * network) and `DATABASE_PUBLIC_URL` (the proxy that works from anywhere). So
 * the public one always wins when it is present — guarding on
 * `!DATABASE_URL` never fires there, which is exactly how `npm run grant`
 * ended up unable to reach production.
 *
 * With no `DATABASE_PUBLIC_URL` nothing is touched: a local `DATABASE_URL`, or
 * the PGlite fallback when there is none, both behave as before.
 */
module.exports = function useReachableDatabase() {
  if (process.env.DATABASE_PUBLIC_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
  }
};
