#!/usr/bin/env node
/* Cache busting for a site with no build step (Jacob, 2026-09-08: "add it").

   GitHub Pages serves every file with a ten-minute cache, so a pushed change
   to styles.css or a script was invisible for up to ten minutes after the
   build, and a page whose HTML had refreshed could still run the old script.
   Each stylesheet and script link carries ?v=<hash of that file's content>:
   a changed file gets a new URL the moment the build is live, an unchanged
   one keeps its cached copy.

   Run after changing any asset:   node tools/stamp.js
   check.js refuses a stamp that does not match the file it names.

   Order matters once: app.js loads store.js on its own on pages that do not
   ship it (the bell), so store.js is stamped inside app.js before app.js is
   hashed for the pages. */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const ASSETS = ['styles.css', 'nav.js', 'analytics.js', 'store.js', 'app.js', 'profile.js', 'portal.js', 'admin.js'];
const hash = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, f))).digest('hex').slice(0, 10);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function run(){
let changed = 0;
const rewrite = (file, from, to) => {
  const before = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const after = before.replace(from, to);
  if(after !== before){ fs.writeFileSync(path.join(ROOT, file), after); changed++; }
};

/* 1. store.js inside app.js, before app.js is hashed */
rewrite('app.js', /add\('\/store\.js(?:\?v=[0-9a-f]+)?'\)/g, `add('/store.js?v=${hash('store.js')}')`);

/* 2. every page: href or src, with or without a leading slash */
const stamps = Object.fromEntries(ASSETS.map(a => [a, hash(a)]));
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
for(const page of pages){
  for(const a of ASSETS){
    rewrite(page, new RegExp(`((?:href|src)=")(/?)${esc(a)}(?:\\?v=[0-9a-f]+)?(")`, 'g'), `$1$2${a}?v=${stamps[a]}$3`);
  }
}
console.log(`stamped ${ASSETS.length} assets across ${pages.length} pages, ${changed} link${changed === 1 ? '' : 's'} rewritten`);
for(const a of ASSETS) console.log(`  ${a.padEnd(13)} ${stamps[a]}`);
}
if(require.main === module) run();
module.exports = { ASSETS, hash, run };
