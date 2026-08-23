/**
 * Compiles and runs the card-image generator.
 *
 * Same shape as run-verify.js: the generator is TSX and imports the renderer
 * through the `@/` alias, so it is compiled to CommonJS first and the alias
 * resolved against the output.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.join(__dirname, '..');
const out = path.join(root, '.verify-out');

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

const quiet = (original) => (msg, ...args) => {
  if (typeof msg === 'string' && msg.includes('incorrect casing')) return;
  original(msg, ...args);
};
console.warn = quiet(console.warn);
console.error = quiet(console.error);

require(path.join(out, 'scripts', 'og-image.js'));
