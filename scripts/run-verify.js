/**
 * Runs a verification harness.
 *
 *   npm run verify      renderer acceptance criteria (spec §12)
 *   npm run verify:db   accounts, sessions and the lot store
 *
 * The harnesses are TSX/TS, so this compiles them to CommonJS first. Output goes
 * to `.verify-out/` inside the project rather than the system temp directory,
 * so ordinary `node_modules` resolution walks up and finds the project's
 * dependencies — only the `@/` alias needs special handling.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, '.verify-out');

fs.rmSync(out, { recursive: true, force: true });

const tsc = require.resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.verify.json', '--outDir', out], {
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

// Building/Street render a `<g>` outside an `<svg>` in isolation; the SVG-casing
// warnings that provokes are a harness artifact, not a renderer problem.
const quiet = (original) => (msg, ...args) => {
  if (typeof msg === 'string' && msg.includes('incorrect casing')) return;
  original(msg, ...args);
};
console.warn = quiet(console.warn);
console.error = quiet(console.error);

const which = process.argv[2] === 'db' ? 'verify-db.js' : 'verify.js';
require(path.join(out, 'scripts', which));
