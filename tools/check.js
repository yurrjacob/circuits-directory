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
  'privacy','register','reset','results','robots','search','server','sitemap','store','styles','terms','tools'];
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

/* --- the supplier notification must not become a spam relay ---
       The whole risk here is a caller naming its own recipient. The address is
       looked up server-side from the company slug; the browser only ever sends
       a slug. */
const notifySrc = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
const notifyFn = notifySrc.slice(notifySrc.indexOf('async function notifySupplier'),
                                notifySrc.indexOf('/* ---- suspension'));
assert.ok(notifyFn, 'notifySupplier is gone');
assert.ok(/company_slug: slug/.test(notifyFn), 'the notification no longer identifies the company by slug');
assert.ok(!/\bto:|recipient|supplier_email/.test(notifyFn),
  'the browser is naming the email recipient, which would make this an open relay');
assert.ok(/catch/.test(notifyFn) && /return false/.test(notifyFn),
  'a failed notification is not swallowed — it would break the quote form');
const rfqSrc = fs.readFileSync(path.join(ROOT, 'profile.js'), 'utf8');
assert.ok(/notifySupplier\(slug,/.test(rfqSrc), 'the quote form no longer notifies the supplier');
assert.ok(!/await notifySupplier/.test(rfqSrc),
  'the quote form waits on the email; a slow send would stall the buyer');

/* --- the documentation has to be true, and must not leak the wrong key --- */
const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
assert.ok(readme.length > 2000, `README.md is only ${readme.length} bytes`);
assert.ok(fs.existsSync(path.join(ROOT, 'SECURITY.md')), 'SECURITY.md is missing');
const security = fs.readFileSync(path.join(ROOT, 'SECURITY.md'), 'utf8');
// the docs must keep saying which key is safe and which is not
for (const doc of [readme, security]) {
  assert.ok(/service role key/i.test(doc), 'the docs no longer warn about the service role key');
}
// and no file may contain one. Match the *shape* of a secret, not the words —
// looking for "service_role" also matches this check and every doc describing it.
const SECRET_SHAPES = [
  /sb_secret_[A-Za-z0-9_-]{8,}/,                              // current format
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ // legacy JWT format
];
for (const f of fs.readdirSync(ROOT).filter(n => /\.(js|html|md|json|sql)$/.test(n))
                 .concat(fs.readdirSync(path.join(ROOT, 'tools')).map(n => 'tools/' + n))) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const shape of SECRET_SHAPES) {
    assert.ok(!shape.test(src), `${f} contains something shaped like a Supabase secret key`);
  }
}
// the publishable key is fine and expected; make sure it has not been swapped for a secret
assert.ok(/sb_publishable_/.test(fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8')),
  'store.js no longer uses a publishable key');
// the README must not claim features that do not exist
const notBuilt = readme.slice(readme.indexOf('## Not built'));
for (const gap of ['Payments', 'Staging']) {
  assert.ok(notBuilt.includes(gap), `README no longer admits that ${gap} is missing`);
}
assert.ok(!/parts database|component search|distributor pricing/i.test(readme),
  'README describes a parts database, which this site does not have');

/* --- an account you cannot leave is not an account ---
       Password change, sign out everywhere, and deletion. Deletion in
       particular must be deliberate and must never take a paid listing with it. */
const acctSrc = fs.readFileSync(path.join(ROOT, 'portal.js'), 'utf8');
const storeAcct = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
assert.ok(/function renderAccount/.test(acctSrc), 'the account panel is gone');
assert.ok(/renderAccount\(user\)/.test(acctSrc), 'the account panel is never rendered');
for (const fn of ['signOutEverywhere', 'deleteOwnAccount']) {
  assert.ok(storeAcct.includes(`async function ${fn}(`), `store.js is missing ${fn}`);
}
assert.ok(/scope: 'global'/.test(storeAcct),
  'sign out everywhere only ends the current browser session');
assert.ok(/rpc\('delete_own_account'\)/.test(storeAcct),
  'account deletion no longer goes through the guarded database function');
// deletion must be confirmed by typing, and must handle the refusal case
const delFn = acctSrc.slice(acctSrc.indexOf("el('ac-delete').onclick"), acctSrc.indexOf('/* ---------- insights'));
assert.ok(/prompt\(/.test(delFn), 'account deletion happens without any confirmation step');
assert.ok(/still_owns_listing/.test(delFn),
  'the portal does not handle the case where the account manages a paid listing');
assert.ok(/cannot be undone/i.test(delFn), 'the deletion prompt does not warn that it is permanent');
// email confirmation state has to be visible
assert.ok(/email_confirmed_at/.test(acctSrc), 'the account panel no longer shows whether the email is confirmed');
assert.ok(/\.ac-danger\{/.test(fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8')),
  'the delete button is not visually distinguished');
assert.ok(fs.readFileSync(path.join(ROOT, 'portal.html'), 'utf8').includes('id="pt-account"'),
  'portal.html has nowhere to put the account panel');

/* --- the dashboard has to answer "what should I do next" ---
       Weights are read out of portal.js rather than restated here, so this
       tests the real numbers instead of a copy that can drift. */
const dashSrc = fs.readFileSync(path.join(ROOT, 'portal.js'), 'utf8');
assert.ok(/function profileCompleteness/.test(dashSrc), 'the profile completeness meter is gone');
assert.ok(/renderNextSteps\(\);/.test(dashSrc), 'the overview no longer renders the next-steps block');
const fieldBlock = dashSrc.slice(dashSrc.indexOf('const PROFILE_FIELDS'), dashSrc.indexOf('function profileCompleteness'));
const fields = [...fieldBlock.matchAll(/key:\s*'([a-z_]+)',\s*weight:\s*(\d+)/g)]
  .map(m => ({ key: m[1], weight: +m[2] }));
assert.ok(fields.length >= 6, `only ${fields.length} profile fields are scored`);
const totalWeight = fields.reduce((a, f) => a + f.weight, 0);
// an empty profile must read 0%, a full one exactly 100% — off-by-one here is
// the difference between "you're done" and a meter that never reaches the end
assert.strictEqual(Math.round(0 / totalWeight * 100), 0, 'an empty profile does not read 0%');
assert.strictEqual(Math.round(totalWeight / totalWeight * 100), 100, 'a full profile never reaches 100%');
for (const must of ['logo', 'description']) {
  const f = fields.find(x => x.key === must);
  assert.ok(f, `${must} is not counted towards profile completeness`);
  assert.ok(f.weight >= Math.max(...fields.map(x => x.weight)),
    `${must} should carry the heaviest weight — it is what a buyer judges the listing on`);
}
// unanswered buyers come before housekeeping
const nextFn = dashSrc.slice(dashSrc.indexOf('function renderNextSteps'), dashSrc.indexOf('/* ---------- overview'));
assert.ok(nextFn.indexOf('waiting for a reply') < nextFn.indexOf('missing.slice'),
  'profile chores are listed above unanswered quote requests');
assert.ok(/missing\.slice\(0, 3\)/.test(nextFn),
  'the whole list of missing fields is shown at once, which just gets ignored');
assert.ok(/\.pt-meter\{/.test(fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8')),
  'the completeness meter has no styling');
assert.ok(fs.readFileSync(path.join(ROOT, 'portal.html'), 'utf8').includes('id="pt-next"'),
  'portal.html has nowhere to put the next-steps block');

/* --- a supplier's reply has to actually reach the buyer ---
       sendFounderEmail() reads fields.email to set _replyto and to address the
       auto-response. The reply payload once called that field buyer_email, so
       there was no recipient at all: the supplier saw "Reply sent" and the
       buyer heard nothing. Nothing on screen showed the failure. */
const crmSrc = fs.readFileSync(path.join(ROOT, 'portal.js'), 'utf8');
const replyCall = crmSrc.slice(crmSrc.indexOf("sendFounderEmail('Supplier reply"),
                               crmSrc.indexOf("toast('Reply sent"));
assert.ok(replyCall, 'the supplier reply email has gone missing');
assert.ok(/\bemail:\s*q\.from_email/.test(replyCall),
  'the supplier reply does not put the buyer address in the `email` field, so it reaches nobody');
assert.ok(!/buyer_email:/.test(replyCall),
  'the reply is back to using buyer_email, which sendFounderEmail ignores');
// the promise made in the UI must match what actually happens
assert.ok(/placeholder="Emailed to \$\{escapeHtml\(q\.from_email\)\}/.test(crmSrc),
  'the reply box no longer tells the supplier which address the reply goes to');

/* --- the quote pipeline moves on its own ---
       A status that only changes when someone remembers a dropdown is a status
       nobody trusts, and an unread badge that never clears gets ignored. */
assert.ok(/function markInquiriesSeen/.test(crmSrc), 'nothing marks quote requests as seen');
assert.ok(/dataset\.tab === 'inquiries'\)\s*markInquiriesSeen\(\)/.test(crmSrc),
  'opening the Quote requests tab no longer clears New');
assert.ok(/setInquiryStatus\(id, 'Replied'\)/.test(crmSrc),
  'sending a reply no longer advances the request to Replied');
assert.ok(/\['Won','Lost','Closed'\]\.includes\(q\.status\)/.test(crmSrc),
  'a late follow-up message would drag a Won or Lost request back to Replied');
for (const s of ['New', 'Open', 'Replied', 'Won', 'Lost', 'Closed']) {
  assert.ok(new RegExp(`'${s}'`).test(crmSrc.slice(crmSrc.indexOf('data-status='))) ||
            crmSrc.includes(`'${s}'`), `the ${s} status is missing from the portal`);
}

/* --- suspension is a state, not a deletion ---
       The point of suspending rather than deleting is that it is reversible,
       so nothing here may reach for a delete, and the owner must be told. */
const suspSrc = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
for (const fn of ['suspendCompany', 'suspendProfile']) {
  assert.ok(suspSrc.includes(`async function ${fn}(`), `store.js is missing ${fn}`);
}
// must go through the logged RPC, never a bare table write that skips the audit trail
assert.ok(/rpc\('set_company_suspended'/.test(suspSrc),
  'suspendCompany no longer calls set_company_suspended, so nothing is written to the audit log');
assert.ok(/rpc\('set_profile_suspended'/.test(suspSrc),
  'suspendProfile no longer calls set_profile_suspended');
assert.ok(!/from\('companies'\)[\s\S]{0,120}suspended_at/.test(suspSrc),
  'suspension is being set by a direct table update, which bypasses the audit log');
const suspPortal = fs.readFileSync(path.join(ROOT, "portal.js"), "utf8");
assert.ok(/suspended_at/.test(suspPortal) && /pt-suspended/.test(suspPortal),
  'a suspended owner gets no explanation in the portal, so it just looks broken');
assert.ok(/\.pt-suspended\{/.test(fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8')),
  'the suspension notice has no styling');

/* --- a failed lookup must never be reported as "nothing there" ---
       These three answer questions whose empty answer is commercially loaded:
       "this keyword is available to buy" and "this address is free to claim".
       If they swallow an error and return empty, Circuits.com offers to sell
       something that may already belong to a paying customer. */
const lookupSrc = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
for (const fn of ['fetchApprovedByKeyword', 'fetchCompanyByHandle', 'fetchProfileByHandle']) {
  const body = lookupSrc.slice(lookupSrc.indexOf(`async function ${fn}(`));
  const guard = body.slice(0, body.indexOf('\n}'));
  assert.ok(/if\(error\)\{[^}]*throw error/.test(guard),
    `${fn} swallows its error instead of throwing — a failed lookup would be shown as "available"`);
}
// and every caller has to actually handle the throw
for (const [f, needle] of [['app.js', 'loadErrorHtml('], ['profile.js', 'loadErrorHtml('],
                           ['claim.html', 'loadErrorHtml(']]) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert.ok(src.includes(needle), `${f} never renders a load-failure state`);
}
// the results page in particular must not fall through to the sales pitch
const resultsSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const catchBlock = resultsSrc.slice(resultsSrc.indexOf('listings = await fetchApprovedByKeyword'));
const catchBody = catchBlock.slice(catchBlock.indexOf('catch'), catchBlock.indexOf('const countEl'));
assert.ok(/loadErrorHtml/.test(catchBody) && /return;/.test(catchBody),
  'a failed keyword search still falls through to the "this keyword is available" pitch');
assert.ok(!/listings\s*=\s*\[\]/.test(catchBody),
  'a failed keyword search still pretends the keyword has no owners');
assert.ok(/\.load-error\{/.test(fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8')),
  'the load-failure state has no styling');

/* --- every public form carries the spam traps ---
       A form that reaches the database without these puts junk straight into
       the founders' inbox and burns the per-IP limit for real visitors. */
for (const [f, formVar] of [['contact.html', 'contact-form'], ['claim.html', 'cf'],
                            ['app.js', 'form'], ['profile.js', 'rf'], ['profile.js', 'rv']]) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert.ok(new RegExp(`armSpamTrap\\((document\\.getElementById\\('${formVar}'\\)|${formVar})\\)`).test(src),
    `${f}: the ${formVar} form never arms the spam trap`);
}
for (const f of ['contact.html', 'claim.html', 'app.js', 'profile.js']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const submits = (src.match(/addEventListener\('submit'/g) || []).length;
  const gates = (src.match(/looksLikeSpam\(/g) || []).length;
  assert.ok(gates >= 1, `${f} has ${submits} submit handlers and no spam gate`);
}
// a bot must not learn why it was rejected
const spamSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
assert.ok(/function fakeSuccess/.test(spamSrc), 'rejected bots are no longer shown a fake success');
assert.ok(!/looksLikeSpam[\s\S]{0,200}(alert|error|blocked|spam detected)/i.test(spamSrc),
  'the spam gate tells the sender it was detected, which teaches the bot author what to change');
// and a real person who trips the database limit gets a sentence, not a stack trace
assert.ok(/function rateLimitMessage/.test(spamSrc), 'the database rate-limit error is no longer translated');
for (const f of ['profile.js']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert.ok((src.match(/rateLimitMessage\(/g) || []).length >= 2,
    `${f} does not surface the rate-limit message on both public forms`);
}

/* --- a primary button must never be green text on a green background ---
       .auth-foot a and .info-card a are (class + element) so they outrank the
       plain .btn-primary class. Any new context that colours its links has to
       exempt the button too. */
const btnCss = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
for (const ctx of ['.auth-foot', '.info-card']) {
  const colours = new RegExp(`${ctx.replace('.', '\\.')} a\\{[^}]*color:`).test(btnCss);
  if (!colours) continue;
  // must be the plain rule, not just the :hover one — match up to the brace
  const esc = ctx.replace('.', '\\.');
  assert.ok(new RegExp(`${esc} a\\.btn-primary[,{]`).test(btnCss),
    `${ctx} colours its links but never exempts a.btn-primary — buttons there render green on green`);
}

/* --- no decorative arrows on the auth buttons --- */
for (const f of ['login.html', 'portal.html', 'register.html']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of src.match(/<(?:button|a)[^>]*>[^<]*→[^<]*<\/(?:button|a)>/g) || []) {
    assert.ok(!/sign in|create (your )?profile/i.test(m), `${f} still has an arrow on: ${m.trim()}`);
  }
}

/* --- one footer everywhere: legal links, not navigation ---
       Terms used to be reachable only from two form checkboxes. On a paid site
       they have to be one click from anywhere, and so does Privacy. */
let footChecked = 0;
for (const f of NAV_PAGES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const foot = (src.match(/<footer class="footer">[\s\S]*?<\/footer>/) || [null])[0];
  if (!foot) continue;
  footChecked++;
  for (const href of ['/terms', '/privacy', '/directory', '/login']) {
    assert.ok(foot.includes(`href="${href}"`), `${f} footer is missing ${href}`);
  }
  // the logo already goes home; a Home link here is dead weight
  assert.ok(!/>Home</.test(foot), `${f} footer still carries a redundant Home link`);
  assert.ok(!foot.includes('Profile Login'), `${f} footer still shows Profile Login`);
}
assert.ok(footChecked >= 25, `only ${footChecked} pages carry the shared footer`);

/* --- analytics must not run before the visitor agrees ---
       GA used to load on page open, setting cookies with no consent, which is
       not lawful for UK and EU visitors. */
const an = fs.readFileSync(path.join(ROOT, 'analytics.js'), 'utf8');
assert.ok(an.includes('cx_consent'), 'analytics.js no longer checks for consent');
const gaIdx = an.indexOf('googletagmanager');
const fnIdx = an.indexOf('function loadGA');
assert.ok(gaIdx > fnIdx && fnIdx !== -1,
  'the Google Analytics tag is no longer inside the consent-gated loader');
assert.ok(/if \(c === 'yes'\) \{ loadGA\(\); return; \}/.test(an),
  'analytics loads without an explicit yes');
assert.ok(/data-c="no"/.test(an) && /data-c="yes"/.test(an),
  'the cookie banner no longer offers a real choice — decline must be possible');

// declining must also stop the first-party visitor id
const storeAn = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
const vid = storeAn.slice(storeAn.indexOf('function visitorId'), storeAn.indexOf('function trackEvent'));
assert.ok(vid.includes("cx_consent") && vid.includes('return null'),
  'visitorId still fingerprints browsers that declined analytics');
assert.ok(vid.includes("removeItem('cx_v')"),
  'an existing visitor id is not cleared when consent is withdrawn');

/* --- the privacy policy has to say what the site actually does --- */
const priv = fs.readFileSync(path.join(ROOT, 'privacy.html'), 'utf8');
for (const must of ['Supabase', 'Google Analytics', 'FormSubmit', 'GitHub Pages', 'jsDelivr']) {
  assert.ok(priv.includes(must), `privacy policy does not disclose ${must}`);
}
// the uploads really are world-readable; the policy must not soften that
assert.ok(/public storage|stored publicly/i.test(priv),
  'privacy policy does not warn that uploaded files are publicly accessible');
assert.ok(/do not sell/i.test(priv), 'privacy policy omits the no-sale statement');
assert.ok(priv.includes('cookie-reset'), 'privacy policy has no way to change a cookie choice');
assert.ok(priv.includes('/contact'), 'privacy policy gives no route for a data request');

/* --- contact form triage --- */
const contactHtml = fs.readFileSync(path.join(ROOT, 'contact.html'), 'utf8');
assert.ok(contactHtml.includes('id="c-category"'), 'contact form lost its category dropdown');
const opts = (contactHtml.match(/<option[^>]*>[^<]+<\/option>/g) || []).length;
assert.ok(opts >= 8, `contact form has only ${opts} category options`);
assert.ok(/Choose a category/.test(contactHtml),
  'the category dropdown has no unselected placeholder, so it would default to a real value');
assert.ok(contactHtml.includes("'Contact: ' + category"),
  'the chosen category never reaches the email subject, where triage happens');

/* --- somebody who forgets their password must not be locked out forever --- */
const resetHtml = fs.readFileSync(path.join(ROOT, 'reset.html'), 'utf8');
for (const id of ['rq-form', 'rq-id', 'rs-form', 'rs-pass', 'rs-pass2', 'rs-bad', 'rs-done']) {
  assert.ok(resetHtml.includes(`id="${id}"`), `reset.html is missing ${id}`);
}
const storeReset = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
assert.ok(storeReset.includes('resetPasswordForEmail'), 'store.js cannot send a reset email');
assert.ok(storeReset.includes('function setNewPassword'), 'store.js cannot set the new password');
// both sign-in pages must offer the way out
for (const f of ['portal.html', 'login.html']) {
  assert.ok(fs.readFileSync(path.join(ROOT, f), 'utf8').includes('href="/reset"'),
    `${f} has no forgot-password link`);
}
// the reset form must not reveal whether an account exists
assert.ok(/Deliberately the same outcome|If that account exists/.test(
  fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8') + resetHtml),
  'password reset reveals which accounts exist');

/* --- a paid badge must never read as a check Circuits.com performed --- */
const joinSrc = fs.readFileSync(path.join(ROOT, 'join.html'), 'utf8');
assert.ok(!/data-text="Verified"/i.test(joinSrc),
  'Verified is on sale again — a bought badge would be indistinguishable from a real check');
assert.ok(/Verified/.test(joinSrc), 'Get Listed no longer explains why Verified is not for sale');
const termsHtml = fs.readFileSync(path.join(ROOT, 'terms.html'), 'utf8');
assert.ok(/Verified/.test(termsHtml) && /applied only by Circuits\.com/i.test(termsHtml),
  'the terms do not distinguish paid badges from the Verified badge');

/* --- "permanent" must be tied to an active subscription, not sold outright --- */
assert.ok(/subscription remains active/i.test(termsHtml),
  'the terms do not say the keyword position depends on an active subscription');
for (const f of ['index.html', 'join.html']) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  assert.ok(!/permanent(ly)? (ranked|owned)|permanent ranked ownership/i.test(src),
    `${f} still promises a permanent position without qualification`);
}

/* --- an unclaimed listing must say so --- */
const profSrc2 = fs.readFileSync(path.join(ROOT, 'profile.js'), 'utf8');
assert.ok(profSrc2.includes('companyClaimed'), 'profile.js no longer checks whether a listing is claimed');
assert.ok(profSrc2.includes('lb-unclaimed'), 'the Unclaimed marker is gone from the profile heading');
assert.ok(storeReset.includes('function companyClaimed'), 'store.js is missing companyClaimed()');
assert.ok(/return true;\s*\/\/ fail closed/.test(storeReset),
  'companyClaimed must fail closed, or an outage would label real listings unclaimed');

/* --- the footer is the staff door; the header is everyone else's --- */
for (const f of NAV_PAGES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const foot = (src.match(/<footer class="footer">[\s\S]*?<\/footer>/) || [null])[0];
  if (!foot) continue;
  assert.ok(!foot.includes('Profile Login'), `${f} footer still shows Profile Login`);
  assert.ok(foot.includes('Staff Login'), `${f} footer is missing Staff Login`);
}

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
/* Renders the search and profile pages against a database that refuses every
   request, and fails if either tries to sell something as a result.
   Spawned rather than required: both harnesses eval site code against the
   shared `global`, so in one process whichever ran last won and the other
   silently tested the wrong stubs. */
require('child_process').execFileSync(process.execPath,
  [require('path').join(__dirname, 'failure-check.js')], { stdio: 'inherit' });
// same reason: it evaluates part of portal.js and must not share globals
require('child_process').execFileSync(process.execPath,
  [require('path').join(__dirname, 'completeness-check.js')], { stdio: 'inherit' });

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
