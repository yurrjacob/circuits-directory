#!/usr/bin/env node
/* Generates /company/<slug>.html for every company with a live listing, and
   refreshes sitemap.xml. GitHub Pages has no rewrites, so a real file has to
   exist for each pretty URL.

   Run from the repo root:  node tools/build-profiles.js
   Re-run after approving or removing listings, then commit the changes.

   Reads through the public anon key — same data any visitor can already see. */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = 'https://ghpruernzhjwsgsezdyn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zmOQinynNkuWdHUeHrFdDA_y6UnLyL4';
const SITE = 'https://circuits.com';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'company');

// pages that are always in the sitemap, independent of the database
const STATIC_PAGES = [
  ['/', '1.0'], ['/join', '0.9'], ['/companies', '0.9'], ['/directory', '0.9'],
  ['/directory/engineers', '0.7'], ['/directory/manufacturers', '0.7'],
  ['/directory/distributors', '0.7'], ['/directory/buyers', '0.7'],
  ['/directory/pcb-design', '0.7'], ['/directory/oscillators', '0.7'],
  ['/directory/voltage-regulators', '0.7'], ['/directory/rf-transceivers', '0.7'],
  ['/directory/test-equipment', '0.7'], ['/directory/ic-packaging', '0.7'],
  ['/directory/clock-generators', '0.7'], ['/directory/motion-control-ics', '0.7'],
  ['/how-it-works', '0.8'], ['/about', '0.8'], ['/contact', '0.6'], ['/terms', '0.3']
];

async function api(pathAndQuery) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + pathAndQuery, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error(pathAndQuery + ' → ' + res.status + ' ' + (await res.text()));
  return res.json();
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function pageFor(template, co) {
  const title = co.name + ' — Supplier Profile | Circuits.com';
  const raw = co.tagline || co.description ||
    (co.name + ' is listed on Circuits.com, the integrated circuits directory. See parts, documentation and contact details, or request a quote.');
  const desc = raw.replace(/\s+/g, ' ').trim().slice(0, 155);
  const og = /^https?:\/\//i.test(co.logo || '') ? co.logo : SITE + '/assets/logo-home.png';
  return template
    .split('{{SLUG}}').join(esc(co.slug))
    .split('{{TITLE}}').join(esc(title))
    .split('{{DESC}}').join(esc(desc))
    .split('{{CANONICAL}}').join(SITE + '/company/' + co.slug)
    .split('{{OGIMAGE}}').join(esc(og));
}

(async () => {
  const template = fs.readFileSync(path.join(ROOT, 'company.html'), 'utf8');

  const live = await api('applications?status=eq.Approved&select=company_slug,paused');
  const slugs = [...new Set(live.filter(r => r.company_slug && !r.paused).map(r => r.company_slug))];
  if (!slugs.length) {
    console.log('No live listings — nothing to generate.');
    return;
  }

  const companies = await api(
    'companies?select=slug,name,tagline,description,logo,updated_at&published=is.true' +
    '&slug=in.(' + slugs.map(encodeURIComponent).join(',') + ')'
  );

  fs.mkdirSync(OUT, { recursive: true });

  // drop files for companies that are no longer live, so dead profiles don't linger
  const keep = new Set(companies.map(c => c.slug + '.html'));
  for (const f of fs.existsSync(OUT) ? fs.readdirSync(OUT) : []) {
    if (f.endsWith('.html') && !keep.has(f)) { fs.unlinkSync(path.join(OUT, f)); console.log('removed', f); }
  }

  for (const co of companies) {
    fs.writeFileSync(path.join(OUT, co.slug + '.html'), pageFor(template, co));
  }
  console.log('wrote ' + companies.length + ' profile page(s) to /company');

  const today = new Date().toISOString().slice(0, 10);
  const urls = STATIC_PAGES.map(([loc, pri]) =>
    `  <url><loc>${SITE}${loc}</loc><lastmod>${today}</lastmod><priority>${pri}</priority></url>`
  ).concat(companies.map(co =>
    `  <url><loc>${SITE}/company/${co.slug}</loc><lastmod>${(co.updated_at || today).slice(0, 10)}</lastmod><priority>0.6</priority></url>`
  ));

  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') + '\n</urlset>\n');
  console.log('sitemap.xml → ' + urls.length + ' urls');
})().catch(e => { console.error(e.message); process.exit(1); });
