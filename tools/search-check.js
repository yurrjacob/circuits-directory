#!/usr/bin/env node
/* The search results page, driven without a browser.

   An empty keyword opens with the keyword-available pitch (mocked-up sponsor
   card and listing row — Jacob's chosen layout, restored 2026-08-20), with the
   buyer's "tell me when someone lists" capture at the bottom. The other
   invariants stand: every search logged, empty pages noindexed, and a failed
   lookup never mistaken for an unclaimed keyword — that would sell a keyword
   twice. */
const fs = require('fs'), path = require('path'), assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

global.escapeHtml = s => (s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
global.safeUrl = u => { const s = (u || '').trim(); if(!s) return ''; if(/^https?:\/\//i.test(s)) return s; if(/^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(s)) return 'https://' + s; return ''; };
global.avatarSvg = () => '<svg class="silhouette"></svg>';
global.isLogoUrl = s => /^https?:\/\//i.test(s || '');
global.profileUrl = h => '/' + h;
global.docLinks = () => '';
global.badgeHtml = () => '';
/* the real quote button, not a stub — whether every listing gets one is the
   thing being checked */
{
  const f = src.indexOf('function quoteBtn');
  assert.ok(f >= 0, 'quoteBtn is gone from app.js');
  let d = 0, i = f;
  for(; i < src.length; i++){ if(src[i] === '{') d++; else if(src[i] === '}'){ d--; if(!d) break; } }
  (0, eval)(src.slice(f, i + 1).replace('function quoteBtn', 'global.quoteBtn = function'));
}
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
  /* --- nothing listed: the keyword-available pitch, wanted-form at the
         bottom (restored to the pre-redesign layout on 2026-08-20 at Jacob's
         direction: pitch first, "tell me when someone lists" last) --- */
  listingsToReturn = []; relatedToReturn = [];
  await initResults('oscillators');

  assert.ok(/This Circuits-Keyword&trade; is available/.test(captured),
    'the empty result no longer opens with the keyword-available pitch');
  for (const ghost of ['Your Company or Name', 'sales@yourcompany.com', '(555) 123-4567', 'Your Contact']) {
    assert.ok(captured.includes(ghost),
      `the mocked-up example listing is missing its "${ghost}" placeholder`);
  }
  assert.ok(/Be The First Listed For/.test(captured),
    'the pitch lost its call to action');
  assert.ok(/id="wanted-form"/.test(captured),
    'there is no way for a buyer to say what they were looking for');
  assert.ok(/type="email"/.test(captured), 'the demand form takes no email address');
  assert.ok(/privacy/.test(captured), 'the email capture does not link the privacy policy');
  assert.ok(captured.indexOf('This Circuits-Keyword&trade; is available') < captured.indexOf('wanted-form'),
    'the buyer capture is not at the bottom — the pitch should come first');

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
  assert.deepStrictEqual(logged, { term: 'oscillators', hits: 1 },
    'a search that found something was not recorded with its hit count');

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

  /* --- every listing offers a way to ask for a quote --- */
  assert.ok(/Request a Quote/.test(captured), 'a listing has no Request a Quote button');

  /* Phone and email sit directly in the table — put back on 2026-08-20 at
     Jacob's direction: a buyer should be able to reach a supplier without a
     detour through the profile. */
  const tbodyEmail = captured.slice(captured.indexOf('<tbody>'));
  assert.ok(/mailto:a@b\.co/.test(tbodyEmail),
    'the results table lost its email column — buyers cannot email straight from the list');
  assert.ok(/tel:/.test(tbodyEmail),
    'the results table lost its phone links');

  /* The position must not present itself as a ranking. */
  assert.ok(!/<th class="rank"[^>]*>#</.test(captured),
    'the position column is back to a bare "#", which buyers read as a ranking');
  assert.ok(/not a ranking/.test(captured),
    'the results page no longer says the order is not a ranking');
  /* The in-page quote form is off (2026-08-21) — the quote button now opens
     the buyer's own mail client addressed to the supplier. */
  assert.ok(/btn-quote" href="mailto:a@b\.co/.test(captured),
    'the quote button no longer opens an email to the supplier');
  assert.ok(!/#rfq/.test(captured),
    'something still links to the removed in-page quote form');

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

  assert.ok(/premium-contact[\s\S]*?Request a Quote/.test(captured),
    'the sponsor banner has no Request a Quote button');

  /* a listing with no profile page still has to be contactable */
  assert.ok(/mailto:a@b\.co/.test(quoteBtn({ email: 'a@b.co' })),
    'a listing without a profile page loses its quote button entirely');
  /* and one with no email still points the buyer somewhere useful */
  assert.ok(/href="\/acme"/.test(quoteBtn({ company_handle: 'acme' })),
    'a listing with no email no longer links to the profile for contact info');
  assert.strictEqual(quoteBtn({}), '', 'a listing with no handle and no email should render no button');

  console.log('search results OK — pitch page with buyer capture at the bottom, numbered rows, sponsor not listed twice');
})();
