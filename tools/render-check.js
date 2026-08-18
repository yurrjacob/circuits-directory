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

let captured = '';
const el = (id) => ({ set innerHTML(v){ if(id==='profile-body') captured = v; },
  addEventListener(){}, scrollIntoView(){}, focus(){}, style:{}, querySelectorAll:()=>[] });
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
                     'id="rfq-open"','id="pf-phone"','id="pf-email"','id="pf-site"',
                     'Opening hours','pf-claim','aaa_electronics']){
    assert.ok(captured.includes(need), 'missing from render: ' + need);
  }
  // the CTA must appear exactly once, or wireProfile binds the wrong node
  assert.strictEqual((captured.match(/id="rfq-open"/g)||[]).length, 1, 'rfq-open must be unique');
  // contact details must not be duplicated in the main column any more
  assert.ok(!captured.includes('pf-contact'), 'old duplicate contact block still rendering');
  assert.ok(!captured.includes('pf-actions'), 'old hero action column still rendering');

  // sidebar values must be single-line: the tooltip carries the untruncated text
  assert.ok(captured.includes('pf-row-v" title='), 'sidebar rows lost their full-value tooltip');
  /* Everything a company asserts about itself must be labelled as its own
     claim. A buyer picking a supplier on the strength of "ISO 9001" is making
     a purchasing decision on something nobody checked. */
  assert.ok(captured.includes('ISO 9001'), 'the certifications section stopped rendering');
  assert.ok(/Circuits\.com has not\s+independently verified/.test(captured),
    'certifications are presented as fact rather than as the company\'s own claim');
  assert.ok(captured.includes('pf-claimed-note'), 'the certifications disclaimer is gone');
  assert.ok(/paid labels chosen by the company/.test(captured),
    'the Trust Badge is no longer identified as a paid label');
  // and the badge note must not send buyers to certifications as if those were checked
  assert.ok(!/listed under Certifications/.test(captured),
    'the badge note still implies the certifications list is verified');

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
  assert.ok(captured.includes('pf-unclaimed-card'), 'the unclaimed listing has no claim prompt');
  assert.ok(captured.includes('/claim?c='), 'the unclaimed prompt does not link to the claim flow');
  global.companyClaimed = async () => true;

  console.log('render smoke test passed —', opens, 'balanced block tags, reviews and claim states OK');
})();
