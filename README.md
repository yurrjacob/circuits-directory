# Circuits.com

The industry directory for the circuits and electronics trade. Buyers search a
keyword; the companies that serve that keyword appear in the order they claimed
it. Companies pay to hold a position and to run a profile at
`circuits.com/their-name`.

**Status: pre-launch.** Payments are not built yet (see [Not built](#not-built)),
so nothing can be charged today.

---

## How it fits together

There is no build step and no server of our own. Everything is static files
served by GitHub Pages, talking directly to Supabase from the browser.

```
Browser ──► GitHub Pages (static HTML/CSS/JS)
   │
   ├──► Supabase Postgres     data, access rules, all business logic
   ├──► Supabase Auth         accounts, password reset
   ├──► Supabase Storage      logos and documents (public buckets)
   ├──► FormSubmit            transactional email to the founders
   └──► Google Analytics      only after the visitor accepts cookies
```

The important consequence: **anything running in the browser can be edited by
anyone.** Every rule that actually matters is enforced inside Postgres by Row
Level Security and by triggers, not by the JavaScript in this repo. The
JavaScript is a convenience layer over rules the database imposes anyway.

## Files

| File | What it does |
|---|---|
| `store.js` | Every call to Supabase. The only file that talks to the database. |
| `app.js` | Shared helpers: search, the Get Listed form, sign-in, anti-spam, email. |
| `profile.js` | Renders a public company or person profile. |
| `portal.js` | The customer portal: profile editing, listings, and account settings. |
| `admin.js` | The staff Admin tab inside the portal (listings, banners, applications). |
| `nav.js` | Shared header behaviour: signed-in relabel, phone menu, skip link. |
| `analytics.js` | Cookie consent gate. Google Analytics loads only after acceptance. |
| `index.html` | Homepage. Deliberately a bare search page, see below. |
| `company.html` | Template the profile generator fills in. |
| `applications.html` | The staff sheet for reviewing incoming listing applications. |
| `tools/` | Checks and the profile/sitemap generator. |

**The homepage is intentionally sparse.** Logo, one search box, popular
categories, one call to action. Explanatory sections have been tried and
removed; do not add them back.

## Data

Postgres, in the Supabase project `ghpruernzhjwsgsezdyn`.

| Table | Holds |
|---|---|
| `applications` | One row per company-plus-keyword. This is a *listing*. Status Pending / Approved / Denied. Order of claim decides ranking. |
| `companies` | One row per company. This is a *profile*, the thing at `circuits.com/<handle>`. |
| `profiles` | A person's own account and handle. Shares the same namespace as `companies`. |
| `company_users` | Who may manage which company. |
| `claims` | Requests to take over an existing listing. Reviewed by hand. |
| `reviews` | Buyer reviews. Held Pending until staff approve. |
| `inquiries`, `inquiry_messages` | Quote requests and their reply threads. |
| `profile_events` | Views, contact clicks and quote requests, for the analytics. |
| `security_log` | Append-only record of staff actions. Cannot be edited or deleted, including by staff. |
| `rate_log` | Per-IP submission counts, for rate limiting. Not readable through the API. |
| `staff`, `reserved_handles` | Who is staff; names nobody may claim. |

**Listing ≠ profile.** Anyone may register an account and take a handle. A
*listing* in the directory always needs staff approval. Keeping these separate
is the core rule of the system.

## The publishable key is meant to be public

`store.js` contains a Supabase URL and a publishable key in plain text. That is
correct and intended, that key only grants what Row Level Security allows.

What must **never** appear in this repo, or anywhere in the browser, is the
**service role key**, which bypasses every rule. There is no `.env` file and no
build-time secret injection, because there is no secret to inject.

## Checks

```bash
node tools/check.js      # everything below, in one command
```

That runs, in order:

- **`tools/check.js`**, structural rules: slugs match the database, no
  `javascript:` URLs, every page loads the scripts it uses, one shared header
  and footer, no page name a company could claim, spam traps present, and more.
- **`tools/render-check.js`**, renders a fully populated profile with stubs and
  asserts the markup is balanced.
- **`tools/failure-check.js`**, runs the search and profile pages against a
  database that refuses every request, and fails if either offers to sell a
  keyword or an address as a result.
- **`tools/completeness-check.js`**, the profile completeness meter and the
  percentage-change arithmetic, including the divide-by-zero cases.

Separately, against the database:

```bash
# paste tools/rls-check.sql into the Supabase SQL editor
```

That one is the important one. It creates throwaway users and companies and
asserts that a supplier cannot read another supplier's quote requests or
analytics, cannot approve their own listing, cannot grant themselves a Verified
badge, cannot lift their own suspension, and that rate limits actually fire. It
cleans up after itself at both ends.

## Deploying

Commit to `main`. GitHub Pages publishes it. `CNAME` points at circuits.com.

Category and profile pages are generated:

```bash
node tools/build-profiles.js     # writes profile pages and sitemap.xml
```

## Not built

Honest list of what does not exist yet:

- **Payments.** No Stripe, no checkout, no subscription lifecycle. Listings
  cannot be charged for today. This is the launch blocker.
- **Supplier email notifications.** A new quote request emails the founders, not
  the supplier. FormSubmit only delivers to addresses that have confirmed
  themselves, so it cannot reach arbitrary customer addresses. Needs a real
  sending service.
- **A populated directory.** The listings currently in the database are test
  data.
- **Staging.** There is one environment, and it is production.
- **Automated browser tests.** The checks above are static and headless; nothing
  drives a real browser.

## Security

See [SECURITY.md](SECURITY.md).
