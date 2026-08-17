#!/usr/bin/env node
/* What does the site tell a visitor when the database is unreachable?
   This matters more than a typical error state, because the "nothing found"
   screens on Circuits.com are sales pitches: the results page offers to sell
   the keyword, and the profile page offers to sell the address. If a failed
   lookup falls through to those, we advertise things that already belong to
   paying customers — and could sell the same keyword twice.
   Run on its own, or via tools/check.js which requires it. */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const ROOT = path.join(__dirname, '..');

const DEAD = () => { throw new Error('TypeError: Failed to fetch'); };
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function baseGlobals(captured){
  const stub = id => ({
    set innerHTML(v){ captured[id] = v; },
    set textContent(v){ captured[id] = v; },
    get value(){ return ''; }, set value(v){},
    addEventListener(){}, focus(){}, scrollIntoView(){}, style:{},
    querySelector: () => null, querySelectorAll: () => [], appendChild(){},
    dataset: {}, setAttribute(){}
  });
  global.escapeHtml = s => (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  global.avatarSvg = () => '<svg></svg>';
  global.isLogoUrl = () => false;
  global.profileUrl = h => '/' + h;
  global.normKw = s => (s||'').toLowerCase().trim();
  global.document = {
    getElementById: id => stub(id), querySelector: () => null, querySelectorAll: () => [],
    createElement: () => ({ style:{}, setAttribute(){}, appendChild(){} }),
    head: { appendChild(){} }, title: ''
  };
  global.window = global;
  return stub;
}

/* --- the results page --- */
function checkSearch(){
  const captured = {};
  baseGlobals(captured);
  global.fetchApprovedByKeyword = DEAD;
  global.location = { search: '?q=voltage+regulators', pathname: '/results' };
  global.URLSearchParams = class { get(){ return 'voltage regulators'; } };

  eval(read('app.js'));

  return initResults().then(() => {
    const html = captured['results-body'] || '';
    assert.ok(html, 'the results page rendered nothing at all');
    assert.ok(!/is available/i.test(html),
      'a dead database still advertises the keyword as available to buy');
    assert.ok(!/Be The First Listed/i.test(html),
      'a dead database still shows the "be the first listed" sales pitch');
    assert.ok(!/Exclusive Sponsor/i.test(html),
      'a dead database still shows the sponsor slot as unsold');
    assert.ok(/couldn&rsquo;t load|couldn't load/i.test(html),
      'no load-failure message was shown');
    assert.strictEqual(captured['result-count'], '–',
      'the result count still reports a real-looking number');
  });
}

/* --- the profile page --- */
function checkProfile(){
  const captured = {};
  baseGlobals(captured);
  global.fetchCompanyByHandle = DEAD;
  global.fetchProfileByHandle = DEAD;
  global.fetchCompanyKeywords = async () => [];
  global.fetchReviews = async () => [];
  global.companyClaimed = async () => true;
  global.armSpamTrap = () => {};
  global.looksLikeSpam = () => false;
  global.fakeSuccess = () => {};
  global.rateLimitMessage = () => null;
  global.isValidEmail = () => true;
  global.sendFounderEmail = () => {};
  global.trackEvent = () => {};
  global.submitInquiry = async () => {};
  global.submitReview = async () => {};
  global.loadErrorHtml = (what) =>
    `<div class="empty load-error"><div class="big">We couldn&rsquo;t load ${what}</div></div>`;
  global.location = { search: '', pathname: '/aaa_electronics' };
  global.URLSearchParams = class { get(){ return null; } };

  eval(read('profile.js'));

  return initProfile().then(ok => {
    const html = captured['profile-body'] || '';
    assert.strictEqual(ok, false, 'a failed profile lookup reported success');
    assert.ok(!/not taken yet/i.test(html),
      'a dead database still tells the visitor the address is free to claim');
    assert.ok(!/Claim it here/i.test(html),
      'a dead database still offers to sell the address');
    assert.ok(/couldn&rsquo;t load|couldn't load/i.test(html),
      'no load-failure message was shown on the profile page');
  });
}

module.exports = Promise.resolve()
  .then(checkSearch)
  .then(checkProfile)
  .then(() => { console.log('failure-mode check passed — a dead database sells nothing'); })
  .catch(e => { console.error(e.message); process.exit(1); });
