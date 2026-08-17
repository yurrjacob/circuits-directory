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
  'register','results','robots','search','server','sitemap','store','styles','terms','tools'];
for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith('.html')) continue;
  const name = f.replace(/\.html$/, '');
  if (name === '404') continue;
  assert.ok(RESERVED_IN_DB.includes(name),
    `root page ${f} is not in the reserved handle list — a company could claim circuits.com/${name}`);
}

/* --- one header, everywhere ---
       Every public page must carry the same nav: where you can go, then the two
       account actions. Drift here is what made the old header inconsistent. */
const NAV_PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))
  .concat(fs.readdirSync(path.join(ROOT, 'directory')).map(f => 'directory/' + f));
let navChecked = 0;
for (const f of NAV_PAGES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const nav = (src.match(/<nav class="nav">[\s\S]*?<\/nav>/) || [null])[0];
  if (!nav) continue;                       // redirect stubs and the like
  navChecked++;
  for (const href of ['/', '/about', '/contact', '/portal', '/join']) {
    assert.ok(nav.includes(`href="${href}"`), `${f} nav is missing ${href}`);
  }
  // merged away, and deliberately dropped from the header
  assert.ok(!nav.includes('/how-it-works'), `${f} nav still links the merged How It Works page`);
  assert.ok(!nav.includes('/directory'), `${f} nav still links Directory`);
  // relative hrefs break on /directory/* and /company/*
  assert.ok(!/href="(?!\/|https?:|#)[^"]/.test(nav), `${f} nav uses a relative href`);
  // exactly one primary action, and the account link present
  assert.strictEqual((nav.match(/class="[^"]*\bcta\b/g) || []).length, 1,
    `${f} nav should have exactly one Get Listed call to action`);
  assert.ok(nav.includes('nav-auth'), `${f} nav is missing the Sign In link`);
  assert.ok((nav.match(/class="[^"]*\bactive\b/g) || []).length <= 1,
    `${f} nav marks more than one item active`);
}
assert.ok(navChecked >= 20, `only ${navChecked} pages carry the shared header`);

/* How It Works was merged into About; the old URL must still point somewhere */
const hiw = fs.readFileSync(path.join(ROOT, 'how-it-works.html'), 'utf8');
assert.ok(hiw.includes('rel="canonical" href="https://circuits.com/about"'),
  'how-it-works no longer points search engines at /about');
assert.ok(/http-equiv="refresh"/.test(hiw), 'how-it-works no longer redirects visitors');
const sitemap = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
assert.ok(!sitemap.includes('/how-it-works'), 'sitemap still lists the merged page');
assert.ok(sitemap.includes('circuits.com/about'), 'sitemap lost /about');
assert.ok(sitemap.includes('circuits.com/register'), 'sitemap is missing /register');
assert.ok(!fs.readFileSync(path.join(ROOT, 'tools/build-profiles.js'), 'utf8').includes('/how-it-works'),
  'the sitemap generator would put /how-it-works back on the next build');

/* --- the URL form of a handle must accept underscores, or circuits.com/aaa_electronics
       never resolves through the 404 fallback --- */
const pathRe = /^\/([a-z0-9][a-z0-9_-]*)\/?$/i;
assert.ok(pathRe.test('/aaa_electronics'), 'profile path regex rejects underscores');
assert.ok(fs.readFileSync(path.join(ROOT, 'profile.js'), 'utf8').includes('[a-z0-9_-]*'),
  'profileHandle() lost underscore support in its path match');

/* --- accounts are created on Register or Get Listed, and nowhere else ---
       Anyone may hold a profile; a company listing still needs approval. Those
       are the only two doors, so no other page may call signUp. */
