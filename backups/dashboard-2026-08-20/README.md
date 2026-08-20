# Dashboard backup — 2026-08-20

Complete copies of `portal.html` and `portal.js` taken just before the
**Overview**, **Quote requests** and **Reviews** tabs were removed from the
supplier dashboard (Jacob: back them up, then remove them for now), and
before Profile settings was split into three tabs.

They match repo commit `9e8f95d` exactly.

## To bring a tab back

Everything the three tabs need is still in the live `portal.js` — the
functions were left in place, only their triggers were removed. Restoring is:

1. Copy the tab's `<button class="pt-tab" ...>` and its `<section
   class="pt-panel" id="tab-...">` from the `portal.html` in this folder back
   into the live `portal.html`.
2. In the live `portal.js` `loadCompany()`, restore the matching fetch
   (`fetchInquiries` / `fetchMyReviews` / `companyStats`) and render call
   (`renderInquiries()` / `renderReviews()` / `renderOverview(stats)` /
   `markUnread()`) — the backed-up `portal.js` here shows exactly how they
   were wired. For Quote requests also restore the `inquiries` branch in
   `wireTabs()`.
3. Remove the corresponding "stays out" assertions in `tools/check.js`, run
   `node tools/check.js`, publish.

Or, to restore all three at once, replace the live `portal.html` and
`portal.js` with the copies here — but note anything shipped after
2026-08-20 (including the three-tab profile settings) would be lost.
