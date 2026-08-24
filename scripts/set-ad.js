/**
 * Puts artwork on one of the vehicles, without a bid.
 *
 *   railway run --service Postgres npm run ad:set -- blimp ./art.png https://example.com
 *
 * For the ads the town places itself: a thank-you to somebody who sent traffic
 * our way, or a house ad on a slot nobody has taken. It sets no price, so the
 * slot still stands at whatever it stood at — which for an unsold one means the
 * floor, and the next real bid takes it exactly as it would take any other.
 *
 * Refuses a slot somebody has paid for. Taking down an advertisement that was
 * bought and not refunded should not be one typo away, and `--force` is there
 * for the case where it genuinely has to come down.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, '.verify-out');

require('./db-env')();

const args = process.argv.slice(2);
const force = args.includes('--force');
const [kind, file, url] = args.filter((a) => !a.startsWith('--'));

if (!kind || !file || !url) {
  console.error('Usage: npm run ad:set -- <blimp|led|pickup|van> <image> <url> [--force]');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`No such file: ${file}`);
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
  const { sniffImageType, isAllowedLogoType, logoProblem } = require(
    path.join(out, 'lib', 'store-profile.js'),
  );
  const { normalizeUrl } = require(path.join(out, 'lib', 'store-profile.js'));

  const db = await getDb();

  const slot = await db.one('select kind, bid_cents, holder_email from ad_slots where kind = $1', [kind]);
  if (!slot) {
    console.error(`REFUSED: no vehicle called "${kind}"`);
    await db.close();
    process.exit(1);
  }
  if (Number(slot.bid_cents) > 0 && !force) {
    console.error(
      `REFUSED: ${kind} is paid for at $${(Number(slot.bid_cents) / 100).toFixed(2)} by ${slot.holder_email}.`,
    );
    console.error('Pass --force to take their advertisement down anyway.');
    await db.close();
    process.exit(1);
  }

  const bytes = fs.readFileSync(file);
  const problem = logoProblem(bytes);
  if (problem) {
    console.error(`REFUSED: ${problem}`);
    await db.close();
    process.exit(1);
  }
  const contentType = sniffImageType(bytes);
  if (!contentType || !isAllowedLogoType(contentType)) {
    console.error('REFUSED: artwork must be a PNG, JPEG or WebP image.');
    await db.close();
    process.exit(1);
  }
  const link = normalizeUrl(url);
  if (!link) {
    console.error(`REFUSED: "${url}" is not a usable web address.`);
    await db.close();
    process.exit(1);
  }

  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32);

  await db.query(
    `insert into ad_images (kind, bytes, content_type, hash, updated_at)
          values ($1, $2, $3, $4, now())
     on conflict (kind) do update
            set bytes = excluded.bytes,
                content_type = excluded.content_type,
                hash = excluded.hash,
                updated_at = now()`,
    [kind, bytes, contentType, hash],
  );
  await db.query(
    `update ad_slots set url = $2, image_hash = $3, since = now(), updated_at = now() where kind = $1`,
    [kind, link, hash],
  );

  console.log(`\n${kind}: artwork installed, pointing at ${link}`);
  console.log(`  ${(bytes.length / 1024).toFixed(1)}KB ${contentType}`);
  console.log('  It rides free. The next bid over the floor takes it.');
  await db.close();
})().catch((e) => {
  console.error('SET AD ERROR:', e.message);
  process.exit(1);
});
