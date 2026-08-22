/**
 * Holds a lot back as a prize.
 *
 *   railway run --service Postgres npm run reserve -- "110 Chandler Walk"
 *   railway run --service Postgres npm run reserve -- --list
 *   railway run --service Postgres npm run reserve -- "110 Chandler Walk" --release
 *
 * The engagement loop this exists for: reserve an address, post the link,
 * people register and send you the email they signed up with, and
 * `npm run transfer` hands over the deed.
 *
 * Reserving takes the lot off the market immediately — the checkout refuses it
 * — so nobody can buy the prize out from under a running giveaway. And the
 * lot's own page stops saying "Sold" and starts explaining how to win it, which
 * is the whole point: the link is the advert.
 *
 * Held under RESERVE_EMAIL, or your Marlow address by default. That email never
 * appears anywhere public.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, '.verify-out');

require('./db-env')();

const args = process.argv.slice(2);
const wantsList = args.includes('--list');
const release = args.includes('--release');
const [address] = args.filter((a) => !a.startsWith('--'));
const holder = process.env.RESERVE_EMAIL ?? 'giveaway@marlow.town';

if (!wantsList && !address) {
  console.error('Usage: npm run reserve -- "<address>" [--release]');
  console.error('       npm run reserve -- --list');
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
  const { isRealAddress } = require(path.join(out, 'lib', 'lot-store.js'));
  const { addressSlug } = require(path.join(out, 'lib', 'lots.js'));
  const { priceLabel } = require(path.join(out, 'lib', 'pricing.js'));
  const { buildInventory } = require(path.join(out, 'lib', 'inventory.js'));
  const { getOverrides } = require(path.join(out, 'lib', 'lot-store.js'));

  const db = await getDb();

  if (wantsList) {
    const rows = await db.query(
      `select address, owner_email from lots
        where acquired_via = 'giveaway' and owner_id is null
        order by address`,
    );
    if (rows.length === 0) {
      console.log('nothing reserved');
    } else {
      for (const r of rows) console.log(`  https://marlow.town/${addressSlug(r.address)}`);
      console.log(`\n${rows.length} reserved`);
    }
    await db.close();
    return;
  }

  if (!isRealAddress(address)) {
    console.error(`REFUSED: no such address as "${address}"`);
    await db.close();
    process.exit(1);
  }

  if (release) {
    const rows = await db.query(
      `delete from lots
        where address = $1 and acquired_via = 'giveaway' and owner_id is null
        returning address`,
      [address],
    );
    console.log(
      rows.length > 0
        ? `${address} is back on the market.`
        : `REFUSED: ${address} is not a reserved lot.`,
    );
    await db.close();
    process.exit(rows.length > 0 ? 0 : 1);
  }

  const existing = await db.one('select owner_email, owner_id, acquired_via from lots where address = $1', [address]);
  if (existing && existing.acquired_via !== 'giveaway') {
    console.error(`REFUSED: ${address} is already ${existing.owner_id ? 'claimed' : 'held'} by ${existing.owner_email}.`);
    await db.close();
    process.exit(1);
  }

  await db.query(
    `insert into lots (address, owner_email, status, purchased_at, acquired_via)
          values ($1, $2, 'sold', now(), 'giveaway')
     on conflict (address) do update
            set owner_email = excluded.owner_email,
                acquired_via = 'giveaway',
                status = 'sold',
                updated_at = now()`,
    [address, holder],
  );

  const lot = buildInventory(await getOverrides()).find((l) => l.address === address);
  console.log(`\nReserved ${address} (worth ${lot ? priceLabel(lot) : '?'}).`);
  console.log(`It is off the market and its page now explains how to win it:`);
  console.log(`\n  https://marlow.town/${addressSlug(address)}\n`);
  console.log(`Hand it over with:`);
  console.log(`  npm run transfer -- "${address}" <winner-email>`);
  await db.close();
})().catch((e) => {
  console.error('RESERVE ERROR:', e.message);
  process.exit(1);
});
