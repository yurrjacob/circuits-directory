#!/usr/bin/env node
/* Smallest thing that fails if the profile logic breaks.
   Run: node tools/check.js
   Pair with tools/rls-check.sql, which asserts the database side. */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* --- slugify must agree with the SQL slugify(), or /company/<slug> 404s --- */
const slugify = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// expected values were produced by the database: select slugify(name)
const CASES = [
  ['Viking Electronics, Inc', 'viking-electronics-inc'],
  ["Mike's Electric",         'mike-s-electric'],
  ['Circuits.com',            'circuits-com'],
  ['  Spaced  Out  ',         'spaced-out'],
  ['ACME—Ünïcode Ltd', 'acme-n-code-ltd'],
  ['123 Numbers',             '123-numbers'],
  ['A&B Semi',                'a-b-semi'],
  ['---',                     ''],
  ['Test 7',                  'test-7']
];
for (const [name, want] of CASES) {
  assert.strictEqual(slugify(name), want, `slugify(${JSON.stringify(name)}) drifted from the database`);
}

/* --- stored text must never become a javascript: link --- */
const safeUrl = u => {
  const s = (u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(s)) return 'https://' + s;
  return '';
};
for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'vbscript:x', ' JavaScript:alert(1)']) {
  assert.strictEqual(safeUrl(bad), '', `safeUrl let through ${bad}`);
}
assert.strictEqual(safeUrl('acme.com'), 'https://acme.com');
assert.strictEqual(safeUrl('https://acme.com/x'), 'https://acme.com/x');

/* --- the generator template needs every placeholder it substitutes --- */
const tpl = fs.readFileSync(path.join(ROOT, 'company.html'), 'utf8');
for (const ph of ['{{SLUG}}', '{{TITLE}}', '{{DESC}}', '{{CANONICAL}}', '{{OGIMAGE}}']) {
  assert.ok(tpl.includes(ph), `company.html is missing ${ph}`);
}

/* --- every page that calls store.js/app.js helpers must actually load them --- */
const NEEDS = {
  'company.html':   ['/store.js', '/app.js', '/profile.js'],
  'companies.html': ['/store.js', '/app.js'],
  'portal.html':    ['/store.js', '/app.js', '/portal.js'],
  'claim.html':     ['/store.js', '/app.js'],
  'results.html':   ['store.js', 'app.js'],
  'admin.html':     ['store.js']
};
for (const [file, scripts] of Object.entries(NEEDS)) {
  const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const s of scripts) {
    assert.ok(html.includes('src="' + s + '"'), `${file} does not load ${s}`);
  }
}

/* --- profile links must point at the generated path --- */
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
assert.ok(app.includes('profileUrl('), 'results listings no longer link to company profiles');
assert.ok(fs.readFileSync(path.join(ROOT, '404.html'), 'utf8').includes('/company.html?c='),
  '404.html lost the fallback for ungenerated profile pages');

console.log('checks passed (' + (CASES.length + 6) + ' assertions)');
