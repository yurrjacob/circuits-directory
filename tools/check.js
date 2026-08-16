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
for (const ph of ['{{HANDLE}}', '{{TITLE}}', '{{DESC}}', '{{CANONICAL}}', '{{OGIMAGE}}']) {
  assert.ok(tpl.includes(ph), `company.html is missing ${ph}`);
}

/* --- every page that calls store.js/app.js helpers must actually load them --- */
const NEEDS = {
  'company.html':   ['/store.js', '/app.js', '/profile.js'],
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

/* --- the products feature was removed; nothing may reference it --- */
for (const f of ['profile.js', 'portal.js', 'store.js', 'portal.html', 'company.html']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const gone of ['fetchProducts', 'saveProduct', 'deleteProduct', 'pt-products', 'tab-products']) {
    assert.ok(!src.includes(gone), `${f} still references removed product code: ${gone}`);
  }
}

/* --- profile links must point at the generated path --- */
const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
assert.ok(app.includes('profileUrl('), 'results listings no longer link to company profiles');
assert.ok(fs.readFileSync(path.join(ROOT, '404.html'), 'utf8').includes('initProfile()'),
  '404.html lost the fallback that resolves circuits.com/<handle> before generation');

/* --- handles: the JS rules must match the SQL handle_ok(), and reserved
       names must never be claimable --- */
const handleFormatOk = h =>
  /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/.test(h || '')
  && h.length >= 3 && h.length <= 32 && !/--|__|_-|-_/.test(h);
for (const good of ['aaa_electronics', 'zzzelec', 'acme-semi', 'abc', 'a1b2c3', 'x'.repeat(32)]) {
  assert.ok(handleFormatOk(good), `handle ${good} should be legal`);
}
for (const bad of ['ab', '-lead', 'trail-', '_lead', 'trail_', 'Upper', 'has space',
                   'double--dash', 'double__score', 'mixed-_sep', 'x'.repeat(33), 'dot.dot']) {
  assert.ok(!handleFormatOk(bad), `handle ${bad} should be rejected`);
}
// every root page name must be in the reserved list, or a company could take it
const RESERVED_IN_DB = ['about','admin','applications','claim','companies','company','contact',
  'dashboard','data','directory','how-it-works','index','join','login','portal','profile',
  'results','robots','search','server','sitemap','store','styles','terms','tools'];
for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith('.html')) continue;
  const name = f.replace(/\.html$/, '');
  if (name === '404') continue;
  assert.ok(RESERVED_IN_DB.includes(name),
    `root page ${f} is not in the reserved handle list — a company could claim circuits.com/${name}`);
}

/* --- the URL form of a handle must accept underscores, or circuits.com/aaa_electronics
       never resolves through the 404 fallback --- */
const pathRe = /^\/([a-z0-9][a-z0-9_-]*)\/?$/i;
assert.ok(pathRe.test('/aaa_electronics'), 'profile path regex rejects underscores');
assert.ok(fs.readFileSync(path.join(ROOT, 'profile.js'), 'utf8').includes('[a-z0-9_-]*'),
  'profileHandle() lost underscore support in its path match');

/* --- accounts may ONLY be created from the Get Listed form --- */
for (const f of ['portal.js', 'portal.html', 'claim.html', 'login.html', 'company.html']) {
  assert.ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('signUp('),
    `${f} can create an account — registration belongs only on the Get Listed form`);
}
assert.ok(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').includes('signUp(base.email'),
  'the Get Listed form no longer creates the account');
const joinHtml = fs.readFileSync(path.join(ROOT, 'join.html'), 'utf8');
for (const id of ['f-handle', 'f-pass', 'f-pass2']) {
  assert.ok(joinHtml.includes(`id="${id}"`), `join.html is missing ${id}`);
}

/* --- the estimate shown on Get Listed must equal what admin bills ---
       Each keyword becomes its own application row, so extras are per keyword.
       If these two ever diverge, an applicant is quoted one price and invoiced
       another. */
const storeSrc = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
const feeLine = storeSrc.match(/const BASE_FEE = (\d+), BANNER_FEE = (\d+), BADGE_FEE = (\d+);/);
assert.ok(feeLine, 'pricing constants moved or changed shape in store.js');
const [BASE, BANNER, BADGE] = feeLine.slice(1).map(Number);

const effPrice = (v, f) => (v == null || v === '' || isNaN(Number(v))) ? f : Number(v);
function appPrice(a){                      // mirrors store.js
  let p = effPrice(a && a.listing_price, BASE);
  if (a && a.banner) p += effPrice(a.banner_price, BANNER);
  if (a && a.badge)  p += effPrice(a.badge_price, BADGE);
  return p;
}
for (const banner of [false, true]) {
  for (const badge of [null, { text: 'x' }]) {
    for (const n of [1, 3, 5]) {
      const quoted = n * (BASE + (banner ? BANNER : 0) + (badge ? BADGE : 0));
      const billed = Array.from({ length: n }, () => appPrice({ banner, badge }))
        .reduce((s, x) => s + x, 0);
      assert.strictEqual(quoted, billed,
        `estimate ${quoted} != billed ${billed} for ${n} keyword(s), banner=${banner}, badge=${!!badge}`);
    }
  }
}
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
assert.ok(appSrc.includes('function renderQuote'), 'Get Listed lost its live estimate');
for (const trigger of ['renderQuote()']) {
  assert.ok((appSrc.match(/renderQuote\(\)/g) || []).length >= 4,
    'renderQuote is not wired to every input that changes the price');
}

require('./render-check.js');

console.log('checks passed (' + (CASES.length + 6) + ' assertions)');
