/**
 * Makes Polar charge what lib/pricing.ts says.
 *
 *   railway run --service marlow npm run polar:sync-prices
 *   railway run --service marlow npm run polar:sync-prices -- --apply
 *
 * The price a visitor sees and the price they are charged live in two systems.
 * `verify:polar` catches them disagreeing; this is how they are made to agree —
 * always in one direction, with the table in the repo as the truth and Polar
 * following it. Editing nine products by hand in a dashboard is how a $100
 * corner ends up ringing up at $15.
 *
 * Reports by default. `--apply` writes.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, '.verify-out');

const apply = process.argv.includes('--apply');
const token = process.env.POLAR_ACCESS_TOKEN;
if (!token) {
  console.error('No POLAR_ACCESS_TOKEN. Run it through Railway:');
  console.error('  railway run --service marlow npm run polar:sync-prices');
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
  const { verifyProducts } = require(path.join(out, 'lib', 'polar.js'));
  const { formatPrice } = require(path.join(out, 'lib', 'pricing.js'));

  const checks = await verifyProducts();
  const wrong = checks.filter((c) => !c.ok);

  if (wrong.length === 0) {
    console.log(`\nAll ${checks.length} products already charge what Marlow advertises.`);
    return;
  }

  console.log('');
  for (const c of wrong) {
    const from = c.actual === null ? '—' : formatPrice(c.actual);
    console.log(
      `  ${c.standing.padEnd(9)} ${c.tier.padEnd(7)} ${String(from).padStart(6)} -> ${formatPrice(c.expected).padStart(6)}   ${c.name ?? '?'}`,
    );
  }

  if (!apply) {
    console.log(`\n${wrong.length} product(s) to change. Re-run with --apply to write them.`);
    process.exitCode = 1;
    return;
  }

  console.log('');
  for (const c of wrong) {
    const res = await fetch(`https://api.polar.sh/v1/products/${c.productId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        prices: [{ amount_type: 'fixed', price_currency: 'usd', price_amount: c.expected }],
      }),
    });
    console.log(
      res.ok
        ? `  set ${c.name} to ${formatPrice(c.expected)}`
        : `  FAILED ${c.name}: HTTP ${res.status}`,
    );
    if (!res.ok) process.exitCode = 1;
  }
})().catch((e) => {
  console.error('SYNC ERROR:', e.message);
  process.exit(1);
});
