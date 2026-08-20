#!/usr/bin/env node
/* The search results page, driven without a browser.

   The thing worth protecting here is who the page is FOR. A search that finds
   nobody used to open with "this keyword is available" and a mocked-up company
   card — an advert aimed at the one person on the page who is not buying
   advertising. The buyer left, and the buyer is the demand the listings are
   sold on. So these assert the empty result answers the searcher first, and
   that a failed lookup is never mistaken for an unclaimed keyword. */
const fs = require('fs'), path = require('path'), assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

global.escapeHtml = s => (s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
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

const from = src.indexOf('async function initResults');
const to = src.indexOf('/* ===================================================================');
assert.ok(from >= 0 && to > from, 'could not find initResults in app.js');
(0, eval)(src.slice(from, to).replace('async function initResults', 'global.initResults = async function'));

(async () => {
  /* --- nothing listed: the buyer is answered first --- */
  listingsToReturn = []; relatedToReturn = [];
  await initResults('oscillators');

  assert.ok(/No one is listed for/.test(captured),
    'the empty result does not tell the searcher plainly that nobody is listed');
  assert.ok(/id="wanted-form"/.test(captured),
    'there is no way for a buyer to say what they were looking for');
  assert.ok(/type="email"/.test(captured), 'the demand form takes no email address');
  assert.ok(/privacy/.test(captured), 'the email capture does not link the privacy policy');

  // the pitch may still be there, but must not be the opening line
  assert.ok(captured.indexOf('No one is listed for') < captured.indexOf('claim-strip'),
    'the keyword pitch still comes before the answer to the buyer');

  /* --- and the fake company is gone --- */
  for (const ghost of ['Your Company or Name', 'sales@yourcompany.com', '(555) 123-4567', 'Your Contact']) {
    assert.ok(!captured.includes(ghost),
      `the mocked-up listing is back on the page: "${ghost}" reads as a real company`);
  }

  /* --- every search is recorded, hit or miss --- */
  assert.deepStrictEqual(logged, { term: 'oscillators', hits: 0 },
    'a search that found nothing was not recorded');

  /* --- an empty page must not invite Google in --- */
  assert.ok(headMeta && /noindex/.test(headMeta.content),
    'a keyword with no listings is left indexable — Google would fill up with empty pages');

  /* --- related listings when the exact keyword is unclaimed --- */
  relatedToReturn = [{ company: 'Bell Components', company_handle: 'bell', keyword: 'oscillator',
                       contact: 'Dana', phone: '(555) 1' }];
  await initResults('crystal oscillator');
  assert.ok(/Listed under a related keyword/.test(captured),
    'a near-miss search does not offer the related listings it found');
  assert.ok(/Bell Components/.test(captured), 'the related listing is missing');
  assert.ok(/may or may not cover/.test(captured),
    'related listings are presented as if they were exact matches');

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

  /* The raw email link is deliberately NOT in the table. It gave buyers a path
     nobody can measure, sitting right next to the one we can, and left every
     supplier's address in public for scrapers. It stays on the profile, where
     the click is tracked and there is context around it. */
  const tbodyEmail = captured.slice(captured.indexOf('<tbody>'));
  assert.ok(!/mailto:/.test(tbodyEmail),
    'the results table exposes supplier email addresses again — that is the unmeasurable path and a scraper target');

  /* The position must not present itself as a ranking. */
  assert.ok(!/<th class="rank"[^>]*>#</.test(captured),
    'the position column is back to a bare "#", which buyers read as a ranking');
  assert.ok(/not a ranking/.test(captured),
    'the results page no longer says the order is not a ranking');
  assert.ok(/href="\/acme#rfq"/.test(captured),
    'the quote button does not point at that company\'s own quote form');

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
  assert.strictEqual(quoteBtn({}), '', 'a listing with no handle and no email should render no button');

  console.log('search results OK — buyer answered first, numbered rows, sponsor not listed twice');
})();
