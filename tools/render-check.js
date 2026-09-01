#!/usr/bin/env node
/* Renders a fully-populated profile with stubs instead of a browser or network,
   then asserts the markup is balanced and the sidebar rebuild is intact.
   Run on its own, or via tools/check.js which requires it. */
global.escapeHtml = s => (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
global.avatarSvg = () => '<svg class="silhouette"></svg>';
global.isLogoUrl = s => /^https?:\/\//i.test(s||'');
global.isValidEmail = () => true;
global.sendFounderEmail = () => {};
global.trackEvent = () => {};
global.submitInquiry = async () => {};
global.submitReview = async () => {};
global.notifySupplier = async () => true;
/* profile.js runs after app.js on company.html; these come from there.
   check.js separately asserts app.js really defines them, so these stubs
   cannot quietly drift away from the real thing. */
global.armSpamTrap = () => {};
global.looksLikeSpam = () => false;
global.fakeSuccess = () => {};
global.rateLimitMessage = () => null;

/* Real code, not stubs. Two separate renderers on purpose: teamMarkHtml() is
   our mark and belongs to the account, badgeHtml() is a paid label belonging to
   one keyword listing. Rendering either in the other's place is exactly what
   this check exists to catch. */
{
  const appSrc = require('fs').readFileSync(require('path').join(__dirname, '..', 'app.js'), 'utf8');
  const from = appSrc.indexOf('function teamMarkHtml');
  const to = appSrc.indexOf('/* Shown when a lookup fails');
  if (from < 0 || to < 0) throw new Error('could not find the badge helpers in app.js');
  (0, eval)(appSrc.slice(from, to)
    .replace('function teamMarkHtml', 'global.teamMarkHtml = function')
    .replace('function badgeHtml', 'global.badgeHtml = function'));
}

const CO = { slug:'aaa', handle:'aaa_electronics', name:'AAA Electronics, Inc.',
  tagline:'Authorised distributor of analog and power ICs', description:'Line one.\nLine two.',
  logo:'https://x/logo.png', website:'https://aaa.example.com/', phone:'(555) 123-4567',
  email:'sales@aaa.example.com', contact:'Jane Doe', address:'Nashua, NH', founded:'1998',
  employees:'50–200', reviews_enabled:true,
  hours:{mon:'8:00–17:00',fri:'8:00–15:00'}, socials:{linkedin:'https://linkedin.com/x'},
  certifications:[{name:'ISO 9001',issuer:'BSI',year:2021}],
  team:[{name:'Jane Doe',role:'VP Sales',email:'jane@aaa.example.com'}],
  gallery:[{url:'https://x/1.png',caption:'Warehouse'}] };

global.fetchCompanyByHandle = async () => CO;
global.fetchCompanyKeywords = async () => ([
  { keyword:'analog ics', banner:true, badge:{text:'Authorized',color:'#c9a227'}, docs:[{name:'Line card',url:'https://x/d.pdf'}] },
  { keyword:'voltage regulator', banner:false, badge:null, docs:[] }]);
global.fetchReviews = async () => ([{ rating:5, author_name:'Bob', body:'Great', reply:'Thanks', created_at:'2026-08-01T00:00:00Z' }]);
global.companyClaimed = async () => true;
global.companyRunByStaff = async () => false;

let captured = '';
const el = (id) => ({ set innerHTML(v){ if(id==='profile-body') captured = v; },
  addEventListener(){}, scrollIntoView(){}, focus(){}, style:{}, querySelectorAll:()=>[],
  // the save control reads data- attributes and toggles classes
  dataset:{ slug:'aaa', handle:'aaa_electronics', name:'AAA Electronics, Inc.' },
  classList:{ toggle(){}, add(){}, remove(){}, contains(){ return false; } },
  textContent:'', title:'' });

/* Saved suppliers live in localStorage. Node has none, and the site must not
   fall over in a browser that blocks it either — so stub it and let the real
   try/catch in profile.js do its job. */
global.localStorage = {
  _v: {},
  getItem(k){ return Object.prototype.hasOwnProperty.call(this._v, k) ? this._v[k] : null; },
  setItem(k, v){ this._v[k] = String(v); },
  removeItem(k){ delete this._v[k]; }
};
global.document = {
  querySelector: () => null, querySelectorAll: () => [],
  getElementById: id => el(id),
  createElement: () => ({ style:{}, setAttribute(){}, appendChild(){} }),
  head: { appendChild(){} }, title:''
};
global.location = { search:'', pathname:'/aaa_electronics' };
global.URLSearchParams = class { get(){ return null; } };

eval(require('fs').readFileSync(require("path").join(__dirname,"..","profile.js"),'utf8'));

(async () => {
  const ok = await initProfile();
  const assert = require('assert');
  assert.strictEqual(ok, true, 'initProfile should report success');

  // tag balance across the whole rendered fragment
  const opens = (captured.match(/<(div|aside|section)\b[^>]*>/g)||[]).length;
  const closes = (captured.match(/<\/(div|aside|section)>/g)||[]).length;
  assert.strictEqual(opens, closes, `unbalanced block tags: ${opens} open vs ${closes} close`);

  for(const need of ['pf-layout','pf-main','pf-side','pf-side-card','pf-cta','pf-rows',
                     'id="pf-email-cta"','id="pf-phone"','id="pf-email"','id="pf-site"',
                     'aaa_electronics']){
    assert.ok(captured.includes(need), 'missing from render: ' + need);
  }
  /* The in-page quote form was removed 2026-08-21 (Jacob) — the profile
     provides contact details instead, and nothing may render or link it. */
  assert.ok(!/id="rfq-form"|id="rfq-open"|#rfq/.test(captured),
    'the removed Request a Quote form (or a link to it) is back on the profile');
  /* Opening hours were removed from profiles on 2026-08-20 at Jacob's
     direction — stored hours data must no longer render. */
  assert.ok(!captured.includes('Opening hours'), 'the removed Opening hours section is back');
  /* Listing documents must not get their own profile section either; the
     keyword tags now carry the visitor to the listing page instead. */
  assert.ok(!/pf-docs/.test(captured), 'the removed Documentation section is back');
  assert.ok(/results\?q=.*&(amp;)?hl=/.test(captured),
    'keyword tags no longer point at the results page with the highlight param');
  // the CTA must appear exactly once, or wireProfile binds the wrong node
  assert.strictEqual((captured.match(/id="pf-email-cta"/g)||[]).length, 1, 'pf-email-cta must be unique');
  // contact details must not be duplicated in the main column any more
  assert.ok(!captured.includes('pf-contact'), 'old duplicate contact block still rendering');
  assert.ok(!captured.includes('pf-actions'), 'old hero action column still rendering');

  // sidebar values must be single-line: the tooltip carries the untruncated text
  assert.ok(captured.includes('pf-row-v" title='), 'sidebar rows lost their full-value tooltip');
  /* Everything a company asserts about itself must still be traceable to the
     company rather than to us — a buyer picking a supplier on the strength of
     "ISO 9001" is deciding on something nobody checked. The wording moved out
     of a paragraph under every section and into one line at the foot of the
     page plus hover text, but it must not disappear altogether. */
  assert.ok(captured.includes('ISO 9001'), 'the certifications section stopped rendering');
  assert.ok(/class="pf-source"/.test(captured),
    'the profile no longer says where its details come from');
  assert.ok(/supplied by the company/.test(captured),
    'the footer line no longer attributes the details to the company');
  assert.ok(/href="\/terms#what-we-check"/.test(captured),
    'the footer line does not link to what Circuits.com actually checks');
  assert.ok(/pf-certs" title="[^"]*not checked/.test(captured),
    'the certifications list lost its hover caveat');
  assert.ok(/paid label chosen by this company/.test(captured),
    'the Trust Badge lost the hover text identifying it as a paid label');
  // and the old paragraph clutter must be gone, or nothing was actually removed
  assert.ok(!/<p class="pf-note">As stated by the company/.test(captured),
    'the old certifications disclaimer paragraph is still on the page');
  assert.ok(!/paid Trust Badges chosen by the/.test(captured),
    'the old Trust Badge disclaimer paragraph is still on the page');
  // the heading must not render a raw HTML entity
  assert.ok(!/&amp;amp;/.test(captured), 'a section heading is double-escaping its ampersand');
  // a blank certification row must not leave a stray bullet
  assert.ok(!/<li><b><\/b>/.test(captured), 'an empty certification renders as an empty bullet');
  // and the badge note must not send buyers to certifications as if those were checked
  assert.ok(!/listed under Certifications/.test(captured),
    'the badge note still implies the certifications list is verified');

  // buyers compare several suppliers; saving one must not require an account
  assert.ok(captured.includes('id="pf-save"'), 'the save-supplier control is missing');
  assert.ok(captured.includes('data-slug="aaa"'), 'the save control does not identify the company');

  // the short link must be copyable — it is what goes on adverts
  assert.ok(captured.includes('id="pf-copy"'), 'copy-link control missing from the sidebar');
  assert.ok(captured.includes('https://circuits.com/aaa_electronics'), 'copy-link has the wrong URL');

  // reviews are opt-in — with them off and none approved, the section must vanish
  assert.ok(captured.includes('Buyer reviews'), 'reviews section missing when enabled');
  CO.reviews_enabled = false;
  global.fetchReviews = async () => [];
  await initProfile();
  assert.ok(!captured.includes('Buyer reviews'),
    'reviews section still renders for a company that does not accept reviews');
  assert.ok(!captured.includes('review-form'), 'review form still renders when reviews are off');

  /* A claimed listing must not be labelled unclaimed, and an unclaimed one must
     say so plainly — a buyer needs to know the details are unconfirmed. */
  assert.ok(!captured.includes('lb-unclaimed'), 'a claimed listing was labelled Unclaimed');
  global.companyClaimed = async () => false;
  await initProfile();
  assert.ok(captured.includes('lb-unclaimed'), 'an unclaimed listing is not marked as such');
  assert.ok(captured.includes('pf-unclaimed-card'), 'the unclaimed listing does not say its details are unconfirmed');
  /* Claims were retired 2026-09-01 (Jacob): nothing on a profile may invite one,
     because there is no longer anywhere for staff to approve it. */
  assert.ok(!/\/claim\b|pf-claim"/.test(captured), 'a profile still links to the retired claim flow');
  global.companyClaimed = async () => true;

  /* The two marks must never swap places.
       - a Trust Badge is PAID and belongs to ONE keyword listing, because the
         same company can pick a different one per keyword. It renders in the
         Keyword Listings section and nowhere near the name.
       - the Circuits.com mark belongs to the ACCOUNT and renders beside the
         name. It is not a badge, cannot be bought, and never sits on a listing. */
  const heading = () => (captured.match(/<h1>[\s\S]*?<\/h1>/) || [''])[0];
  const listings = () => {
    const i = captured.indexOf('Keyword Listings');
    return i < 0 ? '' : captured.slice(i, captured.indexOf('</section>', i));
  };

  // an ordinary company: badge on the listing, nothing beside the name
  assert.ok(!/lb-cx/.test(captured), 'an ordinary company is wearing the Circuits.com mark');
  /* The star note explains a symbol. With no sponsored keyword there is no
     symbol, and the line just advertises something the company has not bought. */
  // the star lives on the keyword tags; the note explaining it is separate
  const kwTags = () => (captured.match(/<div class="kw-tags[\s\S]*?<\/div>/) || [''])[0];
  assert.ok(/★ marks a Circuits-Keyword/.test(captured),
    'the star note is missing for a company that does sponsor a keyword');
  assert.ok(/★/.test(kwTags()), 'the sponsored keyword lost its star');
  {
    const noBanner = [
      { keyword:'analog ics', banner:false, badge:{text:'Authorized',color:'#c9a227'}, docs:[] },
      { keyword:'voltage regulator', banner:false, badge:null, docs:[] }];
    const saved = global.fetchCompanyKeywords;
    global.fetchCompanyKeywords = async () => noBanner;
    await initProfile();
    assert.ok(!/★/.test(kwTags()),
      'a company with no sponsored keyword is showing a star on a keyword');
    assert.ok(!/marks a Circuits-Keyword/.test(captured),
      'a company with no sponsor banner is still told what the star means');
    // the section itself must survive — only the note goes
    assert.ok(/Keyword Listings/.test(captured), 'the keyword section vanished with the note');
    assert.ok(/kw-lb/.test(captured), 'the listing badges vanished with the note');
    global.fetchCompanyKeywords = saved;
    await initProfile();
  }

  assert.ok(/kw-lb/.test(listings()), 'the keyword listing lost its Trust Badge');
  assert.ok(/Authorized/.test(listings()), 'the listing badge text is missing');
  assert.ok(!/Authorized/.test(heading()),
    'a paid Trust Badge is rendering beside the company name');
  assert.ok(!/style="background:/.test(heading()),
    'a coloured Trust Badge is rendering beside the company name');

  // a Circuits.com-run profile: our mark beside the name, still no badge there
  global.companyRunByStaff = async () => true;
  await initProfile();
  assert.ok(/<h1>[^<]*<span class="lb lb-cx"/.test(heading()),
    'an admin-run profile does not show the Circuits.com mark next to its name');
  assert.ok(/Circuits\.com team/.test(heading()), 'the mark on the name lost its hover text');
  assert.ok(!/lb-cx/.test(listings()),
    'the Circuits.com mark is being rendered against a keyword listing — it is not a badge');
  assert.ok(!/paid label/.test(heading()),
    'the team mark is carrying the paid-badge disclaimer');
  global.companyRunByStaff = async () => false;

  console.log('render smoke test passed —', opens, 'balanced block tags, reviews and claim states OK');
})();
