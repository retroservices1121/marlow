/**
 * Does Polar charge what the town advertises?
 *
 *   railway run --service marlow npm run verify:polar
 *
 * The price a visitor sees comes from `lib/pricing.ts`. The price they are
 * actually charged comes from a product created by hand in Polar's dashboard.
 * Nothing in the codebase can see the second one, so nothing would notice them
 * drifting apart — and the drift that matters is silent: a $200 corner ringing
 * up at $15, or worse, the other way round.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, '.verify-out');

if (!process.env.POLAR_ACCESS_TOKEN) {
  console.error('No POLAR_ACCESS_TOKEN. Run it through Railway:');
  console.error('  railway run --service marlow npm run verify:polar');
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
  let failed = 0;

  console.log('\nstanding   tier     marlow    polar   product');
  for (const c of checks) {
    const actual = c.actual === null ? '—' : formatPrice(c.actual);
    console.log(
      `${c.ok ? ' ok ' : 'FAIL'} ${c.standing.padEnd(9)} ${c.tier.padEnd(7)}` +
        ` ${formatPrice(c.expected).padStart(6)} ${String(actual).padStart(8)}   ${c.name ?? 'NOT FOUND'}`,
    );
    if (!c.ok) failed++;
  }

  if (failed > 0) {
    console.error(`\n${failed} of ${checks.length} products do not match. The site is lying about a price.`);
    process.exit(1);
  }
  console.log(`\nAll ${checks.length} products charge what Marlow advertises.`);
})().catch((e) => {
  console.error('VERIFY ERROR:', e.message);
  process.exit(1);
});
