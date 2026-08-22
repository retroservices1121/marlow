/**
 * Every paid order in Polar, checked against what the town actually handed over.
 *
 * Needs both the Polar token, which lives on the `marlow` service, and a
 * database URL reachable from outside, which lives on `Postgres`. They are on
 * different services, so one is carried across:
 *
 *   POLAR_ACCESS_TOKEN="$(railway variables --service marlow --kv  *     | grep '^POLAR_ACCESS_TOKEN=' | cut -d= -f2-)"  *     railway run --service Postgres npm run polar:reconcile
 *
 * Add ` -- --fix` to hand over the lots it finds missing.
 *
 * Written because the webhook rejected every genuine delivery for its first
 * real sale while passing my own test signatures, and the only sign was a line
 * in the logs nobody was watching. A customer paid and got nothing.
 *
 * The lesson is not "fix the signature" — that is done. It is that fulfilment
 * hung entirely on one HTTP callback arriving and being understood. Polar knows
 * who paid for what, and that record outlives any delivery we mishandled, so
 * asking it directly is the backstop: whatever went wrong in between, this
 * finds the gap.
 *
 * Reports by default. `--fix` hands over the lots.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, '.verify-out');

require('./db-env')();

const fix = process.argv.includes('--fix');
const token = process.env.POLAR_ACCESS_TOKEN;
if (!token) {
  console.error('No POLAR_ACCESS_TOKEN. Run it through Railway:');
  console.error('  railway run --service marlow npm run polar:reconcile');
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

/** Every paid order, following Polar's pagination to the end. */
async function paidOrders() {
  const orders = [];
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.polar.sh/v1/orders/?limit=100&page=${page}&sorting=-created_at`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok) throw new Error(`Polar returned HTTP ${res.status} listing orders`);
    const body = await res.json();
    const items = body.items ?? [];
    orders.push(...items.filter((o) => o.paid === true || o.status === 'paid'));
    const pages = body.pagination?.max_page ?? 1;
    if (page >= pages || items.length === 0) break;
  }
  return orders;
}

(async () => {
  const { getDb } = require(path.join(out, 'lib', 'db.js'));
  const { purchaseLotForEmail } = require(path.join(out, 'lib', 'lot-store.js'));

  const db = await getDb();
  const orders = await paidOrders();
  console.log(`\n${orders.length} paid order(s) in Polar\n`);

  let missing = 0;
  let fixed = 0;

  for (const order of orders) {
    const address = order.metadata?.address ?? order.checkout?.metadata?.address ?? null;
    const email = order.customer?.email ?? order.customer_email ?? null;
    const amount = ((order.total_amount ?? order.amount ?? 0) / 100).toFixed(2);

    if (!address || !email) {
      missing++;
      console.log(`  UNFULFILLABLE  $${amount}  order ${order.id}`);
      console.log(`                 address=${address ?? 'MISSING'} email=${email ?? 'MISSING'}`);
      console.log('                 Nothing links this payment to a lot. Refund it.');
      continue;
    }

    const row = await db.one('select owner_email, owner_id from lots where address = $1', [address]);
    const held = row && String(row.owner_email ?? '').toLowerCase() === email.toLowerCase();

    if (held) {
      console.log(`  ok   ${address.padEnd(22)} $${amount.padStart(7)}  ${email}`);
      continue;
    }

    missing++;
    if (row && row.owner_email) {
      // Somebody else holds it. That is a refund, not something to overwrite.
      console.log(`  CONFLICT ${address} — paid by ${email}, but held by someone else. Refund.`);
      continue;
    }

    if (!fix) {
      console.log(`  UNFULFILLED ${address.padEnd(20)} $${amount.padStart(7)}  ${email}`);
      continue;
    }

    const result = await purchaseLotForEmail(address, email, 'purchase');
    if (result.ok) {
      fixed++;
      console.log(`  FIXED  ${address.padEnd(22)} $${amount.padStart(7)}  ${email}`);
    } else {
      console.log(`  FAILED ${address} — ${result.error}`);
    }
  }

  console.log('');
  if (missing === 0) {
    console.log('Every paid order has its lot.');
  } else if (fix) {
    console.log(`${fixed} of ${missing} gap(s) closed.`);
  } else {
    console.log(`${missing} paid order(s) without a lot. Re-run with --fix to hand them over.`);
  }

  await db.close();
  process.exitCode = missing > 0 && !fix ? 1 : 0;
})().catch((e) => {
  console.error('RECONCILE ERROR:', e.message);
  process.exit(1);
});
