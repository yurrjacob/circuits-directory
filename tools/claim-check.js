#!/usr/bin/env node
/* Claim evidence, driven without a browser or a database.

   Approving a claim hands someone else's quote requests to whoever asked, and
   there is no undo for the ones already delivered. The failure that matters is
   not "no signal shown" — it is a signal that says VERIFIED when it should not,
   because a reassuring green label is worse than none at all. Two ways that has
   already happened and must not come back:

     - acme.co.uk reducing to "co.uk", matching every British company
     - a listing whose contact address is a gmail address matching every gmail

   So these mirror the SQL in plain JS and assert the shape of the answer, plus
   the admin rendering that must never invent a signal when the lookup failed. */
const fs = require('fs'), path = require('path'), assert = require('assert');

/* ---- the domain rules, as the database implements them ---- */
const TWO_PART = new Set(['co.uk','org.uk','ac.uk','gov.uk','me.uk','net.uk','plc.uk',
  'com.au','net.au','org.au','edu.au','gov.au','co.nz','net.nz','org.nz','co.za','org.za',
  'com.br','com.mx','com.ar','com.sg','com.hk','com.tw','com.cn','com.tr',
  'co.jp','or.jp','ne.jp','co.kr','or.kr','co.in','net.in','org.in','com.pl','com.ua']);
const FREE = new Set(['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','msn.com',
  'yahoo.com','ymail.com','icloud.com','me.com','mac.com','aol.com','proton.me','protonmail.com',
  'pm.me','gmx.com','gmx.net','mail.com','zoho.com','yandex.com','tutanota.com','fastmail.com','hushmail.com']);

const emailDomain = e => (String(e || '').trim().split('@')[1] || '').toLowerCase() || null;
function siteDomain(url){
  const h = String(url || '').trim().replace(/^[a-z]+:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
  const a = h.split('.');
  if(!h || a.length < 2) return null;
  if(a.length === 2) return h;
  const lastTwo = a[a.length - 2] + '.' + a[a.length - 1];
  return TWO_PART.has(lastTwo) ? a[a.length - 3] + '.' + lastTwo : lastTwo;
}
function verdict(co, email){
  const claim = emailDomain(email), site = siteDomain(co.website), listed = emailDomain(co.email);
  if(!claim) return 'unknown';
  if(FREE.has(claim)) return 'free-mailbox';
  if(claim === site) return 'domain-match';
  if(claim === listed) return 'listed-address';
  return 'different-domain';
}

/* ---- the two false-verify bugs, kept dead ---- */
assert.strictEqual(siteDomain('https://acme.co.uk'), 'acme.co.uk',
  'a .co.uk site collapses to the public suffix, so unrelated British companies would match each other');
assert.notStrictEqual(siteDomain('https://bbc.co.uk'), siteDomain('https://acme.co.uk'),
  'two different .co.uk companies produce the same domain — a claim from one would verify against the other');
assert.strictEqual(verdict({ website: 'https://circuits.com', email: 'jacob@gmail.com' }, 'stranger@gmail.com'),
  'free-mailbox',
  'a listing that uses a free mailbox is matching every user of that provider as its "listed address"');

/* ---- the ordinary answers ---- */
const acme = { website: 'https://www.acme.com/parts', email: 'sales@acme.com' };
assert.strictEqual(verdict(acme, 'sam@acme.com'), 'domain-match', 'the company\'s own domain is not recognised');
assert.strictEqual(verdict(acme, 'sam@shop.acme.com'), 'different-domain', 'a subdomain is being read as the company domain');
assert.strictEqual(verdict(acme, 'sam@notacme.com'), 'different-domain', 'an unrelated domain is not being flagged');
assert.strictEqual(verdict(acme, ''), 'unknown', 'a claim with no email is not being flagged');
assert.strictEqual(verdict({ website: '', email: 'ops@bell.co.uk' }, 'dana@bell.co.uk'), 'listed-address',
  'a claim from the address already on the listing is not recognised');

/* ---- the admin console renders it honestly ---- */
const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.js'), 'utf8');

const from = admin.indexOf('const CLAIM_SIGNAL');
const to = admin.indexOf('async function reloadClaims');
assert.ok(from >= 0 && to > from, 'the claim signal renderer is gone from admin.js');
global.esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
(0, eval)(admin.slice(from, to)
  .replace('const CLAIM_SIGNAL', 'global.CLAIM_SIGNAL')
  .replace('function claimSignalHtml', 'global.claimSignalHtml = function'));

assert.strictEqual(claimSignalHtml(null), '',
  'a failed evidence lookup still renders a label — staff would read "no problem" from a lookup that never ran');

for(const v of ['domain-match','listed-address','free-mailbox','different-domain','unknown']){
  assert.ok(CLAIM_SIGNAL[v], `the "${v}" verdict has no label, so it would render as "No email"`);
}
assert.strictEqual(CLAIM_SIGNAL['free-mailbox'].cls, 'warn',
  'a personal mailbox is styled as though it confirmed something');
assert.strictEqual(CLAIM_SIGNAL['different-domain'].cls, 'warn',
  'an unrelated domain is styled as though it confirmed something');

const escaped = claimSignalHtml({ verdict: 'domain-match', detail: 'x " onmouseover=alert(1) "' });
assert.ok(!/onmouseover=alert/.test(escaped.replace(/&quot;/g, '')) || /&quot;/.test(escaped),
  'the evidence text is not escaped before going into a title attribute');

/* ---- and the weak-evidence confirmation still guards Approve ---- */
const decide = admin.slice(admin.indexOf('async function decide(id, approve)'),
                           admin.indexOf('/* ---- review moderation ---- */'));
for(const v of ['free-mailbox','different-domain','unknown']){
  assert.ok(decide.includes(v), `approving a "${v}" claim no longer asks staff to confirm`);
}
assert.ok(/if\(!ok\)\s*return/.test(decide), 'the confirmation is shown but its answer is ignored');

console.log('claim evidence OK — no false verification, weak claims warned before approval');
