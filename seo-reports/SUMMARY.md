# SEO audit summary, circuits.com, 10 November 2026

Five audits of the live site were run with the claude-seo plugin (v2.5.0), each in its own headless Claude session from this folder. The live site returned HTTP 200 before the run. No site file was changed; everything here lives in `seo-reports/`.

| Command | Report | Score |
|---|---|---|
| `/seo audit https://circuits.com` | `2026-11-10-full-audit.md` | SEO Health 49/100 |
| `/seo page https://circuits.com/` | `2026-11-10-homepage.md` | Homepage 58/100 |
| `/seo geo https://circuits.com` | `2026-11-10-geo-analysis.md` | GEO Readiness 32/100 |
| `/seo schema https://circuits.com` | `2026-11-10-schema.md`, `2026-11-10-generated-schema.json` | Schema 45/100 |
| `/seo local https://circuits.com` | `2026-11-10-local.md` | No overall score (not a local business) |

The `*.log` files hold each session's final answer.

Running theme: listings, jobs, talent, clubs and results are all drawn by JavaScript after a Supabase fetch. Crawlers that don't run JS see "Loading..." or "Showing 0 Results", and no company profile page has been generated yet. Most top issues below come back to that.

## 1. Full audit (49/100)

Category scores: Technical 58, Content 36, On-Page 44, Schema 48, Performance 68 (estimated), AI Search Readiness 34, Images 90.

Top 5 issues:
1. **The sitemap generator would break the sitemap.** It would drop `/jobs` and `/talent`, never add `/clubs` or `/global`, and give every page today's `lastmod`. File: `tools/build-profiles.js` (lines 24 to 27 and 119), which would then make `tools/check.js:1249` fail.
2. **No company profile pages exist yet** (`tools/.generated-profiles.json` is `[]`, so `/northbridge` returns 404). Even once generated, each body is filled in by JS (`profile.js`, including `profile.js:706`). Pages: `circuits.com/<handle>`.
3. **Keyword results pages are empty without JS and have no static robots tag**, so an empty page can be indexed if the fetch fails. Files: `results.html`, `app.js:363-373`.
4. **The JobPosting markup on the job list page breaks Google's rules.** Every job points to a search URL and is hard-coded `FULL_TIME`. File: `jobs.html:143-151` (line 149).
5. **The homepage H1 is visually hidden, the page has 233 words and no buyer search terms.** The same hidden H1 is on `/jobs`, `/talent` and `/results`. File: `index.html:85`.

Also High: nobody is named on `/about`, in the policies or in the schema (`about.html`, `terms.html`, `privacy.html`, `index.html`). `/jacob` is a person page with the title "Supplier Profile" and is indexable.

## 2. Homepage page review (58/100)

Scores: On-Page 52, Content 35, Technical 72, Schema 65, Images 88.

Top 5 issues:
1. **The four Start cards plus Sign In, Dashboard and Admin all link to `/portal`, which robots.txt disallows.** The homepage's strongest links pass nothing to pages that could rank. File: `index.html:161-179`. Point them at `/join`, `/jobs`, `/talent` and `/clubs` instead.
2. **The only H1 is `sr-only` and the page has no H2s.** The card titles are spans. File: `index.html:85`.
3. **Thin copy.** 233 visible words, and buyer terms appear only in meta tags. Page: `/` (`index.html`).
4. **The title is 46 characters with no buyer term**, and the description ends on "Circuits-Keyword". The report suggests a new title and description. File: `index.html` head.
5. **Search doesn't work without JS** (`#home-form` has no `action` and the input has no `name`). The 205 KB render-blocking `styles.css` and an 85 KB PNG hero logo come next. Files: `index.html`, `styles.css`, `assets/logo-home.png`.

## 3. GEO, AI search readiness (32/100)

Scores: Citability 25, Structure 40, Multi-modal 30, Authority 20, Technical accessibility 45. All AI crawlers are allowed in `robots.txt`; no change is needed there.

