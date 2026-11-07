'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

test('built extension core matches src (run `npm run build` if this fails)', () => {
  const src = fs.readFileSync(path.join(root, 'src/core.js'), 'utf8');
  const built = fs.readFileSync(path.join(root, 'extension/core.js'), 'utf8');
  assert.ok(built.endsWith(src));
});

test('userscript parses and exposes the engine without touching module.exports', () => {
  const code = fs.readFileSync(path.join(root, 'userscript/downfall-of-rtl.user.js'), 'utf8');
  assert.match(code, /@run-at\s+document-start/);
  // Run everything except the final unleash() call (no DOM in node).
  const ctx = { setTimeout, clearTimeout };
  vm.runInNewContext(code.replace(/DownfallOfRTL\.unleash\([^)]*\);\s*$/, ''), ctx);
  assert.equal(typeof ctx.DownfallOfRTL.unleash, 'function');
});

test('obsidian main.js parses', () => {
  const code = fs.readFileSync(path.join(root, 'obsidian/main.js'), 'utf8');
  assert.doesNotThrow(() => new vm.Script(code));
});
