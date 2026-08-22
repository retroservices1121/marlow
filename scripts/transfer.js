/**
 * Moves a lot to somebody else, for a giveaway.
 *
 *   railway run --service Postgres npm run transfer -- "104 Cinder Row" winner@example.com
 *   railway run --service Postgres npm run transfer -- "104 Cinder Row" winner@example.com --force
 *
 * The giveaway this is built for: reserve a handful of lots under your own
 * email so nobody can buy them, announce them, then hand each one over as you
 * pick a winner. They sign in with that address and the shop is theirs to
 * build — the same path a paying customer takes.
 *
 * Refuses a lot somebody has already signed in and claimed, unless forced.
 * Taking a shop away from an owner who is using it should not be a typo away.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, '.verify-out');

require('./db-env')();

const args = process.argv.slice(2);
const force = args.includes('--force');
const [address, email] = args.filter((a) => !a.startsWith('--'));

if (!address || !email) {
  console.error('Usage: npm run transfer -- "<address>" <email> [--force]');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
execFileSync(
  process.execPath,
  [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.verify.json', '--outDir', out],
  { cwd: root, stdio: 'inherit' },
);

const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith('@/')) {
    return resolveFilename.call(this, path.join(out, request.slice(2)), ...rest);
  }
  return resolveFilename.call(this, request, ...rest);
};

(async () => {
  const { getDb } = require(path.join(out, 'lib', 'db.js'));
  const { transferLot } = require(path.join(out, 'lib', 'lot-store.js'));
  const { addressSlug } = require(path.join(out, 'lib', 'lots.js'));

  const db = await getDb();
  const before = await db.one('select owner_email, owner_id from lots where address = $1', [address]);
  if (before) {
    const state = before.owner_id ? 'claimed by' : 'held for';
    console.log(`${address} is currently ${state} ${before.owner_email}`);
  }

  const result = await transferLot(address, email, force);
  if (!result.ok) {
    console.error(`REFUSED: ${result.error}`);
    await db.close();
    process.exit(1);
  }

  console.log(`\n${address} now belongs to ${result.value.ownerEmail}.`);
  console.log(`They sign in with that address and it is theirs to build.`);
  console.log(`  https://marlow.town/${addressSlug(address)}`);
  await db.close();
})().catch((e) => {
  console.error('TRANSFER ERROR:', e.message);
  process.exit(1);
});
