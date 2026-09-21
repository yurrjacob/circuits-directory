# Email: how Circuits.com sends mail, and what to do when it stops

Every email the site sends goes through one Supabase edge function, `notify`,
which sends through [Resend](https://resend.com). The source is
`tools/edge-notify.ts`; deploy it after editing. FormSubmit is no longer used
by any live form.

## The rule that matters

The caller of `notify` can never choose who gets mail. Every kind looks its
recipient up in the database: a staff address from the `staff` table, the
owner of a notification row, the email on the listing request or claim that
was just filed, the employer on a job. Nothing in a request body is ever a
destination on its own. Keep it that way when adding a kind, or the function
becomes an open relay.

## What sends what

| Kind | Fired by | Goes to |
|---|---|---|
| `inbox` | the database, after a row lands in `notifications` (or the every-minute sweeper for rows whose `email_after` is ahead, which is how the welcome waits ten minutes) | the row's owner |
| `listing-request` | Get Listed | the address on the rows just filed, and every staff address |
| `contact` | the contact form | every staff address; a copy to the sender only when Turnstile verifiably passed |
| `claim` | the access request on a company page | every staff address; the claimant, from the claims row, only when Turnstile verifiably passed |
| `decision` | staff approving or denying a listing | the listing's owner |
| `claim-invite` | staff approving a claim with no login behind it | Supabase Auth invites the claimant (this one does not use Resend) |
| `reply` | a supplier answering a quote thread | the buyer on that thread |
| `job-apply` | applying to a job | the employer on that job |
| `quote` | nothing: switched off | returns 410 |

Staff addresses are rows in the `staff` table. To change who receives contact
messages, listing requests and access requests, change that table. There is
nothing to activate and no address to confirm.

## Secrets the function needs

Set under Edge Functions, Secrets, in the Supabase dashboard (or
`supabase secrets set NAME=value`):

| Secret | What for | Without it |
|---|---|---|
| `RESEND_API_KEY` | sending mail | every kind but `claim-invite` answers `not_configured` and nothing is sent |
| `NOTIFY_FROM` | the From line | defaults to `Circuits.com <notifications@circuits.com>` |
| `TURNSTILE_SECRET` | verifying the "I am human" token on `contact` and `claim` | staff still get the mail, marked `[unverified]` in the subject with a line saying to set the secret, and no copy goes to the sender or claimant |

The Turnstile **site** key is public and lives in `store.js`. The **secret** is
the one from the same Cloudflare widget, and it belongs only in the function's
secrets. It is separate from the CAPTCHA setting in Supabase Auth, which
covers sign-up, sign-in and reset on its own.

## When mail stops

1. Open the function's logs in the Supabase dashboard (Edge Functions,
   `notify`, Logs). A failed Resend call is logged as `resend failed` with the
   status and Resend's own message.
2. `not_configured` means `RESEND_API_KEY` is missing.
3. A contact or claim answering `captcha` (HTTP 403) means Turnstile refused
   the token: the page shows "The I am human check did not pass" and lets the
   person try again. If every submission fails, the secret in the function
   does not match the site key in `store.js`.
4. Nothing arriving for a listing request or claim usually means the row was
   acknowledged already: each is mailed at most once (`ack_sent_at`).
5. The welcome email arrives ten minutes after the profile exists. To change
   that, edit the interval in `welcome_notification()`; see
   `tools/delayed-welcome-email.sql`.

## Where this lives in the code

- Function: `tools/edge-notify.ts` (the deployed copy is `notify`, verify_jwt off on purpose; the protection is the recipient rule above, not authentication).
- Browser side: `notifyFunction(kind, payload)` in `store.js`, used by `contact.html` and `claim.html`; `notifyListingRequest` in `store.js` for Get Listed.
- Turnstile in the page: `mountTurnstile`, `turnstileProblem`, `turnstileToken`, `resetTurnstile` in `app.js`.
- The sweeper and the retention job: `tools/delayed-welcome-email.sql`, `tools/retention.sql`.
