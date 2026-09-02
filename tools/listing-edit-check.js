#!/usr/bin/env node
/* A supplier editing their own listing.

   The thing that must not break is the boundary. applications_lock_billing()
   silently reverts keyword, banner, badge, price, fee and status for anyone who
   is not staff — no error, the update just does nothing. So a form that offered
   those fields would look like it saved and change nothing, and the supplier
   would believe they had cancelled their sponsorship or renamed their keyword.

   These assert the client never even sends them, and that the two fields a
   supplier does own survive the trip. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');

const store = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
const portal = fs.readFileSync(path.join(ROOT, 'portal.js'), 'utf8');

/* ---- the allow-list itself ---- */
const m = /const LISTING_OWNER_FIELDS = \[([^\]]*)\]/.exec(store);
assert.ok(m, 'LISTING_OWNER_FIELDS is gone from store.js');
const allowed = m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
/* description + docs, and since 2026-09-02 the listing's own showcase
   (certifications, team, gallery) and its buyer-reviews switch. Anything
   else is either reverted silently by applications_lock_billing() or is a
   commercial term that is not theirs to set. */
const OWNER_OK = ['certifications', 'description', 'docs', 'gallery', 'reviews_enabled', 'team'];
assert.deepStrictEqual(allowed.slice().sort(), OWNER_OK,
  `a supplier may now edit ${allowed.join(', ')} — anything beyond the listing's own words, documents and showcase is not theirs to set`);

/* ---- run the real function against a fake client ---- */
let sent = null;
const say = console.log.bind(console);          // keep a real one before muting
global.console = { error(){}, warn(){}, log(){} };
global.sb = { from(){ return { update(f){ sent = f; return { eq: async () => ({ error: null }) }; } }; } };
{
  const from = store.indexOf('const LISTING_OWNER_FIELDS');
  const to = store.indexOf('async function deleteApplication');
  (0, eval)(store.slice(from, to)
    .replace('const LISTING_OWNER_FIELDS', 'global.LISTING_OWNER_FIELDS')
    .replace('async function updateMyListing', 'global.updateMyListing = async function'));
}

(async () => {
  /* every locked column, offered at once — none may reach the database */
  await updateMyListing('x', {
    description: 'ok', docs: [{name:'a',url:'b'}], certifications: [], team: [], gallery: [], reviews_enabled: true,
    keyword: 'stolen', banner: true, badge: {text:'Verified'}, status: 'Approved',
    listing_price: 0, banner_price: 0, badge_price: 0, fee: 'free',
    company: 'Someone Else', company_slug: 'someone-else', owner_email: 'me@example.com',
    keywords: ['stolen'], created_at: '1970-01-01'
  });
  assert.deepStrictEqual(Object.keys(sent).sort(), OWNER_OK,
    `updateMyListing sent ${Object.keys(sent).join(', ')} — the extra fields are silently reverted by the ` +
    'database, so the supplier would be told it saved when nothing changed');
  assert.strictEqual(sent.keyword, undefined, 'a supplier must not be able to rename their own keyword');
  assert.strictEqual(sent.banner, undefined, 'a supplier must not be able to grant themselves the sponsor banner');
  assert.strictEqual(sent.badge, undefined, 'a supplier must not be able to grant themselves a trust badge');

  /* the 300-char CHECK constraint is enforced before the request, not after */
  await updateMyListing('x', { description: 'y'.repeat(500) });
  assert.strictEqual(sent.description.length, 300,
    'an over-long description is sent whole and the database rejects the whole update');

  /* blank means "no description", not an empty string */
  await updateMyListing('x', { description: '   ' });
  assert.strictEqual(sent.description, null, 'a cleared description should be null, not an empty string');

  /* nothing to change must not fire a pointless write */
  sent = null;
  await updateMyListing('x', { keyword: 'nope' });
  assert.strictEqual(sent, null, 'an update with no permitted fields still hit the database');

  /* ---- the UI keeps the same promise ---- */
  assert.ok(/Keyword, sponsorship, badge and price are set by Circuits\.com/.test(portal),
    'the editor no longer tells suppliers which fields are not theirs to change');
  for(const bad of ['data-save', 'data-edit', 'data-cancel', 'data-rmdoc']){
    assert.ok(portal.includes(bad), `the listing editor lost its ${bad} control`);
  }
  assert.ok(/updateMyListing/.test(portal) && !/updateApplication\(/.test(portal),
    'the portal calls updateApplication directly — it must go through updateMyListing, which is what drops ' +
    'the locked fields');

  say('listing editor OK — suppliers own their words and documents, nothing else');
})();
