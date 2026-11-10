# Circuits.com GEO Analysis, 10 November 2026

**GEO Readiness Score: 32 / 100**

Scope: AI search readiness (Google AI Overviews and AI Mode, ChatGPT Search, Perplexity, Claude, Bing Copilot) for https://circuits.com. This report goes with the full audit from the same day (`2026-11-10-full-audit.md`), which scored AI Search Readiness at 34. The two scores agree. Where the fix is the same one the full audit already gave, this report points to it by number (C2, H1, H3, H4) and doesn't repeat it.

Method: I fetched the live pages with a GPTBot user agent and no JavaScript, which is how most AI crawlers see a page, removed scripts, styles and comments, and read what was left. I checked brand mentions through web search. Direct Wikipedia, Wikidata and Reddit API calls were blocked from this sandbox.

## The short version

Every AI crawler is allowed in. The trouble is that **they find almost nothing to cite once they arrive**. Listings, jobs, talent and clubs are all filled in by JavaScript after a Supabase fetch. A crawler that doesn't run JS reads "Showing 0 Results", "Loading the directory…" and "Showing 0 Jobs". The only page with real prose is `/about` (362 words), and it is all positioning copy with no facts in it: no counts, no dates, no names, and no definition of a Circuits-Keyword that a machine could quote. Web search turned up no third-party mentions of the brand.

For Google, Google's own guidance is that GEO is just SEO. Ranking pages feed AI Overviews, so the full audit's C2 and H1 (static profile and category pages) are also the most important GEO fixes. For ChatGPT, Perplexity and Claude, which mostly read raw HTML and lean on Wikipedia, Reddit and YouTube, the extra work is to put facts in the HTML and to get the brand mentioned off-site.

## Score breakdown

| Criterion | Weight | Score | Why |
|---|---|---|---|
| Citability | 25% | 25 | No statistics, dates or quotable definitions. "World's intelligent search index" is a claim with nothing behind it. Listing content can't be read without JS. |
| Structural readability | 20% | 40 | `/about` has a clean H1 and H2s and labelled lists. The homepage H1 is `sr-only`. There are no question headings, tables or FAQ blocks. |
| Multi-modal | 15% | 30 | Logo and OG card only. No video, charts or diagrams. Search, the one interactive feature, needs JS. |
| Authority and brand | 20% | 20 | The founders are named only on `/contact`. No dates on any page, no `sameAs`, and no third-party mentions found. |
| Technical accessibility | 20% | 45 | HTTPS, an open robots.txt and a sitemap are all in place. But every page's main content renders only with JS, and the sitemap has 8 URLs, none of them a listing. |
| **Weighted total** | | **32** | |

## Platform readiness (qualitative, not measured)

No AI-visibility tool (DataForSEO, SE Ranking) is connected, so these are judgements, not scores.

| Platform | Readiness | Main blocker |
|---|---|---|
| Google AI Overviews | Low | Googlebot runs JS, but the site ranks for very little. AI Overviews mostly cite pages already in the top 10. |
| Google AI Mode | Low | AI Mode draws on a wider pool, but it still needs pages about a specific entity or topic. No static listing pages exist. |
| ChatGPT Search | Very low | OAI-SearchBot is allowed but reads empty listing shells. No Wikipedia or Reddit presence. |
| Perplexity | Very low | Same raw-HTML problem. Perplexity leans hardest on Reddit, where nothing was found. |
| Claude search | Very low | Claude-SearchBot is allowed. Same raw-HTML problem. |
| Bing Copilot | Low | Depends on the Bing index. No IndexNow yet (Low item in the full audit). |

## AI crawler access

robots.txt has one `User-agent: *` group with `Allow: /`. It disallows only private paths (`/admin`, `/dashboard`, `/portal`, `/claim`, `/company`, `/thread`, `/applications`, `/login`) and lists the sitemap. No crawler is named, so every one below is **allowed** on all public pages.

**Search and citation crawlers** (these decide whether the site can be cited):

| User agent | Governs | Status |
|---|---|---|
| Googlebot | Google Search, AI Overviews, AI Mode | Allowed |
| OAI-SearchBot | ChatGPT Search citations | Allowed |
| Claude-SearchBot | Claude search citations | Allowed |
| PerplexityBot | Perplexity answers | Allowed |
| Applebot | Siri, Spotlight, Safari search | Allowed |
| Bingbot | Bing and Copilot | Allowed |

