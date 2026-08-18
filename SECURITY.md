# Security

## Reporting a problem

Email **john@circuits.com** and **mike@circuits.com**. Please do not open a
public issue for anything exploitable.

Tell us what you did, what happened, and what you expected. We will confirm
receipt and tell you what we are doing about it.

## Where the rules actually live

Circuits.com is static files in a browser talking straight to Postgres. There is
no server of ours in between, so **nothing enforced in JavaScript is enforced at
all** — anyone can edit the page and call the database directly with the same
key.

Every rule that matters therefore lives in the database:

- **Row Level Security** on every table decides who can read and write what.
- **Triggers** stop specific abuses that a policy cannot express: awarding
  yourself a Verified badge, lifting your own suspension, editing the audit log,
  submitting faster than the rate limit.
- **`SECURITY DEFINER` functions** run with elevated rights, so each one checks
  ownership itself. These are the sharpest edge in the system: a missing check
  inside one of them is a hole no policy will catch.

`tools/rls-check.sql` exercises these from the perspective of an anonymous
visitor, a signed-in stranger, an owner and a staff member. Run it after any
change to policies, triggers or those functions.

## Things that are public on purpose

- **The Supabase publishable key** in `store.js`. It grants only what Row Level
  Security allows.
- **Uploaded logos and documents.** Storage buckets are public; anyone with the
  URL can open the file. Customers are told this in the privacy policy. Do not
  put anything confidential in them.
- **Approved listings, company profiles and approved reviews.** The whole point.

## Things that must never be public

- **The Supabase service role key.** It ignores Row Level Security entirely. It
  must never appear in this repository, in any page, or in any browser. If it is
  ever exposed, rotate it immediately in the Supabase dashboard.
- **Quote requests, analytics and contact details of buyers.** Readable only by
  the company they were sent to, and by staff.

## Known gaps

Recorded here rather than left implicit:

- **Claim verification is manual.** Anyone can submit a claim on any listing; a
  person reviews it. There is no automated proof of employment, such as a
  company-domain email or a token on the company website.
- **No leaked-password protection or failed-login lockout.** Both are Supabase
  dashboard settings and are not switched on yet.
- **No HSTS.** Requires Cloudflare or equivalent in front of GitHub Pages.
- **Rate limiting is per IP.** An attacker with many addresses is not stopped by
  it. It is there to stop volume abuse, not a determined individual.
- **One environment.** Changes go straight to production.

## Handling a suspected breach

1. Rotate the service role key in the Supabase dashboard.
2. Read `security_log`. It is append-only and cannot be edited or deleted by
   anyone, including staff, so it is trustworthy after an incident.
3. Suspend affected companies or profiles rather than deleting them — suspension
   hides them immediately and keeps every record for the investigation.
