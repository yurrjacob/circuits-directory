#!/usr/bin/env node
/* Does the site that is actually deployed still work?
   Everything else in tools/ reads the source. This reads the live site, which
   is the only thing that catches a bad deploy, a stale CDN, a broken redirect,
   or a page that silently stopped being published.

   Usage:  node tools/smoke.js [https://circuits.com]

   Deliberately no dependencies and no browser: it checks status codes and the
   HTML that arrives. It cannot catch anything that only appears after
   JavaScript runs — say so rather than implying wider coverage than it has. */

const BASE = (process.argv[2] || 'https://circuits.com').replace(/\/$/, '');
const bust = () => '?smoke=' + Date.now();

let failures = 0;
const fail = m => { failures++; console.error('  FAIL ' + m); };
const pass = m => console.log('  ok   ' + m);

async function get(pathname) {
  const res = await fetch(BASE + pathname + bust(), { redirect: 'follow' });
  return { status: res.status, body: await res.text() };
}

/* Pages that must exist, and something on each that proves it rendered rather
   than merely returning 200 with an error page. */
const MUST_LOAD = [
  ['/',                  ['id="home-search"', 'Claim Your Circuits-Keyword']],
  ['/about',             ['<nav class="nav">']],
  ['/contact',           ['id="contact-form"', 'id="c-email"']],
  ['/join',              ['<nav class="nav">']],
  ['/portal',            ['id="pt-auth-form"', 'id="pt-tab-admin"', 'id="tab-admin"', '/admin.js']],
  ['/register',          ['id="r-submit"']],
  ['/reset',             ['id="rq-form"']],
  ['/claim',             ['<nav class="nav">']],
  ['/terms',             ['<nav class="nav">']],
  ['/privacy',           ['Supabase', 'cookie-reset']],
  ['/admin.js',          ['window.initAdmin']],
  ['/results?q=test',    ['id="results-body"']],
  ['/robots.txt',        ['Sitemap']],
  ['/sitemap.xml',       ['<loc>https://circuits.com/']],
  ['/styles.css',        ['.path-card', '.pt-meter'].length ? ['.pt-meter'] : []],
  ['/store.js',          ['sb_publishable_']],
  ['/app.js',            ['function armSpamTrap']],
  ['/analytics.js',      ['cx_consent']]
];

/* URLs that must NOT exist. Old dead paths that used to 404 noisily in Search
   Console, and the stray root copies of the directory pages. */
/* `/tools/*` is served too, because Pages publishes everything in the repo.
   That is not a leak — the repo is public and holds no secrets (check.js fails
   the build if a secret key ever appears). Not worth excluding. */
const MUST_404 = ['/parts', '/search', '/data.js', '/server.js',
                  '/buyers.html', '/check.js',
                  // there is one sign-in now, and admin is a property of the account
                  '/login', '/admin',
                  // the browsable category tree was removed: it sat between the
                  // search box and a search, so people browsed instead of searching
                  '/directory', '/directory/buyers', '/directory/motion-control-ics'];

/* Not dead — deliberately kept alive as redirects, so old links and anything
   Google still has indexed lands somewhere useful instead of on a 404. */
const MUST_REDIRECT = [
  ['/how-it-works', '/about'],
  ['/how-it-works.html', '/about']
];

(async () => {
  console.log('Smoke testing ' + BASE + '\n');

  console.log('Pages load and render:');
  for (const [p, needles] of MUST_LOAD) {
    try {
      const { status, body } = await get(p);
      if (status !== 200) { fail(`${p} returned ${status}`); continue; }
      const missing = needles.filter(n => !body.includes(n));
      if (missing.length) fail(`${p} loaded but is missing ${missing.join(', ')}`);
      else pass(p);
    } catch (e) { fail(`${p} threw ${e.message}`); }
  }

  console.log('\nDead URLs stay dead:');
  for (const p of MUST_404) {
    try {
      const { status } = await get(p);
      // 404.html resolves unknown handles, so a soft 200 here would be wrong too
      if (status === 200) fail(`${p} is live again and should not be`);
      else pass(`${p} → ${status}`);
    } catch (e) { fail(`${p} threw ${e.message}`); }
  }

  console.log('\nOld URLs still point somewhere useful:');
  for (const [from, to] of MUST_REDIRECT) {
    try {
      const { status, body } = await get(from);
      if (status === 404) { fail(`${from} now 404s instead of redirecting to ${to}`); continue; }
      const canonical = body.includes(`rel="canonical" href="https://circuits.com${to}"`);
      const refresh = /http-equiv="refresh"/i.test(body);
      if (canonical && refresh) pass(`${from} → ${to}`);
      else fail(`${from} loads but ${canonical ? 'does not redirect visitors' : 'has no canonical to ' + to}`);
    } catch (e) { fail(`${from} threw ${e.message}`); }
  }

  console.log('\nThe shared footer is on every page:');
  for (const [p] of MUST_LOAD.filter(([p]) => p.endsWith('/') || !p.includes('.'))) {
    try {
      const { body } = await get(p);
      if (!body.includes('<footer class="footer">')) { fail(`${p} has no footer`); continue; }
      const foot = body.slice(body.indexOf('<footer class="footer">'));
      const links = ['/terms', '/privacy'].filter(h => !foot.includes(`href="${h}"`));
      if (links.length) { fail(`${p} footer is missing ${links.join(', ')}`); continue; }
      if (/Staff Login/i.test(foot)) { fail(`${p} footer advertises the staff login`); continue; }
      pass(p);
    } catch (e) { fail(`${p} threw ${e.message}`); }
  }

  console.log('\nThe database is answering:');
  try {
    const r = await fetch('https://ghpruernzhjwsgsezdyn.supabase.co/rest/v1/applications' +
      '?select=company&status=eq.Approved&limit=1', {
      headers: { apikey: 'sb_publishable_zmOQinynNkuWdHUeHrFdDA_y6UnLyL4' }
    });
    if (!r.ok) fail(`the public listings query returned ${r.status}`);
    else pass('approved listings are readable by an anonymous visitor');
  } catch (e) { fail('the database is unreachable: ' + e.message); }

  console.log('\nOutbound email:');
  try {
    const r = await fetch('https://ghpruernzhjwsgsezdyn.supabase.co/functions/v1/notify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'quote', company_slug: '__smoke_test_no_such_company__' })
    });
    const out = await r.json().catch(() => ({}));
    if (out.error === 'not_configured') {
      console.log('  note  the notifier is deployed but RESEND_API_KEY is not set yet');
    } else if (out.error === 'no_such_company') {
      pass('the notifier is live and refuses unknown companies');
    } else {
      fail('the notifier answered unexpectedly: ' + JSON.stringify(out));
    }
  } catch (e) { fail('the notifier is unreachable: ' + e.message); }

  console.log('');
  if (failures) { console.error(`${failures} smoke test failure(s)`); process.exit(1); }
  console.log('smoke tests passed');
})();
