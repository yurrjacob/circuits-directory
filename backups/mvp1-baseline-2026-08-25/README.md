# Version 1 — pre-MVP1 baseline (2026-08-25)

This folder is a **backup of the full site as it stood before the MVP1 changes**,
so the pieces removed for MVP1 can be brought back for MVP2.

**Version-1 commit:** `78ade7f56100679a71e0491b255d50c6efbdd8e4` (everything is recoverable from git history at this SHA).

## What MVP1 removed (and where to find it here for MVP2)

**Get Listed page (`join.html`)** — the full multi-step form is preserved here.
MVP1 stripped it down to a free listing *request* (company info + up to 10 free
keywords + message → "Submit Request", no account, no pricing). For MVP2, these
sections live in this backup's `join.html` and their wiring in `app.js`:
- Section 00 — Create Your Account (username / email / password / log-in)
- Section 03 — Dominate (Exclusive Sponsor banner) — `#promo-check`, banner preview
- Section 04 — Add Trust Upgrade (Trust Badge builder) — `#badge-check`, `#badge-builder`
- Section 05 — Pricing Estimate — `#quote-step`, `buildQuote()` in app.js

**Request A Quote / buyer inquiry system** — removed from the public UI in MVP1
but the code is intact (it was already dormant). Preserved here:
- `profile.js` — `rfqForm()` and its wiring (the on-profile quote form)
- `thread.html` / `thread.js` — the buyer's quote-thread page
- `app.js` — `quoteBtn()` (the per-listing quote/contact button)
- The database inquiries pipeline (inquiries, inquiry_messages tables, the
  `notify` edge function quote/reply kinds, create_inquiry / post_buyer_message /
  thread_by_token RPCs) was left fully intact — only the UI entry points were removed.

## Homepage
MVP1 changed the sub-CTA from "Claim Your Ranked Position" to "Free to Join!".