for (const f of ['portal.js', 'portal.html', 'claim.html', 'login.html', 'company.html', 'profile.js']) {
  assert.ok(!fs.readFileSync(path.join(ROOT, f), 'utf8').includes('signUp('),
    `${f} can create an account — that belongs on Register or Get Listed only`);
}
assert.ok(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8').includes('signUp(base.email'),
  'the Get Listed form no longer creates the account');
assert.ok(fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8').includes('sb.auth.signUp'),
  'registerProfile() no longer creates the account');

/* --- a listing and a profile are different things --- */
const regHtml = fs.readFileSync(path.join(ROOT, 'register.html'), 'utf8');
for (const id of ['r-handle', 'r-pass', 'r-pass2', 'r-email', 'r-terms']) {
  assert.ok(regHtml.includes(`id="${id}"`), `register.html is missing ${id}`);
}
assert.ok(/00<\/span>/.test(regHtml) || regHtml.includes('>00<'), 'register.html lost its 00 step number');
const storeReg = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
assert.ok(storeReg.includes('handle_taken'),
  'handle availability no longer asks the database, so a profile and a listing could share an address');
for (const fn of ['fetchProfileByHandle', 'myProfile', 'registerProfile']) {
  assert.ok(storeReg.includes('function ' + fn), `store.js is missing ${fn}()`);
}
assert.ok(fs.readFileSync(path.join(ROOT, 'profile.js'), 'utf8').includes('fetchProfileByHandle'),
  'circuits.com/<name> no longer resolves a person, only a company');
const joinHtml = fs.readFileSync(path.join(ROOT, 'join.html'), 'utf8');
for (const id of ['f-handle', 'f-pass', 'f-pass2']) {
  assert.ok(joinHtml.includes(`id="${id}"`), `join.html is missing ${id}`);
}

/* --- you cannot submit a listing without an account ---
       The account step comes first in Get Listed, with a log-in path for
       people who already have one, so Register and Get Listed stop competing. */
assert.ok(/<span class="step-num">00<\/span>/.test(joinHtml),
  'Get Listed lost its 00 account step');
assert.ok(joinHtml.indexOf('id="acct-step"') < joinHtml.indexOf('id="f-company"'),
  'the account step must come before the company details');
for (const id of ['acct-new', 'acct-login', 'acct-done', 'acct-handle', 'li-id', 'li-pass', 'li-submit']) {
  assert.ok(joinHtml.includes(`id="${id}"`), `join.html is missing ${id}`);
}
// the username field must sit OUTSIDE the register-only block: a signed-in
// user still has to choose an address for the listing itself
const newBlock = joinHtml.slice(joinHtml.indexOf('id="acct-new"'), joinHtml.indexOf('id="acct-login"'));
assert.ok(!newBlock.includes('id="f-handle"'),
  'the listing username is hidden when signed in — signed-in users could not pick one');

const joinJs = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
assert.ok(joinJs.includes('function initJoinAccount'), 'Get Listed lost its account step logic');
assert.ok(joinJs.includes('initJoinAccount()'), 'initJoinAccount is never called');
// submission must be gated on an account existing
assert.ok(/if\(!JOIN_USER\)\{[\s\S]{0,120}await signUp\(/.test(joinJs),
  'Get Listed no longer creates the account before submitting the listing');
// a signed-in user's listing must be owned by the session, not a typed address
assert.ok(joinJs.includes("JOIN_USER ? JOIN_USER.email : v('f-email')"),
  'the listing owner is taken from the form rather than the signed-in account');

/* --- the estimate shown on Get Listed must equal what admin bills ---
       Each keyword becomes its own application row, so extras are per keyword.
       If these two ever diverge, an applicant is quoted one price and invoiced
       another. */
const storeSrc = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
const feeLine = storeSrc.match(/const BASE_FEE = (\d+), BANNER_FEE = (\d+), BADGE_FEE = (\d+);/)
  || storeSrc.match(/const BASE_FEE = (\d+), BANNER_FEE = (\d+), BADGE_FEE = (\d+)\b/);
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

/* --- a profile field only renders when the value fits the field ---
       Junk in the phone box used to emit a dead tel: link, and a pasted URL in
       the address box stretched the sidebar until the layout broke. These
       mirror the guards in profile.js. */
const profSrc = fs.readFileSync(path.join(ROOT, 'profile.js'), 'utf8');
const grab = name => {
  const start = profSrc.indexOf('function ' + name + '(');
  assert.ok(start !== -1, name + '() missing from profile.js');
  const end = profSrc.indexOf('\n}', start);
  assert.ok(end !== -1, name + '() has no closing brace');
  const body = profSrc.slice(start, end + 2).replace('function ' + name, 'function');
  return eval('(' + body + ')');
};
const looksPhone = grab('looksPhone'), looksEmail = grab('looksEmail'), fitsLine = grab('fitsLine');

for (const good of ['(555) 123-4567', '+44 20 7946 0958', '555.123.4567', '5551234567'])
  assert.ok(looksPhone(good), 'looksPhone rejected a real number: ' + good);
for (const bad of ['', 'call me', 'dwadwa', '123', 'https://example.com', 'a'.repeat(40)])
  assert.ok(!looksPhone(bad), 'looksPhone accepted junk: ' + JSON.stringify(bad));

for (const good of ['sales@company.com', 'a.b+c@sub.domain.co.uk'])
  assert.ok(looksEmail(good), 'looksEmail rejected a real address: ' + good);
for (const bad of ['', 'nope', 'a@b', 'a @b.com', 'x'.repeat(330) + '@b.com'])
  assert.ok(!looksEmail(bad), 'looksEmail accepted junk: ' + JSON.stringify(bad));

assert.ok(fitsLine('12 Example Street, Springfield', 120));
assert.ok(!fitsLine('https://example.com', 120), 'a pasted URL is not an address');
assert.ok(!fitsLine('line one\nline two', 120), 'multi-line value would break the row');
assert.ok(!fitsLine('x'.repeat(200), 120), 'over-long value would break the row');
assert.ok(!fitsLine('   ', 120));

/* --- the views graph must not invent or drop data ---
       An empty bucket has to be a zero, not a gap. If gaps are dropped the line
       joins two busy days straight across a quiet week and overstates traffic. */
const portalSrc = fs.readFileSync(path.join(ROOT, 'portal.js'), 'utf8');
const grabFrom = (src, name) => {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start !== -1, name + '() missing from portal.js');
  const end = src.indexOf('\n}', start);
  const body = src.slice(start, end + 2).replace('function ' + name, 'function');
  return body;
};
const escapeHtml = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bucketSeries = eval('(' + grabFrom(portalSrc, 'bucketSeries') + ')');
/* the chart shares its geometry with the hover handler, so pull the whole
   trio in together rather than the drawing function alone */
const gConst = portalSrc.match(/const G = \{[^}]*\};/);
assert.ok(gConst, 'chart geometry constant G missing from portal.js');
const named = name => {
  const start = portalSrc.indexOf('function ' + name + '(');
  assert.ok(start !== -1, name + '() missing from portal.js');
  return portalSrc.slice(start, portalSrc.indexOf('\n}', start) + 2);
};
const { chartGeom, lineChartSvg } = eval(
  '(function(){ ' + gConst[0] + named('chartGeom') + named('lineChartSvg')
  + ' return { chartGeom, lineChartSvg }; })()');

const day = 864e5;
const from = new Date('2026-03-01T00:00:00Z'), to = new Date('2026-03-07T00:00:00Z');
const daily = bucketSeries([{ bucket: '2026-03-03T00:00:00Z', hits: 5 }], from, to, 'day');
assert.strictEqual(daily.length, 7, 'a 7-day window should produce 7 daily points');
assert.strictEqual(daily.reduce((a, s) => a + s[1], 0), 5, 'daily bucketing changed the total');
assert.ok(daily.some(s => s[1] === 5), 'the day with traffic lost its count');
assert.strictEqual(daily.filter(s => s[1] === 0).length, 6, 'quiet days must be zeros, not gaps');

const hourly = bucketSeries([], new Date('2026-03-01T00:00:00Z'), new Date('2026-03-02T00:00:00Z'), 'hour');
assert.ok(hourly.length >= 24 && hourly.length <= 25, '24h window should bucket to ~24 hourly points');
assert.ok(hourly.every(s => s[1] === 0), 'no data must draw as flat zero, not empty');

const yearly = bucketSeries([], new Date('2025-09-01T00:00:00Z'), new Date('2026-08-01T00:00:00Z'), 'month');
assert.ok(yearly.length >= 11 && yearly.length <= 13, 'a year should bucket to ~12 monthly points');

// a runaway range must not try to draw tens of thousands of points
const huge = bucketSeries([], new Date('2000-01-01T00:00:00Z'), new Date('2026-01-01T00:00:00Z'), 'hour');
assert.ok(huge.length <= 800, 'bucketSeries has no upper bound on points');

const svg = lineChartSvg(daily, d => String(d.getUTCDate()));
assert.ok(svg.startsWith('<svg') && svg.includes('</svg>'), 'chart did not render an svg');
assert.ok(/<path class="g-line" d="M[\d.]+ [\d.]+/.test(svg), 'chart has no line path');
assert.ok(!/NaN|Infinity/.test(svg), 'chart geometry produced NaN or Infinity');
const flat = lineChartSvg(bucketSeries([], from, to, 'day'), d => '');
assert.ok(!/NaN|Infinity/.test(flat), 'an all-zero series broke the chart scale');

/* The chart must scale uniformly. preserveAspectRatio="none" stretched x and y
   independently, which is what made every label look squashed. */
assert.ok(!/preserveAspectRatio\s*=\s*"none"/.test(svg),
  'chart stretches non-uniformly again — labels will be distorted');
assert.ok(/viewBox="0 0 \d+ \d+"/.test(svg), 'chart lost its viewBox');
const cssSrc = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
const chartCss = (cssSrc.match(/\.g-chart\{[^}]*\}/) || [''])[0];
assert.ok(/height:\s*auto/.test(chartCss),
  '.g-chart needs height:auto, or a fixed height forces a non-uniform scale');

/* Axis labels must stay readable at every range, so they must thin out as the
   series gets denser — 365 daily labels would be an unreadable smear. */
const labelCount = s => (lineChartSvg(s, d => 'xx').match(/class="g-xlbl"/g) || []).length;
for (const [span, bucket, cap] of [
  [864e5, 'hour', 24], [7 * 864e5, 'day', 7], [30 * 864e5, 'day', 30],
  [182 * 864e5, 'week', 27], [365 * 864e5, 'month', 13]
]) {
  const s = bucketSeries([], new Date(2026, 0, 1), new Date(2026, 0, 1 + span / 864e5), bucket);
  const labels = labelCount(s);
  assert.ok(labels >= 2, `range with ${s.length} points drew only ${labels} axis labels`);
  assert.ok(labels <= 10, `range with ${s.length} points drew ${labels} axis labels — they will overlap`);
  assert.ok(s.length <= cap + 2, `${bucket} bucketing produced ${s.length} points, expected about ${cap}`);
}

/* No two axis labels may sit closer than a label's width, at any range.
   This is the assertion that actually means "readable". */
for (const [bucket, days] of [['hour', 1], ['day', 7], ['day', 30], ['week', 182], ['month', 365]]) {
  const s = bucketSeries([], new Date(2026, 0, 1), new Date(2026, 0, 1 + days), bucket);
  const xs = [...lineChartSvg(s, d => 'Sep 30').matchAll(/class="g-xlbl" x="([\d.]+)"/g)].map(m => Number(m[1]));
  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i] - xs[i - 1] >= 70,
      `${bucket} range: axis labels only ${(xs[i] - xs[i - 1]).toFixed(0)}px apart — they overlap`);
  }
}

