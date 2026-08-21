/**
 * Runs the database harness against a remote Postgres.
 *
 *   railway run --service Postgres node scripts/run-verify-remote.js
 *
 * Railway's `DATABASE_URL` points at `postgres.railway.internal`, which only
 * resolves inside their private network. From a developer machine the public
 * proxy endpoint is the one that works, so this promotes `DATABASE_PUBLIC_URL`
 * and hands off to the normal runner.
 *
 * The harness namespaces everything it creates and asserts the row counts come
 * back to their starting values, so this is safe to point at a live database.
 */
const path = require('path');

const publicUrl = process.env.DATABASE_PUBLIC_URL;
if (publicUrl) {
  process.env.DATABASE_URL = publicUrl;
} else if (!process.env.DATABASE_URL) {
  console.error(
    'No DATABASE_PUBLIC_URL or DATABASE_URL in the environment.\n' +
      'Run this under: railway run --service Postgres node scripts/run-verify-remote.js',
  );
  process.exit(1);
}

process.argv[2] = 'db';
require(path.join(__dirname, 'run-verify.js'));
