/**
 * Gives a lot to somebody, without payment.
 *
 *   npm run grant -- "126 Main Street" alice@example.com
 *   npm run grant -- --list
 *   railway run --service Postgres npm run grant -- "126 Main Street" alice@example.com
 *
 * This is the same path a paid purchase will take once Polar is wired — a lot
 * reserved against an email, with no account needed. The recipient signs in with
 * that address and it becomes theirs to customise.
 *
 * Deliberately a command rather than a page: a giveaway that anyone can trigger
 * over HTTP is not a giveaway.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, '.verify-out');

if (process.env.DATABASE_PUBLIC_URL && !process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

const args = process.argv.slice(2);
const wantsList = args.includes('--list');
const [address, email] = args.filter((a) => !a.startsWith('--'));

if (!wantsList && (!address || !email)) {
  console.error('Usage: npm run grant -- "<address>" <email>');
  console.error('       npm run grant -- --list');
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
  const { getDb, driverName } = require(path.join(out, 'lib', 'db.js'));
  const { purchaseLotForEmail } = require(path.join(out, 'lib', 'lot-store.js'));

  const db = await getDb();
  console.log(`driver: ${driverName()}`);

  if (wantsList) {
    const rows = await db.query(
      `select address, owner_email, owner_id, sign_text, purchased_at
         from lots
        where owner_email is not null
        order by purchased_at nulls last, address`,
    );
    if (rows.length === 0) {
      console.log('nothing granted yet');
    } else {
      for (const r of rows) {
        const state = r.owner_id ? 'claimed' : 'awaiting sign-in';
        console.log(`  ${r.address.padEnd(20)} ${String(r.owner_email).padEnd(32)} ${state}`);
      }
      console.log(`\n${rows.length} granted`);
    }
    await db.close();
    return;
  }

  const result = await purchaseLotForEmail(address, email);
  if (!result.ok) {
    console.error(`REFUSED: ${result.error}`);
    await db.close();
    process.exit(1);
  }

  console.log(`\nGranted ${address} to ${result.value.ownerEmail}.`);
  console.log('It is on the street now. They sign in with that address to customise it.');
  await db.close();
})().catch((e) => {
  console.error('GRANT ERROR:', e.message);
  process.exit(1);
});
