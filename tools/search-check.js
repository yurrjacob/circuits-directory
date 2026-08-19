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
global.document = {
  getElementById: id => (id === 'results-body' ? body : node()),
  querySelector: () => null, querySelectorAll: () => []
};
const body = { set innerHTML(v){ captured = String(v); }, get innerHTML(){ return captured; },
               addEventListener(){}, style: {}, querySelector: () => null, querySelectorAll: () => [] };
global.location = { search: '?q=oscillators' };
global.URLSearchParams = class { constructor(){} get(){ return 'oscillators'; } };

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

  console.log('search results OK — buyer answered first, no fake company, outages never logged as misses');
})();