// dots stop once they would merge into a blob
assert.ok((lineChartSvg(daily, d => 'x').match(/class="g-dot"/g) || []).length === 7,
  'a 7-point series should show its data points');
const dense = bucketSeries([], new Date(2025, 0, 1), new Date(2025, 3, 1), 'day');
assert.strictEqual((lineChartSvg(dense, d => 'x').match(/class="g-dot"/g) || []).length, 0,
  'a 90-point series must not draw 90 dots');

// the hover handler must use the same geometry the drawing used
const geom = chartGeom(daily);
assert.ok(geom.x(0) < geom.x(6), 'chart x scale is not increasing');
assert.ok(geom.y(0) > geom.y(geom.top), 'chart y scale is not inverted for screen coords');
assert.ok(Number.isFinite(geom.y(0)) && Number.isFinite(geom.x(0)), 'chart scale produced non-numbers');
assert.strictEqual(chartGeom([[new Date(), 0]]).top, 1, 'an all-zero series must still have a top of 1');
for (const [peak, want] of [[1, 1], [3, 5], [7, 10], [12, 20], [45, 50], [230, 500]]) {
  assert.strictEqual(chartGeom([[new Date(), peak]]).top, want,
    `axis ceiling for a peak of ${peak} should be ${want}`);
}

/* --- yearly pricing must exist and undercut twelve monthly payments --- */
const yearLine = storeSrc.match(/const BASE_FEE_YEAR = (\d+), BANNER_FEE_YEAR = (\d+), BADGE_FEE_YEAR = (\d+);/);
assert.ok(yearLine, 'yearly pricing constants missing from store.js');
const [BASE_Y, BANNER_Y, BADGE_Y] = yearLine.slice(1).map(Number);
for (const [m, y, what] of [[BASE, BASE_Y, 'listing'], [BANNER, BANNER_Y, 'banner'], [BADGE, BADGE_Y, 'badge']]) {
  assert.ok(y < m * 12, what + ' yearly price is not cheaper than paying monthly');
  assert.ok(y > m, what + ' yearly price is below one month, which is surely wrong');
}

console.log('checks passed');
