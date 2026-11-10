# Circuits.com SEO Audit, 10 November 2026

**SEO Health Score: 49 / 100**

Business type: B2B industry directory (marketplace) with a Job Board and a Talent Board. It is not local and not e-commerce, and it has no blog.

## The short version

The foundations are sound: HTTPS, 301s from http and www, a real 404 page, self-canonicals, a clean robots.txt and good alt text. The problem is that **search engines are offered almost nothing to index**. The directory's actual value (company listings, keyword results, jobs, talent) is built by JavaScript after a Supabase fetch. Without JS, a crawler sees "Loading...", "Showing 0 Results" and "Showing 0 Jobs". The only URL type that could hold listing content without JS is the static company profile page. Its generator has never written a real profile, and as it stands it would also break the sitemap.

Fix discovery first. Nearly every other recommendation pays off only once real listing pages exist in the HTML.

## Scores

| Category | Weight | Score | Basis |
|---|---|---|---|
| Technical SEO | 22% | 58 | measured (curl + source) |
| Content Quality | 23% | 36 | measured (raw HTML word counts, copy review) |
| On-Page SEO | 20% | 44 | measured |
| Schema | 10% | 48 | measured (source) |
| Performance (CWV) | 10% | 68 | **estimated**: PageSpeed returned 429 and no browser was available |
| AI Search Readiness | 10% | 34 | measured, except brand mentions |
| Images | 5% | 90 | measured |
| **Weighted total** | | **49** | |

Side scores (not in the total): SXO gap 38/100. Backlinks: no data (see "Not measured").

## Critical

### C1. Fix `tools/build-profiles.js` before anyone runs it
- **Observation:** `STATIC_PAGES` (lines 24 to 27) includes `/join` but not `/jobs` or `/talent`, and the script overwrites `sitemap.xml` completely (line 119). The live sitemap was hand-edited afterwards. The next run would remove `/jobs` and `/talent`, and `tools/check.js:1249` would then fail. It would also stamp every static page's `lastmod` with today's date, and it never lists `/clubs` or `/global`.
- **Change:**
  - Make `STATIC_PAGES` cover `/`, `/join`, `/jobs`, `/talent`, `/clubs`, `/global`, `/about`, `/contact`, `/register`, `/terms` and `/privacy`.
  - Take each static page's `lastmod` from `git log -1 --format=%cs -- <file>`.
  - Drop `<priority>` (Google ignores it).
  - Refuse to write if a URL currently in the sitemap would disappear, unless `--force` is passed.
  - Add a check in `check.js` that every indexable static page appears in `STATIC_PAGES`.
- **Unblocks:** C2, H1.
- **How we'd know it failed:** after a run, `git diff sitemap.xml` shows a URL removed, or `node tools/check.js` fails.
- **Leading indicator:** the number of URLs in the sitemap, and Search Console's "Discovered" count.

### C2. Put listing content into the HTML of each profile page
- **Observation:** `tools/.generated-profiles.json` is `[]`. No `circuits.com/<handle>` page has been generated, so `/northbridge` returns a 404. Even a generated page only gets title, description and canonical substitution. The body is filled by `profile.js` (raw HTML for `/jacob` says "Loading..."), and the Organization schema is injected by JS (`profile.js:706`).
- **Change:** have `build-profiles.js` render the company name, tagline or description, keywords, location, contact links, an H1, and the ProfilePage + Organization + BreadcrumbList JSON-LD straight into the HTML (see the schema block in `scratchpad/schema.md`). Keep `profile.js` for live extras. Then run the script and commit the pages. Sample pages stay noindex and out of the sitemap, as they already are.
- **Depends on:** C1.
- **Open question:** I couldn't count live approved listings, because Supabase is blocked from this sandbox. If there are only a handful, the work is still right, but listing companies is the real bottleneck rather than SEO.
- **How we'd know it failed:** `curl -s https://circuits.com/<handle> | grep -c '<h1'` returns 0, or Search Console shows the profile URLs as "Crawled, not indexed" after 4 weeks.
- **Leading indicator:** indexed profile pages in Search Console (Pages report, filtered by sitemap).

