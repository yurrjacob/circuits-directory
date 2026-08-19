#!/usr/bin/env node
/* The admin console's row buttons, actually invoked.

   The Badge button silently did nothing for days. The cause was one word:
   editBadge() read `all` where the array is called `allApps`, so the handler
   threw ReferenceError before it did anything. Nothing caught it — the file is
   valid JavaScript, the button renders, the export check passed, and an
   exception inside an inline onclick just disappears into the console.

   Static analysis of "is this name declared" turned out to be guesswork without
   a parser (regex literals containing quotes desync any hand-rolled scanner,
   and the false positives make the check worthless). So this does the exact
   thing instead: load admin.js for real, call every function the inline
   onclick handlers reference, and fail on ReferenceError.

   Every handler is called with an id that does not exist, which is the safe
   early-return path in each one — nothing is mutated, but the lookup that
   would blow up still runs. */
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'admin.js'), 'utf8');

/* Every name an inline handler calls: onclick="fname(".
   Anchored to a real HTML attribute — whitespace, a lowercase event name and an
   opening quote — because `on\w+` alone also matches inside `textContent =`. */
const handlers = [...new Set([...src.matchAll(/\son[a-z]+\s*=\s*"\s*([A-Za-z0-9_$]+)\s*\(/g)].map(m => m[1]))];
assert.ok(handlers.length, 'no inline handlers found in admin.js — has the markup changed?');

const noop = () => {};
const el = () => new Proxy({}, {
  get(t, k){
    if(k === 'style' || k === 'dataset' || k === 'classList') return el();
    if(k === 'value' || k === 'textContent' || k === 'innerHTML') return '';
    if(k === 'children' || k === 'options') return [];
    if(typeof k === 'symbol') return undefined;
    return typeof t[k] === 'undefined' ? noop : t[k];
  },
  set(){ return true; }
});

const sandbox = {
  console: { log: noop, warn: noop, error: noop },
  document: { getElementById: el, querySelector: el, querySelectorAll: () => [],
              createElement: el, addEventListener: noop, body: el() },
  window: {}, location: { href: '', search: '', reload: noop },
  setTimeout, clearTimeout, setInterval, clearInterval,
  /* the three that made the bug invisible: if a handler reaches these it got
     past the lookup, which is all this check is asking */
  alert: noop, confirm: () => false, prompt: () => null
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.createContext(sandbox);
/* Load the real store.js rather than stubbing its API. Without window.supabase
   its `sb` is null and every function returns early, so nothing touches the
   network — and admin.js is checked against the functions that actually exist
   instead of a stub list that silently rots as store.js changes. */
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'store.js'), 'utf8'), sandbox, { filename: 'store.js' });
vm.runInContext(src, sandbox, { filename: 'admin.js' });

/* Exclusive Sponsor exclusivity has to be expressed in the SAME terms search
   uses. The database index was keyed on lower(keyword) while search matches on
   the normalised form, so "oscillator" and "oscillators" were two sponsorships
   to the index and one keyword to a buyer — sold twice, both banners on the
   same page. The index is now on keyword_norm; this keeps the console honest
   about it, since staff rely on its warning before promising exclusivity. */
{
  const from = src.indexOf('function bannerConflict');
  const to = src.indexOf('function sortRows');
  assert.ok(from >= 0 && to > from, 'bannerConflict is gone from admin.js');
  const body = src.slice(from, to);
  assert.ok(/normKw\(/.test(body),
    'bannerConflict no longer normalises the keyword — it would miss the plural of a keyword ' +
    'that is already sponsored, and staff would promise exclusivity the database then refuses');
  assert.ok(!/\.toLowerCase\(\)\s*===/.test(body),
    'bannerConflict compares raw lowercased keywords — that is the bug that let oscillator and ' +
    'oscillators both be sold as exclusive');
}

(async () => {
  const missing = handlers.filter(h => typeof sandbox[h] !== 'function');
  assert.strictEqual(missing.join(', '), '',
    `admin.js has onclick handlers that are not reachable from global scope: ${missing.join(', ')} — ` +
    'the IIFE traps them, so those buttons do nothing when clicked');

  for(const h of handlers){
    const NOPE = '00000000-0000-0000-0000-000000000000';
    try{
      await sandbox[h](NOPE, false);
    }catch(err){
      /* `err instanceof ReferenceError` is false here: the error comes from the
         vm's own realm, so it does not share this file's intrinsics. Match on
         the name — getting this wrong made the check silently pass. */
      assert.ok(!(err && err.name === 'ReferenceError'),
        `${h}() throws ReferenceError: ${err.message}. That button does nothing when clicked — ` +
        'an exception inside an inline onclick is swallowed, so the page looks fine and the click is lost.');
      // any other error is the stub's fault, not the code's — ignore it
    }
  }
  console.log(`admin buttons OK — ${handlers.length} handlers reachable and none throw on a missing row`);
})();
