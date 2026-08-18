#!/usr/bin/env node
/* The quote-request inbox, driven without a browser.

   What matters here is behaviour, not markup: a list you can open, a thread
   that shows the original message, and an unread count that only drops for the
   request you actually opened. The old screen expanded every request at once
   and marked them all read the moment the tab was clicked — both of which
   looked fine in a screenshot. */
const fs = require('fs'), path = require('path'), assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'portal.js'), 'utf8');
const from = src.indexOf('function inquirySummary');
const to = src.indexOf('/* ---------- promote: printable artwork ----------');
assert.ok(from >= 0 && to > from, 'could not find the inbox code in portal.js');
// markInquirySeen lives further up, with the unread badge it belongs to
const seenFrom = src.indexOf('function markInquirySeen');
const seenTo = src.indexOf('/* ---------- account ----------');
assert.ok(seenFrom >= 0 && seenTo > seenFrom, 'could not find markInquirySeen in portal.js');

/* --- the smallest world the inbox needs --- */
const DOM = {};
const node = id => (DOM[id] = DOM[id] || {
  id, _html: '', value: '', textContent: '', disabled: false, dataset: {},
  get innerHTML(){ return this._html; }, set innerHTML(v){ this._html = String(v); },
  addEventListener(){}, querySelector(){ return null; }
});
global.el = node;
global.escapeHtml = s => (s || '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
global.document = { querySelector: () => null, querySelectorAll: () => [], getElementById: node };
global.toast = () => {};
global.markUnread = () => { global.__unreadDrawn = PT.inquiries.filter(q => q.status === 'New').length; };

const statusWrites = [];
global.setInquiryStatus = async (id, s) => { statusWrites.push([id, s]); };
let threadFetches = 0;
global.fetchThread = async () => { threadFetches++; return [{ author: 'supplier', body: 'On it.', created_at: '2026-08-18T10:00:00Z' }]; };
global.postMessage = async () => null;
global.sendFounderEmail = () => {};

const PT = global.PT = {
  slug: 'aaa', co: { name: 'AAA Electronics' }, openInquiry: null,
  inquiries: [
    { id: 'q1', from_name: 'Dana Ruiz', from_company: 'Northgate', from_email: 'dana@northgate.example',
      phone: '(555) 200-3000', part_number: 'LM317T', quantity: '500', status: 'New',
      body: 'Need 500 of these, RoHS, delivered to Nashua. What is your lead time?',
      created_at: new Date().toISOString() },
    { id: 'q2', from_name: 'Sam Okoye', from_company: '', from_email: 'sam@example.com',
      phone: '', part_number: '', quantity: '', status: 'Won',
      body: 'x'.repeat(400), created_at: '2026-07-02T09:15:00Z' },
    /* a SECOND unread one, deliberately: with only one, marking every request
       read and marking one read look identical, and the old bulk behaviour
       would slip straight through */
    { id: 'q3', from_name: 'Lee Park', from_company: 'Cobalt', from_email: 'lee@cobalt.example',
      phone: '', part_number: 'NE555', quantity: '2000', status: 'New',
      body: 'Do you stock these in DIP-8?', created_at: '2026-08-17T12:00:00Z' }
  ]
};

(0, eval)(src.slice(seenFrom, seenTo) + '\n' + src.slice(from, to));

const html = () => node('pt-inquiries')._html;

/* --- the list --- */
renderInquiries();
assert.ok(/q-list/.test(html()), 'the inbox does not render a list');
assert.strictEqual((html().match(/data-open=/g) || []).length, 3, 'expected one openable row per request');
assert.ok(/Dana Ruiz/.test(html()) && /Sam Okoye/.test(html()), 'the list does not name the senders');
assert.ok(/q-unread/.test(html()), 'a New request is not marked unread in the list');
// the list is a summary: no reply boxes, no full bodies, and nothing fetched yet
assert.ok(!/textarea/.test(html()), 'the list is rendering reply boxes — that was the old expanded view');
assert.ok(!/data-send/.test(html()), 'the list is rendering send buttons');
assert.strictEqual(threadFetches, 0, 'the list fetched threads before anything was opened');
assert.ok(!html().includes('x'.repeat(200)), 'the list is dumping the whole message body');

/* --- opening one --- */
PT.openInquiry = 'q1';
renderInquiries();
assert.ok(/q-open/.test(html()), 'opening a request does not show the conversation');
assert.ok(/data-back/.test(html()), 'there is no way back to the list');
assert.ok(/textarea/.test(html()) && /data-send="q1"/.test(html()), 'the open request has no reply box');
assert.ok(/dana@northgate\.example/.test(html()), 'the open request does not show how to reach them');
assert.ok(/LM317T/.test(html()) && /500/.test(html()), 'the open request lost the part and quantity');
assert.ok(!/Sam Okoye/.test(html()), 'the other request is still on screen — this is not one thread at a time');
assert.ok(/data-status="q1"/.test(html()), 'the open request cannot be moved along the pipeline');

/* --- the thread reads as a conversation, starting with what they sent --- */
(async () => {
  // opening the request already drew the thread; let that settle rather than
  // drawing it again, so the fetch count means what it says
  await new Promise(r => setTimeout(r, 0));
  const t = node('th-q1')._html;
  assert.strictEqual(threadFetches, 1,
    'opening one request should fetch exactly one thread, not every thread');
  assert.ok(t.indexOf('Dana Ruiz') < t.indexOf('You'),
    'the buyer’s original message is not the first thing in the thread');
  assert.ok(/Need 500 of these/.test(t), 'the original request is missing from the thread');
  assert.ok(/On it\./.test(t), 'the replies are missing from the thread');
  assert.ok(!/<b>Buyer:<\/b>/.test(t), 'the buyer is still labelled "Buyer" rather than by name');

  /* --- unread only drops for the one that was opened --- */
  assert.strictEqual(PT.inquiries[0].status, 'New', 'setup: q1 should still be New here');
  markInquirySeen(PT.inquiries[0]);
  assert.strictEqual(PT.inquiries[0].status, 'Open', 'opening a request did not mark it seen');
  assert.deepStrictEqual(statusWrites, [['q1', 'Open']],
    'marking one seen wrote to more than one request');
  assert.strictEqual(PT.inquiries[1].status, 'Won', 'opening one request changed another');
  assert.strictEqual(PT.inquiries[2].status, 'New',
    'opening one request marked a different unread request as read too');

  // a resolved request must not be dragged back to Open by being read
  markInquirySeen(PT.inquiries[1]);
  assert.strictEqual(PT.inquiries[1].status, 'Won', 'reading a Won request reset its status');
  assert.strictEqual(statusWrites.length, 1, 'reading a resolved request wrote a status change');

  /* --- back to the list --- */
  PT.openInquiry = null;
  renderInquiries();
  assert.ok(/q-list/.test(html()) && !/q-open/.test(html()), 'going back does not return to the list');
  // the one that was opened is read; the one that was not is still unread
  assert.strictEqual((html().match(/q-unread/g) || []).length, 1,
    'exactly the unopened request should still be unread');
  assert.ok(/Lee Park/.test(html()), 'the still-unread request vanished from the list');

  console.log('quote request inbox OK — a list you open one at a time, and only what you open is marked read');
})();
