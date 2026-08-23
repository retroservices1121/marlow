/**
 * Sends one real message, to prove the whole chain works.
 *
 *   railway run --service marlow npm run email:test -- you@example.com
 *
 * Configuration being present is not the same as email being deliverable, and
 * the difference is invisible until somebody pays for something and hears
 * nothing. This exercises the actual module the webhook uses, with the actual
 * from-address, against the actual API — so a wrong key, an unverified domain
 * and a rejected sender all show up here rather than in a customer's silence.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, '.verify-out');

const to = process.argv.slice(2).find((a) => a.includes('@'));
if (!to) {
  console.error('Usage: npm run email:test -- you@example.com');
  process.exit(1);
}
if (!process.env.RESEND_API_KEY) {
  console.error('No RESEND_API_KEY. Run it through Railway:');
  console.error('  railway run --service marlow npm run email:test -- you@example.com');
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
  const { send } = require(path.join(out, 'lib', 'email.js'));
  const from = process.env.MARLOW_EMAIL_FROM ?? 'Marlow <hello@marlow.town>';
  console.log(`from: ${from}`);
  console.log(`to  : ${to}`);

  const sent = await send({
    to,
    subject: 'Marlow can send email',
    text: [
      'If you are reading this, Marlow can reach people.',
      '',
      'That matters for three things it would otherwise do silently:',
      'telling a buyer their lot is ready, telling a bidder their ad is up,',
      'and telling somebody their ad has come down.',
      '',
      'Marlow',
    ].join('\n'),
  });

  if (!sent) {
    console.error('\nNOT SENT. The log line above says why.');
    process.exit(1);
  }
  console.log('\nSent. Check the inbox — and the spam folder, which is where an');
  console.log('unverified domain lands even when the API accepts the message.');
})().catch((e) => {
  console.error('EMAIL TEST ERROR:', e.message);
  process.exit(1);
});
