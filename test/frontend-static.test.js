const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

test('front-end selection state is declared before use', () => {
  const appPath = path.join(__dirname, '..', 'public', 'app.js');
  const source = readFileSync(appPath, 'utf8');
  assert.match(source, /let\s+selectedIconIds\s*=\s*new\s+Set\s*\(/, 'selectedIconIds must be declared as selection state');
});


test('batch select all control is wired', () => {
  const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
  const appPath = path.join(__dirname, '..', 'public', 'app.js');
  const html = readFileSync(htmlPath, 'utf8');
  const source = readFileSync(appPath, 'utf8');
  assert.match(html, /id="btn-batch-toggle-all"/, 'batch toolbar must include select all button');
  assert.match(source, /const\s+btnBatchToggleAll\s*=\s*document\.getElementById\('btn-batch-toggle-all'\)/, 'select all button must be referenced');
  assert.match(source, /function\s+toggleSelectAll\s*\(/, 'select all behavior must be implemented');
  assert.match(source, /btnBatchToggleAll\.addEventListener\('click',\s*toggleSelectAll\)/, 'select all click handler must be registered');
});

test('viewer close button is positioned at top right and enlarged by two pixels', () => {
  const cssPath = path.join(__dirname, '..', 'public', 'style.css');
  const css = readFileSync(cssPath, 'utf8');
  assert.match(css, /\.viewer-card\s+\.modal-close\s*\{[\s\S]*position:\s*absolute[\s\S]*right:\s*18px[\s\S]*font-size:\s*26px/, 'viewer close button must be top-right and 26px');
});
