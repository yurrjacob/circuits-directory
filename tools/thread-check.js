#!/usr/bin/env node
/* The buyer's side of a quote request.

   For months this end did not exist. A supplier could open a request, type a
   reply and send it; it saved to a thread only the supplier could read, and the
   buyer — who has no account — never heard anything. The notification email
   told suppliers to "reply in your portal". The feature was not merely missing,
   it was lying to the person paying for it.

   So the things worth pinning down are: a wrong token reveals nothing, an
   outage never reads as "your request does not exist", and a supplier's reply
   still triggers the email that closes the loop. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');

const threadSrc = fs.readFileSync(path.join(ROOT, 'thread.js'), 'utf8');
const store = fs.readFileSync(path.join(ROOT, 'store.js'), 'utf8');
const portal = fs.readFileSync(path.join(ROOT, 'portal.js'), 'utf8');
const profile = fs.readFileSync(path.join(ROOT, 'profile.js'), 'utf8');

/* ---- the loop is actually wired end to end ---- */
assert.ok(/notifyBuyerOfReply\(/.test(portal),
  'the portal no longer tells the buyer when a supplier replies — the reply lands in a thread ' +
  'only the supplier can read, which is exactly the dead end this fixed');
assert.ok(/notifyBuyerOfReply/.test(store) && /kind: 'reply'/.test(store),
  'store.js has no reply notification');
assert.ok(/sent && sent\.token/.test(profile),
  'the quote form no longer passes the thread token, so the buyer gets no link back to the conversation');
assert.ok(/create_inquiry/.test(store),
  'submitInquiry no longer goes through create_inquiry, so there is no token to give the buyer');

/* the supplier must be signed in for the buyer to be emailed — otherwise
   anyone could POST an inquiry id and mail a stranger */
assert.ok(/getSession\(\)/.test(store) && /Authorization: 'Bearer '/.test(store),
  'the reply notification is sent without proving who is asking');

/* ---- the page itself, driven without a browser ---- */
let root = null;
const el = { set innerHTML(v){ root = String(v); }, get innerHTML(){ return root; },
             addEventListener(){}, value: '', style: {}, textContent: '', disabled: false };

let thread = null, throws = false, posted = null;
global.window = global;
global.location = { search: '?t=abc-123' };
global.URLSearchParams = class { constructor(s){ this.s = s; } get(){ return /t=([^&]*)/.exec(this.s || '')?.[1] || ''; } };
global.document = {
  getElementById: id => (id === 'th-root' ? el : null),
  querySelector: () => null
};
global.escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
global.fetchThreadByToken = async () => { if (throws) throw new Error('network'); return thread; };
global.postBuyerMessage = async (t, b) => { posted = { t, b }; return 'ok'; };

/* load() is async, so the page is not rendered the instant the script runs —
   asserting immediately tested an empty div and passed for the wrong reason. */
const run = async () => { (0, eval)(threadSrc); await new Promise(r => setImmediate(r)); };

(async () => {
/* --- a real thread --- */
thread = {
  id: 'i1', company: 'Northbridge Components', company_handle: 'northbridge',
  body: 'Do you stock 100nF 0402?', part_number: 'NB-100N', quantity: '5,000',
  from_name: 'Sam', created_at: '2026-08-01T10:00:00Z', closed: false,
  messages: [{ author: 'supplier', body: 'Yes — 3 week lead time.', created_at: '2026-08-02T09:00:00Z' }]
};
await run();
assert.ok(/Northbridge Components/.test(root), 'the thread does not name the company it went to');
assert.ok(/Do you stock 100nF 0402\?/.test(root), 'the buyer cannot see what they originally asked');
assert.ok(/3 week lead time/.test(root), "the supplier's reply is not shown — the whole point of the page");
assert.ok(/id="th-form"/.test(root), 'the buyer has no way to answer');

/* --- no reply yet: say so plainly rather than showing an empty box --- */
thread = { ...thread, messages: [] };
await run();
assert.ok(/No reply yet/.test(root), 'a thread with no reply gives the buyer nothing to read');

/* --- an old thread is closed, and says why --- */
thread = { ...thread, closed: true };
await run();
assert.ok(!/id="th-form"/.test(root), 'a closed conversation still offers a reply box');
assert.ok(/closed/i.test(root), 'a closed conversation does not say that it is closed');

/* --- a bad token must not look like a broken site, and an outage must not
       look like "your request was never sent" --- */
thread = null; throws = false;
await run();
assert.ok(/could not find/i.test(root), 'an unknown token does not explain itself');
assert.ok(!/went wrong/i.test(root), 'an unknown token is being reported as an outage');

throws = true;
await run();
assert.ok(/could not load/i.test(root) && /try/i.test(root),
  'an outage tells the buyer their request does not exist — they would conclude it was never sent');
assert.ok(/safe/i.test(root), 'an outage does not reassure the buyer their request still exists');
throws = false;

/* --- a link with no token at all --- */
global.location = { search: '' };
await run();
assert.ok(/not complete/i.test(root), 'a truncated link gives no useful explanation');

console.log('buyer thread OK — replies arrive, bad links reveal nothing, outages read as outages');
})();