**Training crawlers** (these govern model training, not citations):

| User agent | Governs | Status |
|---|---|---|
| GPTBot | OpenAI model training | Allowed |
| ClaudeBot | Anthropic model training | Allowed |
| Google-Extended | Gemini and Vertex training and grounding (not Search or AI Overviews) | Allowed |
| Applebot-Extended | Apple Intelligence training opt-out | Allowed |
| CCBot | Common Crawl corpus | Allowed |

**User-triggered fetchers** (Google-Agent, ChatGPT-User, Perplexity-User, Claude-User): allowed. robots.txt wouldn't stop most of them anyway.

**No change needed.** For a new directory that wants to be known, allowing training crawlers is a reasonable choice: it helps models learn that the brand exists. Blocking them is a licensing decision, and it would not affect citations.

No `nosnippet`, `data-nosnippet` or `max-snippet` limits are set, so Google may quote any text. That is correct here.

## llms.txt

**Missing** (`/llms.txt` returns the 404 page). Google says it ignores the file, and no major AI provider has confirmed using it, so it adds nothing to the score. If you want it anyway for other tools, it takes five minutes. Write it only after the pages it lists contain real content:

```
# Circuits.com
> Free directory of the circuits and electronics industry: suppliers, distributors, engineers, jobs and student clubs, organised by Circuits-Keywords.

## Directory
- [Search the directory](https://circuits.com/): Find companies, people, jobs and clubs by keyword
- [Global Directory List](https://circuits.com/global): Every listed company by keyword
- [Job Board](https://circuits.com/jobs): Open roles in the circuits industry
- [Talent Board](https://circuits.com/talent): Engineers and technicians open to work
- [Global Club List](https://circuits.com/clubs): University student clubs

## About
- [About Circuits.com](https://circuits.com/about): How listings, keywords and rotation work
- [Get listed](https://circuits.com/register): Free listing under up to 10 keywords
- [Contact](https://circuits.com/contact): John Tietjen (CEO) and Mike Kennedy, PhD (COO)
```

## Brand mentions

| Platform | Found | Note |
|---|---|---|
| Wikipedia / Wikidata | None found | Direct API blocked. Web search showed no article or item. |
| Reddit | None found | Direct API blocked. Web search showed nothing. |
| YouTube | None found | No channel or video turned up. |
| LinkedIn | Not verified | No `sameAs` link on the site, so I couldn't check a company page. |
| Industry press | None found | A search for "circuits.com" plus "directory" returned Circuit Cellar, Airframer and eTesters, but not Circuits.com. |

**One opening worth knowing about:** Circuitnet's Circuit Insight supplier directory, which ran from 2007, is [no longer maintained](https://www.circuitnet.com/web/directory.html), and its page now tells visitors to use search engines or AI apps instead. Some of the people who used it are now looking for a replacement.

## Passage-level citability

A citable passage makes sense on its own and states something specific. Here is what exists today:

| Page | Passage | Citable? |
|---|---|---|
| `/about` | "Circuits.com is the world's intelligent search index for the entire circuits industry." | Weak. It's a superlative with no evidence. |
| `/about` | "Listings rotate randomly to guarantee equal organic visibility for every participating business." | **Good.** Specific and unusual. The best candidate. |
| `/about` | "Approved posts run for 30 days on the Job Board…" | **Good.** A concrete fact. |
| `/about` | "…choose up to 10 industry keywords. You will automatically appear on the Talent Board…" | Good, but split across two sentences. |
| `/register` | "Your username is your Circuits.com address. Pick johndoe and your profile lives at circuits.com/johndoe." | Good. Clear and quotable. |
| `/`, `/global`, `/jobs`, `/talent`, `/clubs`, `/results` | Nothing in raw HTML beyond one-line labels | None |

Nowhere on the site, visible or in schema, is there an answer to "What is a Circuits-Keyword?". That is the brand's own term, so it is the one question only this site can answer.

## Server-side rendering

| Page | Raw-HTML words | Main content without JS |
|---|---|---|
| `/` | 233 | Search box and popular-keyword links. 8 crawlable `/results?q=` links. |
| `/about` | 362 | All present (static) |
| `/register` | 225 | All present (static) |
| `/contact` | 84 | Founders present |
| `/jobs` | 59 | "Showing 0 Jobs" |
| `/talent` | 58 | "Showing 0 people" |
| `/clubs` | 60 | "Loading clubs…" |
| `/global` | 53 | "Loading the directory…" |
| `/results?q=…` | 31 | "Showing 0 Results" |
| `/<handle>` profiles | n/a | None have been generated (full audit C2) |

