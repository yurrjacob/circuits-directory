# Circuits.com

The free directory for the circuits and electronics trade, with a Job Board
and a Recruit Board. Buyers search a Circuits-Keyword; the companies listed
under it appear in the order they claimed it, rotated at random within that
order on each load. Companies list for free at `circuits.com/their-name`, post
jobs for free, and people post resumes for free. Paid extras (a Trust Badge, an
Exclusive Sponsor Banner, a Locked Position) are requested from the dashboard
and switched on by staff after payment is taken outside the site.

## How it fits together

There is no build step and no server of our own. Everything is static files
served by GitHub Pages, talking directly to Supabase from the browser.

```
Browser ──► GitHub Pages (static HTML/CSS/JS, plus vendor/ libraries)
   │
   ├──► Supabase Postgres     data, access rules, all business logic, scheduled jobs
   ├──► Supabase Auth         accounts, email confirmation, password reset
   ├──► Supabase Storage      logos and documents (public), resumes (private)
   ├──► Edge function auth    username sign-in and reset
   ├──► Edge function notify  every email the site sends, through Resend
   ├──► Cloudflare Turnstile  the "I am human" check on the forms that need one
   └──► Google Analytics      only after the visitor accepts cookies
```

The important consequence: **anything running in the browser can be edited by
anyone.** Every rule that matters is enforced inside Postgres by Row Level
Security and by triggers, not by the JavaScript in this repo. The JavaScript is
a convenience layer over rules the database imposes anyway. The two edge
functions hold the only secrets (the mail key, the Turnstile secret) and never
let the caller choose who gets mail: every address is looked up from a row.

## Files

| File | What it does |
|---|---|
| `store.js` | Every call to Supabase and to the edge functions. The only file that talks to the backend. |
| `app.js` | Shared helpers: search, sign-in, register, anti-spam, Turnstile, the notifications bell, pictures. |
| `profile.js` | Renders a public company or person profile. |
| `portal.js` | The dashboard: profile, listings, upgrades, Find Recruits, Job Search, branding, account. |
| `admin.js` | The staff Admin tab inside the dashboard. Every onclick name is exported to `window` at the bottom. |
| `nav.js` | Header behaviour before first paint: signed-in relabel, the bell, phone menu. |
| `analytics.js` | Cookie consent gate. Google Analytics loads only after acceptance. |
| `index.html` | Homepage: one search box that routes to the Directory, the Recruit Board or the Job Board. |
| `jobs.html`, `talent.html` | The Job Board and the Recruit Board. |
| `welcome.html` | Where an email confirmation lands: three choices, one per thing a new account can do. |
| `company.html` | Template the profile generator fills in. |
| `vendor/` | The Supabase client and the QR library, pinned, with the hash every page checks. |
| `tools/` | Checks, the profile and sitemap generator, the edge function sources, and the SQL record. |

**The homepage is intentionally sparse.** Logo, one search box, popular
categories, three doors. Explanatory sections have been tried and removed; do
not add them back.

## Data

Postgres, in the Supabase project `ghpruernzhjwsgsezdyn`.

| Table | Holds |
|---|---|
| `applications` | One row per company plus keyword. This is a *listing*: Pending, Approved or Denied. Order of claim decides ranking. Carries the per-listing description, documents and gallery. |
| `companies` | One row per company. The thing at `circuits.com/<handle>`. |
| `profiles` | A person's account and handle, and their resume: title, location, years, statement, credentials, contact email, phone, resume path, and whether they are on the Recruit Board. Shares the handle namespace with `companies`. |
| `talent_keywords` | A person's Circuits-Keywords for the Recruit Board. |
| `jobs`, `job_keywords`, `job_applications` | Job posts (live while `paid_until` is ahead, thirty days per staff approval, free), their keywords, and who applied. |
| `company_users` | Who may manage which company. |
| `claims` | Requests to take over an existing listing. Reviewed by hand; acknowledged by email once. |
| `upgrade_requests` | Requests for the paid extras, recorded and switched on by staff. |
| `notifications` | The inbox under the bell. Each row is emailed once, at or after `email_after`. |
| `reviews`, `inquiries`, `inquiry_messages` | Buyer reviews and quote threads. The quote form is switched off. |
| `searches`, `profile_events` | What people search for (no identifier), and profile views and clicks. Purged after thirteen months. |
| `wanted` | "Tell me when a supplier lists" requests. |
| `security_log` | Append-only record of staff actions. Cannot be edited or deleted, including by staff. |
| `rate_log` | Per-IP submission counts, for rate limiting. Not readable through the API. |
| `staff`, `reserved_handles` | Who is staff; names nobody may claim, including every root page. |

