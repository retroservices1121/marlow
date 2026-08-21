/**
 * Applies pending migrations and reports what ran.
 *
 *   npm run db:migrate                                   local (PGlite)
 *   railway run --service Postgres npm run db:migrate    against Railway
 *
 * Migrations also run automatically on the first query, so this is for seeing
 * what a deploy is about to do rather than a required step.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, '.verify-out');

require('./db-env')();

fs.rmSync(out, { recursive: true, force: true });
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.verify.json', '--outDir', out], {
  cwd: root,
  stdio: 'inherit',
});

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) {
    return resolveFilename.call(this, path.join(out, request.slice(2)), ...rest);
  }
  return resolveFilename.call(this, request, ...rest);
};

(async () => {
  const { getDb, driverName } = require(path.join(out, 'lib', 'db.js'));
  const { pendingMigrations } = require(path.join(out, 'lib', 'migrate.js'));

  const db = await getDb(); // getDb migrates on connect
  const stillPending = await pendingMigrations(db);
  const applied = await db.query('select name, applied_at from schema_migrations order by name');

  console.log(`driver: ${driverName()}`);
  console.log('applied:');
  for (const row of applied) console.log(`  ${row.name}`);
  console.log(stillPending.length ? `PENDING: ${stillPending.join(', ')}` : 'nothing pending');

  await db.close();
})().catch((e) => {
  console.error('MIGRATION ERROR:', e.message);
  process.exit(1);
});
