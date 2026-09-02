#!/usr/bin/env node
/* The search results page, driven without a browser.

   An empty keyword opens with the banner-available pitch (mocked-up sponsor
   card and listing row — Jacob's chosen layout, restored 2026-08-20; the
   buyer's "tell me when someone lists" capture was removed 2026-09-01). Any
   keyword page without a sponsor shows the same example banner and the
   "Get Listed" button (2026-09-01). The other invariants stand: every search
   logged, empty pages noindexed, and a failed lookup never mistaken for an
   unclaimed keyword — that would sell a keyword twice. */
const fs = require('fs'), path = require('path'), assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

global.escapeHtml = s => (s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
global.safeUrl = u => { const s = (u || '').trim(); if(!s) return ''; if(/^https?:\/\//i.test(s)) return s; if(/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(s)) return 'https://' + s; return ''; };
global.avatarSvg = () => '<svg class="silhouette"></svg>';
global.isLogoUrl = s => /^https?:\/\//i.test(s || '');
global.profileUrl = h => '/' + h;
global.docLinks = () => '';
global.badgeHtml = () => '';
global.armSpamTrap = () => {};
global.looksLikeSpam = () => false;
global.fakeSuccess = () => {};
global.isValidEmail = () => true;
global.rateLimitMessage = () => null;
/* the real error renderer, not a stub: whether a failed lookup is visibly
   different from an unclaimed keyword is exactly what this checks */
{
  const f = src.indexOf('function loadErrorHtml');
  const t = src.indexOf('/* The database raises this when someone trips');
  (0, eval)(src.slice(f, t).replace('function loadErrorHtml', 'global.loadErrorHtml = function'));
}
global.registerWanted = async () => '';

let logged = null;
global.logSearch = (term, hits) => { logged = { term, hits }; };

let listingsToReturn = [], relatedToReturn = [], lookupThrows = false;
global.fetchApprovedByKeyword = async () => { if (lookupThrows) throw new Error('network'); return listingsToReturn; };
global.fetchRelatedByKeyword = async () => relatedToReturn;

let captured = '';
const node = () => ({
  set innerHTML(v){ captured = String(v); }, get innerHTML(){ return captured; },
  addEventListener(){}, value: '', textContent: '', dataset: {}, style: {},
  querySelector: () => null, querySelectorAll: () => []
});
/* the page head, because initResults now decides indexability per keyword:
   real listings → index; empty, outage or the sample fixture → noindex */
let headMeta = null, headCanon = null;
global.document = {
  title: '',
  head: { appendChild(n){ if(n.name === 'robots') headMeta = n; else if(n.rel === 'canonical') headCanon = n; } },
  body: { appendChild(){} },
  createElement: tag => ({ tagName: tag }),
  getElementById: id => (id === 'results-body' ? body : node()),
  querySelector: sel => (/robots/.test(sel) ? headMeta : /canonical/.test(sel) ? headCanon : null),
  querySelectorAll: () => []
};
const body = { set innerHTML(v){ captured = String(v); }, get innerHTML(){ return captured; },
               addEventListener(){}, style: {}, querySelector: () => null, querySelectorAll: () => [] };
global.location = { search: '?q=oscillators' };
global.URLSearchParams = class { constructor(){} get(){ return 'oscillators'; } };
/* suggestions and typo help lean on the keyword index; empty is a valid answer */
global.fetchKeywordIndex = async () => [];
global.normKw = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
/* browsers define CSS.escape; Node does not, and the stub selector ignores it */
global.CSS = { escape: s => s };

const from = src.indexOf('async function initResults');
const to = src.indexOf('/* ===================================================================');
assert.ok(from >= 0 && to > from, 'could not find initResults in app.js');
(0, eval)(src.slice(from, to).replace('async function initResults', 'global.initResults = async function'));

(async () => {
  /* --- nothing listed: the banner-available pitch (pitch first, example
         row, then the Get Listed button; no email capture since 2026-09-01) --- */
  listingsToReturn = []; relatedToReturn = [];
  await initResults('oscillators');

  assert.ok(/This Banner is Available/.test(captured),
    'the empty result no longer opens with the banner-available pitch');
  for (const ghost of ['Your Company', 'johndoe@yourcompany.com', '(555) 123-4567', 'John Doe']) {
    assert.ok(captured.includes(ghost),
      `the mocked-up example listing is missing its "${ghost}" placeholder`);
  }
  assert.ok(!/Your Company or Name|Your Contact|sales@yourcompany/.test(captured),
    'an old placeholder is back on the example listing');
  assert.ok(/Get Listed For <span class="tc">oscillators<\/span>/.test(captured),
    'the pitch lost its call to action (or the keyword is not wrapped for capitalising)');
  assert.ok(/<span class="doc-link">Website<\/span>/.test(captured) && /<span class="doc-link">View Docs<\/span>/.test(captured),
    'the example listing lost its Website / View Docs placeholders');
  assert.ok(!/<a[^>]*>(Website|View Docs)<\/a>/.test(captured),
    'a placeholder Website / View Docs label is a real link — it must not go anywhere');
  assert.ok(!/wanted-form|Tell me when someone lists|Looking to buy/.test(captured),
    'the "tell me when someone lists" capture is back (removed 2026-09-01)');
  assert.ok(captured.indexOf('This Banner is Available') < captured.indexOf('Get Listed For'),
    'the Get Listed button is not at the bottom — the pitch should come first');

  /* --- every search is recorded, hit or miss --- */
  assert.deepStrictEqual(logged, { term: 'oscillators', hits: 0 },
    'a search that found nothing was not recorded');

  /* --- an empty page must not invite Google in --- */
  assert.ok(headMeta && /noindex/.test(headMeta.content),
    'a keyword with no listings is left indexable — Google would fill up with empty pages');

  /* --- a lookup that FAILED must never look like an unclaimed keyword --- */
  lookupThrows = true; logged = null;
  await initResults('oscillators');
  assert.ok(/couldn/i.test(captured) && !/No one is listed for/.test(captured),
    'a failed lookup is being shown as "nobody is listed", which would sell a keyword twice');
  assert.strictEqual(logged, null,
    'an outage was recorded as a search that found nothing, poisoning the demand data');
  lookupThrows = false;

  /* --- listings found: the normal path still works, and is recorded --- */
  listingsToReturn = [{ company: 'Acme', company_handle: 'acme', keyword: 'oscillators',
                        contact: 'Sam', phone: '(555) 2', email: 'a@b.co', docs: [] }];
  await initResults('oscillators');
  assert.ok(/Acme/.test(captured), 'a real listing stopped rendering');
  assert.ok(!/wanted-form/.test(captured), 'the demand form shows even when results were found');
  /* nobody holds the banner here, so the example banner and the Get Listed
     button frame the list (2026-09-01) */
  assert.ok(/This Banner is Available/.test(captured) && /Exclusive Sponsor/.test(captured),
    'a keyword list with no sponsor does not show the example banner');
  assert.ok(/Get Listed For <span class="tc">oscillators<\/span>/.test(captured),
    'a keyword list with no sponsor has no Get Listed button');
  assert.ok(captured.indexOf('This Banner is Available') < captured.indexOf('Acme')
    && captured.indexOf('Acme') < captured.indexOf('Get Listed For'),
    'the example banner should sit above the list and the Get Listed button below it');
  assert.ok(!/Your Company<\/a>/.test(captured),
    'the mocked-up example ROW is showing on a page that has real listings');
  assert.deepStrictEqual(logged, { term: 'oscillators', hits: 1 },
    'a search that found something was not recorded with its hit count');

  /* --- paid locked spots pin to their number; everyone else shuffles around
         them (2026-09-01). Bell pays for #2 and must land there on every deal. --- */
  for(let deal = 0; deal < 25; deal++){
    listingsToReturn = [
      { company: 'Acme', company_handle: 'acme', company_slug: 'acme', keyword: 'oscillators', contact: 'Sam', phone: '1', email: 'a@b.co', docs: [] },
      { company: 'Bell', company_handle: 'bell', company_slug: 'bell', keyword: 'oscillators', contact: 'Dana', phone: '2', email: 'b@b.co', docs: [], locked_position: 2 },
      { company: 'Cove', company_handle: 'cove', company_slug: 'cove', keyword: 'oscillators', contact: 'Lee', phone: '3', email: 'c@b.co', docs: [] }
    ];
    await initResults('oscillators');
    const order = [...captured.matchAll(/<tr data-slug="([^"]+)">/g)].map(m => m[1]);
    assert.strictEqual(order[1], 'bell', `Bell paid for #2 but the list came out ${order.join(',')}`);
    assert.ok(/<td class="rank" data-label="#">2<span class="lock"/.test(captured),
      'the locked row does not show the lock next to its number');
    assert.ok(/Position locked\.[\s\S]*?holds #2 for &ldquo;oscillators&rdquo;[\s\S]*?href="\/contact"/.test(captured),
      'the lock tooltip does not say the spot is locked, name the spot, and offer the CTA');
    assert.strictEqual((captured.match(/class="lock"/g) || []).length, 1, 'unlocked rows are showing a lock');
  }
  listingsToReturn = [{ company: 'Acme', company_handle: 'acme', keyword: 'oscillators',
                        contact: 'Sam', phone: '(555) 2', email: 'a@b.co', docs: [] }];
  await initResults('oscillators');

  /* --- a page with real listings is the page we WANT found --- */
  assert.ok(headMeta && /^index/.test(headMeta.content),
    'a keyword with live listings is still hidden from Google');
  assert.ok(/oscillators suppliers/.test(document.title),
    'the results page title does not name the keyword');
  assert.ok(headCanon && /\/results\?q=oscillators/.test(headCanon.href),
    'the results page has no canonical URL');

  /* --- but the sample fixture never is --- */
  listingsToReturn = [{ company: 'Northbridge Components', company_slug: 'sample-northbridge',
                        company_handle: 'sample-northbridge', keyword: 'sample',
                        contact: 'Pat', phone: '(555) 4', email: 'n@b.co', docs: [] }];
  await initResults('sample');
  assert.ok(headMeta && /noindex/.test(headMeta.content),
    'the sample fixture page is indexable — fake companies would reach Google');
  listingsToReturn = [{ company: 'Acme', company_handle: 'acme', keyword: 'oscillators',
                        contact: 'Sam', phone: '(555) 2', email: 'a@b.co', docs: [] }];
  await initResults('oscillators');

  /* Buyers reach a supplier directly from the table. The "Request a Quote"
     button was removed for MVP1 (2026-08-31); phone and email columns are the
     contact path now, so those must stay. */
  const tbodyEmail = captured.slice(captured.indexOf('<tbody>'));
  assert.ok(/mailto:a@b\.co/.test(tbodyEmail),
    'the results table lost its email column — buyers cannot email straight from the list');
  assert.ok(/tel:/.test(tbodyEmail),
    'the results table lost its phone links');
  assert.ok(!/Request a Quote/.test(captured),
    'a Request a Quote button is back on the results page (removed for MVP1)');
  assert.ok(!/#rfq/.test(captured),
    'something still links to the removed in-page quote form');

  /* The position column is a plain "#" and the claim-order note is gone
     (both at Jacob's request, 2026-09-01). */
  assert.ok(/<th class="rank">#<\/th>/.test(captured),
    'the position column is not headed "#"');
  assert.ok(!/Held<\/th>|list-note|not a ranking/.test(captured),
    'the "Held" heading or the claim-order note is back on the results page');

  /* --- and every listing is numbered --- */
  assert.ok(/class="rank"[^>]*>1</.test(captured), 'listings are not numbered');

  /* --- the sponsor is the banner, and is NOT also a row ---
     Paying for the banner buys prominence, not a second appearance. Showing
     both is the kind of duplicate that makes a directory look padded, and it
     is what the sponsor is explicitly no longer supposed to get. */
  listingsToReturn = [
    { company: 'Sponsor Co', company_handle: 'sponsorco', keyword: 'oscillators',
      contact: 'Lee', phone: '(555) 9', email: 's@b.co', docs: [], banner: true, description: 'x' },
    { company: 'Acme', company_handle: 'acme', keyword: 'oscillators',
      contact: 'Sam', phone: '(555) 2', email: 'a@b.co', docs: [] },
    { company: 'Bell', company_handle: 'bell', keyword: 'oscillators',
      contact: 'Dana', phone: '(555) 3', email: 'b@b.co', docs: [] }
  ];
  await initResults('oscillators');

  assert.ok(/Exclusive Sponsor/.test(captured), 'the sponsor banner stopped rendering');
  const tbody = captured.slice(captured.indexOf('<tbody>'));
  assert.ok(!/Sponsor Co/.test(tbody),
    'the Exclusive Sponsor is still listed in the table as well as in the banner — it is shown twice');
  assert.ok(/Acme/.test(tbody) && /Bell/.test(tbody), 'the ordinary listings stopped rendering');

  /* numbering runs over what is actually in the list, so pulling the sponsor
     out must not leave a gap at the top */
  const ranks = [...tbody.matchAll(/class="rank"[^>]*>(\d+)</g)].map(m => m[1]);
  assert.deepStrictEqual(ranks, ['1', '2'],
    `the list is numbered ${ranks.join(',')} — removing the sponsor left a hole in the sequence`);

  /* the sponsor banner shows the supplier's own contact details (no quote button) */
  assert.ok(/premium-contact[\s\S]*?mailto:s@b\.co/.test(captured),
    'the sponsor banner lost the supplier email');
  assert.ok(!/Request a Quote/.test(captured),
    'a Request a Quote button is back on the sponsor banner (removed for MVP1)');
  /* a paid sponsor replaces the example banner and its Get Listed button */
  assert.ok(!/This Banner is Available|Get Listed For|John Doe/.test(captured),
    'the example banner or Get Listed button is showing on a keyword that already has a sponsor');

  console.log('search results OK — banner pitch on empty and unsponsored lists, numbered rows, sponsor not listed twice');
})();