## High

### H1. Make keyword results pages indexable without JS
- **Observation:** `/results?q=pcb` raw HTML is 5 KB, has an empty `#results-body` and never mentions "pcb". There's no static canonical or robots meta. `app.js:363-373` sets both after the fetch, so an outage or slow fetch leaves an indexable empty page.
- **Change:**
  - Short term: add a static `noindex, follow` to `results.html`. The JS can then promote pages with listings to `index`. This is safer than the current default, because a failed fetch stays out of the index.
  - Longer term: have the generator emit a static category page for each keyword with 3 or more live listings. Give it a visible H1 ("PCB Assembly Suppliers"), a count, a short intro and the rendered list, and put it in the sitemap instead of the `?q=` URLs.
  - Watch for name clashes with `reserved_handles`.
- **Depends on:** C1. Sits alongside C2.
- **How we'd know it failed:** Search Console shows "Soft 404" or "Duplicate without user-selected canonical" for results URLs.
- **Leading indicator:** impressions for "<keyword> suppliers" queries.

### H2. Remove the JobPosting markup on `/jobs` until each job has its own page
- **Observation:** in `jobs.html:143-151`, every posting's `url` is `/jobs?q=<first keyword>`, `employmentType` is hardcoded to `FULL_TIME` (line 149), the address is a plain string and the list order is random. Google requires one page per posting, and markup that doesn't match the page risks a manual action.
- **Change:** delete the injection now. This is a small, safe win. Bring it back only alongside `/jobs/<id>` pages that carry one JobPosting each, with a PostalAddress address, a real `validThrough`, and expired jobs removed or returning 410.
- **How we'd know it failed:** a structured-data error or manual action appears in Search Console.
- **Leading indicator:** the Search Console "Job postings" enhancement report shows 0 errors.

### H3. Homepage: a visible H1, a plain-language intro and proof
- **Observation:** the only H1 on `/`, `/jobs`, `/talent` and `/results` is `sr-only` (for example `index.html:85`). The homepage has 233 words, and buyer terms such as "PCB assembly suppliers" appear only in meta tags. "Circuits-Keyword" is not a term anyone searches for.
- **Change:**
  - Show an H1 under the logo.
  - Add one paragraph that says what the site is, in buyer terms (for example: "Find PCB assembly, semiconductor and component suppliers. Free to list, free to search.").
  - Show live counts of companies, keywords and jobs with an "as of" date.
  - Make the visible labels "Job Board" and "Talent Board" into H1s.
  - Rewrite generic titles ("Job Board | Circuits.com") to target real queries ("Electronics Engineering Jobs | Circuits.com Job Board").
- **How we'd know it failed:** the homepage CTR in Search Console stays flat 4 weeks after the change.
- **Leading indicator:** homepage impressions for non-brand queries.

### H4. Name the people behind the site
- **Observation:** `/contact` lists John Tietjen and Mike Kennedy, PhD, with email and phone. `/about`, the privacy policy and the Organization schema name nobody. The privacy policy says "Circuits.com operates this directory". There's no legal entity, postal address or `sameAs` link.
- **Change:**
  - Add a short "Who runs Circuits.com" section to `/about`.
  - Name the legal entity in the terms and privacy policy.
  - Add `founder`, `contactPoint`, `legalName` and `sameAs` (LinkedIn, at least) to the homepage Organization JSON-LD.
- **How we'd know it failed:** a knowledge panel or entity still doesn't resolve for "Circuits.com directory" after several months. This is a slow signal.
- **Leading indicator:** branded search impressions.

### H5. `/jacob` is a person page built on the supplier template
- **Observation:** its title reads "Jacob Kennedy | Supplier Profile | Circuits.com" and its description is "Developer @ Circuits.com". It's typed Organization, renders nothing without JS and isn't in the sitemap, yet it's indexable.
- **Change:** decide whether personal profiles are a feature. If they are, give `pageFor` in `build-profiles.js` a label for people ("Profile", not "Supplier Profile") and Person schema. If they aren't, add `noindex` to the page.

## Medium

