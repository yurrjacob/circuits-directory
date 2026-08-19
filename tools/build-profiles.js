#!/usr/bin/env node
/* Generates circuits.com/<handle> for every company with a live listing, and
   refreshes sitemap.xml. GitHub Pages has no rewrites, so a real file has to
   exist at the repo root for each vanity URL.

   Run from the repo root:  node tools/build-profiles.js
   Re-run after approving, removing or renaming listings, then commit.

   Reads through the public anon key — same data any visitor can already see. */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ghpruernzhjwsgsezdyn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zmOQinynNkuWdHUeHrFdDA_y6UnLyL4';
const SITE = 'https://circuits.com';
const ROOT = path.join(__dirname, '..');

/* Which root files this script created last time. Only these may be deleted —
   without it, a stale handle could take about.html with it on cleanup. */
const MANIFEST = path.join(__dirname, '.generated-profiles.json');

const STATIC_PAGES = [
  ['/', '1.0'], ['/join', '0.9'],
  ['/about', '0.8'], ['/contact', '0.6'], ['/register', '0.6'], ['/terms', '0.3'], ['/privacy', '0.3']
];

async function api(q) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + q, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error(q + ' → ' + res.status + ' ' + (await res.text()));
  return res.json();
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function pageFor(template, co) {
  const title = co.name + ' — Supplier Profile | Circuits.com';
  const raw = co.tagline || co.description ||
    (co.name + ' is listed on Circuits.com, the integrated circuits directory. See documentation and contact details, or request a quote.');
  const desc = raw.replace(/\s+/g, ' ').trim().slice(0, 155);
  const og = /^https?:\/\//i.test(co.logo || '') ? co.logo : SITE + '/assets/logo-home.png';
  return template
    .split('{{HANDLE}}').join(esc(co.handle))
    .split('{{TITLE}}').join(esc(title))
    .split('{{DESC}}').join(esc(desc))
    .split('{{CANONICAL}}').join(SITE + '/' + co.handle)
    .split('{{OGIMAGE}}').join(esc(og));
}

(async () => {
  const template = fs.readFileSync(path.join(ROOT, 'company.html'), 'utf8');
  const previous = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : [];

  const live = await api('applications?status=eq.Approved&select=company_slug,paused');
  const slugs = [...new Set(live.filter(r => r.company_slug && !r.paused).map(r => r.company_slug))];

  let companies = [];
  if (slugs.length) {
    companies = (await api(
      'companies?select=slug,handle,name,tagline,description,logo,updated_at&published=is.true' +
      '&slug=in.(' + slugs.map(encodeURIComponent).join(',') + ')'
    )).filter(c => c.handle);
  }

  // remove pages for companies that went away or changed handle
  const keep = new Set(companies.map(c => c.handle + '.html'));
  for (const f of previous) {
    if (!keep.has(f)) {
      const p = path.join(ROOT, f);
      if (fs.existsSync(p)) { fs.unlinkSync(p); console.log('removed', f); }
    }
  }

  const written = [];
  for (const co of companies) {
    const file = co.handle + '.html';
    const target = path.join(ROOT, file);
    // never clobber a hand-written page; reserved_handles should prevent this,
    // but a rename slipping through must not silently eat about.html
    if (fs.existsSync(target) && !previous.includes(file)) {
      console.error('SKIPPED ' + file + ' — a file with that name already exists.');
      continue;
    }
    fs.writeFileSync(target, pageFor(template, co));
    written.push(file);
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(written.sort(), null, 2) + '\n');
  console.log('wrote ' + written.length + ' profile page(s) at the site root');

  const today = new Date().toISOString().slice(0, 10);
  const urls = STATIC_PAGES.map(([loc, pri]) =>
    `  <url><loc>${SITE}${loc}</loc><lastmod>${today}</lastmod><priority>${pri}</priority></url>`
  ).concat(companies
    .filter(c => written.includes(c.handle + '.html'))
    .map(co => `  <url><loc>${SITE}/${co.handle}</loc><lastmod>${(co.updated_at || today).slice(0, 10)}</lastmod><priority>0.6</priority></url>`));

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') + '\n</urlset>\n');
  console.log('sitemap.xml → ' + urls.length + ' urls');
})().catch(e => { console.error(e.message); process.exit(1); });