GitHub Pages can't render on the server, but the site doesn't need it to. A static generator that runs at build time or on a schedule (`tools/build-profiles.js`, extended as C2 and H1 describe) gives the same result. `/global` and `/clubs` are the easiest to win: one static HTML table that the generator rewrites each day.

Also in raw HTML: the nav text "Dashboard" and "Admin" appears on every page for anonymous visitors (it's hidden with CSS or JS). It's harmless, but it is the second line of text a crawler reads.

## Top 5 highest-impact changes

### 1. Static listing pages: profiles, keywords, and `/global` as a table (full audit C2 + H1)
- **Observation:** AI crawlers that don't run JS see zero listings anywhere on the site. Google renders JS but has no listing URLs in the sitemap to find.
- **Change:** do C2 and H1 from the full audit. Also have the generator write the `/global` and `/clubs` tables into the HTML, rewritten daily, with the `lastmod` updated to match.
- **Unblocks:** 2, 4 and 5. Nothing else on this list pays off much without it.
- **How we'd know it failed:** `curl -s https://circuits.com/global | grep -c '<tr'` is 1 or less, or profile URLs sit at "Crawled, not indexed" after 4 weeks.
- **Leading indicator:** the number of indexed URLs in Search Console. Once Perplexity or ChatGPT start citing listings, referral sessions from `perplexity.ai` and `chatgpt.com` in analytics.

### 2. A "What is a Circuits-Keyword?" block and a facts strip on `/about`
- **Observation:** the brand term is never defined, and the page has no numbers or dates.
- **Change:** add a short Q&A section with question H2s. Draft copy is under "Content reformatting" below. Add live counts (companies, keywords, jobs, clubs) with an "as of" date, written in by the generator rather than fetched with JS.
- **Depends on:** 1 for the counts. The definitions can go in today.
- **How we'd know it failed:** asking ChatGPT or Perplexity "what is a Circuits-Keyword" still returns nothing about circuits.com 8 weeks after the page is indexed.
- **Leading indicator:** run that same prompt by hand once a month and record what comes back.

### 3. Name the people, the entity and the dates (full audit H4, extended)
- **Observation:** the founders appear only on `/contact`, and no page shows a date.
- **Change:** do H4 (founders on `/about`, `legalName`, `founder` and `sameAs` in the schema). Add "Last updated <date>" to `/about`, `/terms` and `/privacy`, and `dateModified` to their schema. Give each founder a short bio line with their industry background. That experience is the site's strongest credential, and it is invisible right now.
- **How we'd know it failed:** a search for "Circuits.com founder" in ChatGPT or Perplexity still returns nothing after the next crawl cycle.
- **Leading indicator:** branded impressions in Search Console.

### 4. Get mentioned off-site, starting where the industry already talks
- **Observation:** no third-party mentions were found. Ahrefs' 2025 study of 75,000 brands found that brand mentions correlate with AI visibility about three times more strongly than backlinks do. YouTube mentions correlated most strongly.
- **Change:** in order of effort:
  - Create a LinkedIn company page and link it with `sameAs`.
  - Ask each listed company to link to its circuits.com profile from its own site.
  - Post useful answers in r/PrintedCircuitBoard, r/ECE and r/AskElectronics, and in IPC and EEVblog forums, where a directory link actually helps the person asking. No promotional posting.
  - Pitch the "free, fair-rotation" model to trade press (Circuit Cellar, EE Times, Electronic Design) and to people who used the old Circuitnet directory.
  - Record a 2-minute YouTube walkthrough of searching and listing, and embed it on `/about`.
  - Wikipedia comes later. It needs independent press coverage first, and an article written by the company itself would be deleted.
- **Depends on:** 1, so that links land on pages with content.
- **How we'd know it failed:** a quarterly web search for "circuits.com" plus "directory" still shows no third-party pages.
- **Leading indicator:** referring domains in Search Console > Links.

### 5. Search that works without JS (full audit M1)
- **Observation:** `#home-form` has no `action` attribute, so agents and non-JS clients can't submit a search.
- **Change:** do M1 (`action="/results" method="get"` and `name="q"`). This matters more now that Google's agents and ChatGPT's agent mode browse pages for users.
- **How we'd know it failed:** with JS turned off, submitting the homepage form doesn't reach `/results?q=…`.
- **Leading indicator:** `/seo agentic` scores.

## Schema recommendations

The homepage already has Organization and WebSite with a SearchAction, which is a good base. Extend the Organization node so AI systems can tie the brand to real people and profiles. Fill in the bracketed values. Don't publish placeholders.

```json
{
  "@type": "Organization",
  "@id": "https://circuits.com/#org",
  "name": "Circuits.com",
  "legalName": "[registered entity name]",
  "url": "https://circuits.com/",
  "logo": "https://circuits.com/assets/logo-home.png",
  "description": "Free directory of the circuits and electronics industry. Companies, engineers, jobs and student clubs are listed under Circuits-Keywords, and listings rotate so every business gets equal visibility.",
  "foundingDate": "[YYYY]",
  "founder": [
    {"@type": "Person", "name": "John Tietjen", "jobTitle": "Co-Founder and Chief Executive Officer"},
    {"@type": "Person", "name": "Mike Kennedy", "honorificSuffix": "PhD", "jobTitle": "Co-Founder and Chief Operating Officer"}
  ],
  "contactPoint": {"@type": "ContactPoint", "contactType": "customer support", "url": "https://circuits.com/contact"},
  "sameAs": ["[LinkedIn company URL]", "[YouTube channel URL, once it exists]"]
}
```

Other schema:
- **`/about`:** an `AboutPage` with `mainEntity` pointing to `#org`, plus `dateModified`. Write the Q&A in plain HTML only. Google stopped showing FAQ rich results for all sites on 7 May 2026, and FAQPage markup has no proven AI-citation benefit.
- **Profiles:** ProfilePage + Organization (or Person for people) + BreadcrumbList, rendered into the HTML. The block is in the full audit, under C2.
- **`/global` and keyword pages:** `CollectionPage` with an `ItemList` of the listed organisations, written by the generator.
- **Jobs:** the full audit's H2 still applies. The client-side JobPosting injection is still in `jobs.html`. Remove it until there are `/jobs/<id>` pages.

## Content reformatting suggestions

**`/about`, opening line.** Replace the superlative with a definition that holds up on its own:

> Before: "Circuits.com is the world's intelligent search index for the entire circuits industry."
>
> After: "Circuits.com is a free directory of the circuits and electronics industry. Buyers search by part type, technology or skill and get the suppliers, engineers and student clubs listed under that keyword. Companies and professionals list for free under up to 10 Circuits-Keywords."

**`/about`, new Q&A section** (question H2s, each answer complete without the rest of the page):

> **What is a Circuits-Keyword?**
> A Circuits-Keyword is an industry term, such as "PCB Assembly", "Oscillators" or "Firmware Engineer", that a company or professional chooses to be listed under on Circuits.com. Each account can pick up to 10. When a buyer searches that term, every listing under it appears, in a random order that changes on each search, so no free listing outranks another.
>
> **How much does it cost to list?**
> Listing, posting a job and posting a resume are free. Approved job posts run for 30 days. Paid options add sponsor banners, a fixed top placement and trust badges, and they are labelled as such.
>
> **Who runs Circuits.com?**
> Circuits.com was founded by John Tietjen (CEO) and Mike Kennedy, PhD (COO). [One line each on their industry background.]

Check every fact in this copy against how the product actually works before publishing, in particular the rotation rule and how paid placements are labelled.

**Homepage.** Make the H1 visible, as H3 in the full audit says. Under it, add one sentence in buyer terms followed by the live counts strip (change 2).

**`/jobs`, `/talent`, `/clubs`, `/global`.** Keep the one-line intro, and add 2 or 3 sentences of static text saying what's listed and how to get on the list. That way the page still says something when the fetch fails.

## Not measured

- Actual AI citations or mentions (no DataForSEO, SE Ranking or Profound connection).
- Wikipedia, Wikidata and Reddit checked directly: the APIs were blocked, so these rest on web search alone.
- Live listing counts: Supabase is blocked from this sandbox.

Sources: [Circuitnet directory notice](https://www.circuitnet.com/web/directory.html), [Circuit Cellar directories](https://circuitcellar.com/directories/distributors-directory/), [Airframer circuits supply chain](https://www.airframer.com/supply_chain/category/circuits), [Google AI optimization guide](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide).