- **M1. Search works without JS.** Give `#home-form` and the mini-forms on `/jobs` and `/talent` `action` and `method="get"` attributes and `name="q"` on the input. This helps agents, crawlers that follow forms, and visitors whose JS fails. It's a few lines of HTML per page.
- **M2. Fetch-dependent pages (inferred, not measured).**
  - Reserve height for `#results-body` with a skeleton to avoid layout shift when results arrive.
  - Add `defer` to the supabase-js, `store.js` and `app.js` scripts and to `nav.js` in `<head>`, where safe.
  - Add the Supabase preconnect on every page that fetches at load.
  - Convert `logo-home.png` (85 KB, 1108x185) to WebP.
  - Note that `styles.css` is 205 KB, blocks rendering and is shared by every page.
  - GitHub Pages caps the cache at `max-age=600`. Only a CDN in front changes that.
- **M3. Mobile tap targets and text.**
  - The search tabs are about 32px tall and the "Popular" links about 26px (the guideline is 44 to 48px).
  - The brand slogan and BETA tag are about 9px on mobile.
  - "Get Listed" is hidden in the burger menu at 720px and below.
- **M4. Choose winnable queries.** Indeed and Dice own "electronics engineering jobs", and Thomasnet, IPC and others own head directory terms. Aim category pages (H1) at long-tail "<niche> suppliers" and "<niche> + region" queries. Searches for "electronics distributors list" return editorial Top-N articles, and that only becomes reachable with editorial pages.
- **M5. Internal links.** `/clubs` and `/global` are not in the footer, and three homepage directory links use generic anchors (Engineers, Buyers, Manufacturers).

## Low

- IndexNow key file and ping (for Bing and Yandex) once profiles are being generated.
- `llms.txt` is optional. Google ignores it, so this is low value.
- Meta `referrer` and a CSP via `<meta http-equiv>` (GitHub Pages can't set headers).
- HTML comments on every page carry staff names and dated notes. Visitors don't see them, but they're in the page source.
- `/register` meta description is 83 characters and `/about`'s is 165 (truncated).

## Passing

- **Redirects:** http and www both 301 straight to `https://circuits.com/`.
- **404s:** real 404 status with a noindex page.
- **Canonicals:** `/about.html` canonicalises to `/about`.
- **Indexing controls:** sample pages are noindex and kept out of the sitemap.
- **Crawler access:** robots.txt blocks only private areas and leaves CSS and JS open. All search and AI crawlers are allowed.
- **Accessibility and images:**
  - Every static image has alt text.
  - The search inputs are labelled.
  - The tabs are real buttons with ARIA.
  - The site uses system fonts.
- **Em dashes:** none found in the 12 pages reviewed.
- **Trust pages:** terms (1,862 words) and privacy (2,270 words) are substantial.

## Not measured (and why)

- **Core Web Vitals (LCP, INP, CLS):** PageSpeed Insights returned 429 and there was no headless browser, so the Performance score is a static estimate. To measure it, rerun with a PSI API key or check Search Console's Core Web Vitals report.
- **Backlinks:** Common Crawl couldn't be reached from this sandbox and no Moz or Bing key is set. An exact-match domain like this may carry links from earlier owners that now 404. Check Search Console > Links. GitHub Pages can't send server 301s, but a static page at the old path with a canonical and a meta refresh can catch the valuable ones.
- **Brand mentions:** web and Wikipedia lookups were blocked for the GEO agent.
- **Live listing inventory:** Supabase was blocked from this sandbox (see C2).

## Order of work

1. H2: delete the invalid JobPosting injection (minutes).
2. Add the static `noindex, follow` to `results.html` (minutes; part of H1).
3. C1: fix the generator and add its check.
4. C2: render profile content into the HTML, then run the generator and commit.
5. H3, H4, H5: copy and identity changes, which can happen in parallel with step 4.
6. H1 (long term): keyword category pages.
7. Then the Medium items.

The detailed findings from each agent are in the session scratchpad: technical, content, schema, sitemap, performance, visual, geo, agentic, backlinks and sxo (`.md`).
