#!/usr/bin/env node
/* Generates circuits.com/<handle> for every company with a live listing, and
   refreshes sitemap.xml. GitHub Pages has no rewrites, so a real file has to
   exist at the repo root for each vanity URL.

   Run from the repo root:  node tools/build-profiles.js
   Re-run after approving, removing or renaming listings, then commit.
   It refuses to drop a URL that is in the current sitemap; pass --force when
   that is really what you want (a listing taken down, a page retired).

   Reads through the public anon key, same data any visitor can already see. */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SUPABASE_URL = 'https://ghpruernzhjwsgsezdyn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_zmOQinynNkuWdHUeHrFdDA_y6UnLyL4';
const SITE = 'https://circuits.com';
const ROOT = path.join(__dirname, '..');
const FORCE = process.argv.includes('--force');

/* Which root files this script created last time. Only these may be deleted, without it, a stale handle could take about.html with it on cleanup. */
const MANIFEST = path.join(__dirname, '.generated-profiles.json');

/* Every hand-written page that search engines may index, as [url, file].
   tools/check.js holds this list against the pages themselves, so a new
   public page that is left out here fails the checks instead of silently
   dropping out of the sitemap on the next run (SEO audit, 2026-11-10).
   /browse exists but is hidden for now (no links, noindexed), keep it out of
   the sitemap until Jacob decides to switch it on. */
const STATIC_PAGES = [
  ['/', 'index.html'], ['/join', 'join.html'], ['/jobs', 'jobs.html'], ['/talent', 'talent.html'],
  ['/clubs', 'clubs.html'], ['/global', 'global.html'], ['/about', 'about.html'],
  ['/contact', 'contact.html'], ['/register', 'register.html'], ['/terms', 'terms.html'], ['/privacy', 'privacy.html']
];

async function api(q) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + q, {
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
  });
  if (!res.ok) throw new Error(q + ' → ' + res.status + ' ' + (await res.text()));
  return res.json();
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/* JSON for a <script> block: nothing in a company's own words may close the tag */
const ldJson = o => JSON.stringify(o, (k, v) => (v === '' || v == null || (Array.isArray(v) && !v.length)) ? undefined : v, 2)
  .replace(/</g, '\\u003c');

/* The test fixture under the keyword "sample". These profiles have to be
   reachable, that is the whole point of test data, but they are fake
   companies on a live domain, so they must never reach a search engine.
   Keyed off the slug prefix the seed function uses. */
const isSample = co => /^sample-/.test(co.slug || '') || /^sample-/.test(co.handle || '');

/* The page's main content, written into the HTML so a crawler that runs no
   JavaScript, or a visit where the data fetch fails, still reads who the
   company is and what it is listed under. profile.js replaces it with the
   full live page as soon as the data arrives. */
function bodyFor(co, keywords) {
  const logo = /^https?:\/\//i.test(co.logo || '')
    ? `<img class="pf-static-logo" src="${esc(co.logo)}" alt="${esc(co.name)} logo" width="96" height="96" loading="lazy">\n    ` : '';
  const kw = keywords.length
    ? `\n    <h2>Circuits-Keywords&trade;</h2>\n    <ul class="pf-static-kw">${keywords.map(k =>
        `<li><a href="/results?q=${encodeURIComponent(k)}">${esc(k)}</a></li>`).join('')}</ul>` : '';
  const desc = co.description && co.description !== co.tagline ? `\n    <p>${esc(co.description)}</p>` : '';
  return `<article class="pf-static">
    ${logo}<h1>${esc(co.name)}</h1>${co.tagline ? `\n    <p class="pf-static-tag">${esc(co.tagline)}</p>` : ''}${desc}${kw}
    <p class="pf-static-load"><span class="spin" aria-hidden="true"></span>Loading contact details&hellip;</p>
  </article>`;
}

/* ProfilePage + Organization + BreadcrumbList, in the HTML rather than
   injected by script. profile.js leaves its own Organization block out when
   this one is on the page. */
function jsonLdFor(co, keywords, canonical) {
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProfilePage', '@id': canonical + '#page', url: canonical,
        isPartOf: { '@id': SITE + '/#website' },
        breadcrumb: { '@id': canonical + '#breadcrumb' },
        mainEntity: { '@id': canonical + '#org' },
        dateModified: co.updated_at || undefined
      },
      {
        '@type': 'Organization', '@id': canonical + '#org', name: co.name, url: canonical,
        description: co.description || co.tagline || undefined,
        logo: /^https?:\/\//i.test(co.logo || '') ? co.logo : undefined,
        knowsAbout: keywords
      },
      {
        '@type': 'BreadcrumbList', '@id': canonical + '#breadcrumb',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Circuits.com', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: co.name, item: canonical }
        ]
      }
    ]
  };
  return '\n<script type="application/ld+json" data-static-profile>\n' + ldJson(data) + '\n</script>';
}