**Listing is not profile.** Anyone may register an account and take a handle.
A *listing* in the directory always needs staff approval. Keeping these
separate is the core rule of the system.

Scheduled jobs (pg_cron): `send-due-notification-emails` every minute sends
notices whose `email_after` has passed (the welcome waits ten minutes behind
the confirmation email); `purge-old-analytics` nightly enforces the retention
above.

## Email

Every email goes through the `notify` edge function and Resend. See
[EMAIL-FORMS-SETUP.md](EMAIL-FORMS-SETUP.md) for the kinds, the secrets and
what to do when mail stops. Nothing goes through FormSubmit any more except a
copy of replies in quote threads, and the quote form is off.

## The publishable key is meant to be public

`store.js` contains a Supabase URL, a publishable key and the Turnstile site
key in plain text. That is correct and intended: the key only grants what Row
Level Security allows, and the site key is public by design.

What must **never** appear in this repo, or anywhere in the browser, is the
**service role key**, the Resend key or the Turnstile secret. Those live in the
edge functions' secrets. There is no `.env` file and no build-time secret
injection, because there is no secret to inject.

## Checks

```bash
node tools/check.js      # the whole suite, in one command
node tools/stamp.js      # after changing any stylesheet or script: rewrites ?v= stamps
```

`check.js` runs the structural rules (hundreds of assertions over the source:
reserved names, no em dashes, no unpinned library, every onclick exported, the
privacy policy naming every provider, and so on) and then the behavioural
harnesses: `render-check.js`, `failure-check.js`, `completeness-check.js`,
`admin-check.js`, `inbox-check.js`, `listing-edit-check.js` and the rest. It
also recomputes the integrity hash of each file in `vendor/` against what the
pages ask for. GitHub Actions runs it on every push (`.github/workflows/`), and
a nightly workflow regenerates the profile pages and sitemap.

Separately, against the database:

```bash
# paste tools/rls-check.sql into the Supabase SQL editor
```

That one creates throwaway users and companies and asserts that a supplier
cannot read another supplier's data, cannot approve their own listing, cannot
lift their own suspension, that an account with a live listing cannot delete
itself, and that rate limits fire. It cleans up after itself at both ends.

## Database and function changes

Apply to the project, then record the SQL under `tools/` (`audit-hardening.sql`,
`recruiting-free.sql`, `bot-signup-guard.sql`, `grouped-listing-notifications.sql`, `profile-sync.sql`,
`delayed-welcome-email.sql`, `retention.sql`). The edge function sources are
`tools/edge-auth.ts` and `tools/edge-notify.ts`; deploy after editing. A new
column on `profiles` needs a SELECT grant for anon or every person page goes
blank; `rls-check.sql` guards that.

## Deploying

Commit to `main`. GitHub Pages publishes it. `CNAME` points at circuits.com.

Profile pages and the sitemap are generated nightly by a workflow, or by hand:

```bash
node tools/build-profiles.js
```

## Not built

- **Payments.** No checkout. The paid extras are requested from the dashboard,
  paid for outside the site, and switched on by staff in the admin console.
- **The quote form.** Off since 2026-08-21. The thread pages and the reply
  path still exist for the conversations already recorded.
- **Staging.** There is one environment, and it is production.
- **Browser tests in CI.** The harnesses under `tools/` are headless; the
  Chromium runs used during development are not part of the suite.

## Security

See [SECURITY.md](SECURITY.md).