Top 5 issues:
1. **AI crawlers that don't run JS see zero listings.** Pages: `/jobs` (59 words), `/talent`, `/clubs`, `/global`, `/results`, and profiles (none generated). Fix through `tools/build-profiles.js` (full audit C2 and H1), plus static `/global` and `/clubs` tables.
2. **"Circuits-Keyword", the brand's own term, is never defined, and `/about` has no facts, counts or dates.** Its opening line is an unsupported superlative. Page: `/about` (`about.html`).
3. **The founders are named only on `/contact`, no legal entity is named and no page has a date.** Pages: `/about`, `/terms`, `/privacy`, and the homepage Organization JSON-LD in `index.html`.
4. **No third-party brand mentions were found** (Wikipedia, Reddit, YouTube or trade press), and there is no `sameAs` link. This is off-site work.
5. **Search doesn't work for agents without JS.** File: `index.html` (`#home-form`). `/llms.txt` is missing (404). That is optional, and a draft is in the report.

## 4. Schema (45/100)

What exists: Organization + WebSite (with SearchAction) on `/`, valid. JobPosting on `/jobs`, injected by JS, which breaks the guidelines. Organization on profiles, JS only.

Top 5 issues:
1. **Critical: JobPosting markup on the list page.** It shares URLs, hard-codes `FULL_TIME`, uses a free-text address and links `hiringOrganization.sameAs` to a profile that returns 404. File: `jobs.html:141-152`. Delete it until `/jobs/<id>` pages exist.
2. **High: profile schema is JS-only, and it's a bare Organization rather than ProfilePage + Organization + BreadcrumbList.** Files: `profile.js:706-723`, `tools/build-profiles.js`.
3. **Medium: a dormant AggregateRating would be emitted without `Review` items if reviews are switched back on.** File: `profile.js:451-453`.
4. **Low: the homepage Organization is thin** (no `contactPoint`, founders or `sameAs`). File: `index.html:26-33`.
5. **There's no BreadcrumbList anywhere on the site.** `/company.html` serves raw `{{TITLE}}` placeholders (it is blocked in robots.txt, so nothing is indexed). Files: every page, plus `company.html`.

Ready-to-use JSON-LD is in `2026-11-10-generated-schema.json`. The contact email in it has been replaced with a placeholder.

## 5. Local SEO (no overall score)

The plugin judged local SEO mostly not applicable. Circuits.com is a national B2B directory with no storefront, and a Google Business Profile would risk suspension. Only the parts that apply were assessed.

Top 5 issues:
1. **Listing addresses are drawn only in the browser, and the profile JSON-LD uses a plain-string `address`** instead of `PostalAddress`. Files: `profile.js:198, 488, 628, 706-723`.
2. **The sitemap has no profile URLs**, so listings can't be found by location. File: `sitemap.xml` (via `tools/build-profiles.js`).
3. **Circuits.com's own name, address and phone details are thin.** The phone numbers appear only on `/contact`. The Organization schema has no telephone, address, `contactPoint` or `sameAs`, and no legal entity is named anywhere. Files: `contact.html`, `index.html`.
4. **Structured location data is missing.** Location is a single free-text field, so a `PostalAddress` needs new columns or parsing. Any new column needs an anon SELECT grant (`tools/rls-check.sql`).
5. **Advice:** don't create a Google Business Profile. Prefer LinkedIn, Crunchbase, IPC and SMTA citations. Build region landing pages only where real listings exist, to avoid doorway pages.

## What could not be checked, and why

- **Core Web Vitals (LCP, INP, CLS):** PageSpeed Insights returned 429 to anonymous requests, and the plugin's Chromium download from `cdn.playwright.dev` is blocked here. The Performance score (68) is an estimate from the source, and there are no screenshots or rendered-page checks.
- **Live listing inventory and JS-rendered content:** the Supabase project can't be reached from this sandbox, so injected markup was read from the source instead.
- **Backlinks:** Common Crawl couldn't be reached, and no Moz, Bing or DataForSEO keys are set.
- **Brand mentions and AI citations:** the Wikipedia, Wikidata and Reddit APIs were blocked, so mentions rest on web search alone. No AI-visibility tool is connected.
- **Local rankings:** geo-grid rankings, local pack and GBP Insights need paid tools and Search Console access.
- **Search Console data:** no access, so none of the indexing or impression figures were checked.

## Quickest safe wins (where the reports agree)

1. Delete the JobPosting injection in `jobs.html`.
2. Add a static `noindex, follow` to `results.html`.
3. Fix `tools/build-profiles.js` so it keeps every static page, then generate profile pages with their content and schema in the HTML.
4. Point the homepage cards at the public pages, show the H1, and add `action`/`name` to the search form.