function pageFor(template, co, keywords = []) {
  const title = (co.kind !== 'club' && co.title_source === 'contact' && (co.contact || '').trim() ? co.contact.trim() : co.name) + ' | Supplier Profile | Circuits.com';
  const raw = co.tagline || co.description ||
    (co.name + ' is listed on Circuits.com, the integrated circuits directory. See documentation and contact details, or request a quote.');
  const desc = raw.replace(/\s+/g, ' ').trim().slice(0, 155);
  const og = /^https?:\/\//i.test(co.logo || '') ? co.logo : SITE + '/assets/og-card.png';
  const canonical = SITE + '/' + co.handle;
  return template
    .split('{{ROBOTS}}').join(isSample(co) ? '\n<meta name="robots" content="noindex,nofollow">' : '')
    .split('{{HANDLE}}').join(esc(co.handle))
    .split('{{TITLE}}').join(esc(title))
    .split('{{DESC}}').join(esc(desc))
    .split('{{CANONICAL}}').join(canonical)
    .split('{{OGIMAGE}}').join(esc(og))
    /* the company's own words go in last, so text like {{TITLE}} inside a
       description is left as typed */
    .split('{{JSONLD}}').join(isSample(co) ? '' : jsonLdFor(co, keywords, canonical))   // test data carries no schema
    .split('{{BODY}}').join(bodyFor(co, keywords));
}

/* lastmod for a hand-written page is the date of the last commit that
   touched it, not the day the script ran; Google stops trusting lastmod
   that moves without the page changing. Falls back to the date already in
   the sitemap (a shallow clone has no real history), then to today. */
function lastmodFor(file, current, loc, today) {
  try {
    const d = execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim();
    const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: ROOT, encoding: 'utf8' }).trim() === 'true';
    if (/^\d{4}-\d{2}-\d{2}$/.test(d) && !shallow) return d;
  } catch (e) { /* no git here, fall through */ }
  return current.get(loc) || today;
}

function readSitemap() {
  const p = path.join(ROOT, 'sitemap.xml');
  const map = new Map();
  if (!fs.existsSync(p)) return map;
  for (const m of fs.readFileSync(p, 'utf8').matchAll(/<loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?/g)) {
    map.set(m[1].replace(SITE, '').replace(/&amp;/g, '&') || '/', m[2]);
  }
  return map;
}

if (require.main !== module) {
  module.exports = { STATIC_PAGES, pageFor, bodyFor, jsonLdFor };
} else (async () => {
  const template = fs.readFileSync(path.join(ROOT, 'company.html'), 'utf8');
  const previous = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : [];
  const current = readSitemap();

  const live = await api('applications?status=eq.Approved&select=company_slug,paused,keyword,keyword_norm');
  const slugs = [...new Set(live.filter(r => r.company_slug && !r.paused).map(r => r.company_slug))];

  /* Keyword result pages worth indexing: at least one live, non-sample listing.
     robots.txt allows /results and app.js noindexes empty pages, so the sitemap
     is what tells Google which keyword pages actually answer a search. */
  const kwSeen = new Map();
  /* and each company's live keywords, for its own page */
  const kwBySlug = new Map();
  for (const r of live) {
    if (r.paused || !r.keyword || !r.keyword_norm) continue;
    if (r.company_slug) {
      if (!kwBySlug.has(r.company_slug)) kwBySlug.set(r.company_slug, new Map());
      kwBySlug.get(r.company_slug).set(r.keyword_norm, r.keyword);
    }
    if (r.keyword_norm === 'sample' || /^sample-/.test(r.company_slug || '')) continue;
    if (!kwSeen.has(r.keyword_norm)) kwSeen.set(r.keyword_norm, r.keyword);
  }
  const keywordsOf = co => [...(kwBySlug.get(co.slug) || new Map()).values()].sort((a, b) => a.localeCompare(b));

  let companies = [];
  if (slugs.length) {
    companies = (await api(
      'companies?select=slug,handle,name,tagline,description,logo,updated_at,kind,contact,title_source&published=is.true' +
      '&slug=in.(' + slugs.map(encodeURIComponent).join(',') + ')'
    )).filter(c => c.handle);
  }

  // what the new sitemap will hold, worked out before anything is written
  const today = new Date().toISOString().slice(0, 10);
  const willWrite = companies.filter(co => {
    const file = co.handle + '.html';
    return !(fs.existsSync(path.join(ROOT, file)) && !previous.includes(file));
  });
  const entries = STATIC_PAGES.map(([loc, file]) => [loc, lastmodFor(file, current, loc, today)])
    .concat(willWrite.filter(c => !isSample(c))   // test data stays out of the sitemap
      .map(co => ['/' + co.handle, (co.updated_at || today).slice(0, 10)]))
    .concat([...kwSeen.values()].sort()
      .map(kw => ['/results?q=' + encodeURIComponent(kw), current.get('/results?q=' + encodeURIComponent(kw)) || today]));

  const next = new Set(entries.map(([loc]) => loc));
  const lost = [...current.keys()].filter(loc => !next.has(loc));
  if (lost.length && !FORCE) {
    console.error('Refusing to write: these URLs are in sitemap.xml now and would disappear:\n  ' +
      lost.join('\n  ') + '\nIf that is intended, run again with --force.');
    process.exit(1);
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
      console.error('SKIPPED ' + file + ', a file with that name already exists.');
      continue;
    }
    fs.writeFileSync(target, pageFor(template, co, keywordsOf(co)));
    written.push(file);
  }
  fs.writeFileSync(MANIFEST, JSON.stringify(written.sort(), null, 2) + '\n');
  console.log('wrote ' + written.length + ' profile page(s) at the site root');

  // Google ignores <priority>, so it is no longer written
  const urls = entries.map(([loc, mod]) => `  <url><loc>${SITE}${esc(loc)}</loc><lastmod>${mod}</lastmod></url>`);
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join('\n') + '\n</urlset>\n');
  console.log('sitemap.xml → ' + urls.length + ' urls' + (lost.length ? ' (dropped with --force: ' + lost.join(', ') + ')' : ''));
})().catch(e => { console.error(e.message); process.exit(1); });
