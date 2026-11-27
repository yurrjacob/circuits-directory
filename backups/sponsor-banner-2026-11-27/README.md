# Exclusive Sponsor Banner, archived (2026-11-27)

The 2026-11-23 change list asked for the Exclusive Sponsor Banner box to come
off every keyword results page, saved for later (probably about two months).

`app.js` here is the whole file as it was just before, at commit
`b65a520e34f5cca5df8520e6f6aa486297bd91ef`. The banner lives in `initResults()`: `exampleBanner()` (the
"Own the Exclusive Sponsor Banner" sample on unsold keywords), `listCta()`
(the "Get Listed For <keyword>" button) and the `featured` block (a paid
sponsor's card).

## What was hidden

- Every banner on the results page: the sample and a paid sponsor's card.
- The "Get Listed For <keyword>" button under the list.

Nothing in the database changed. A paid sponsor keeps `banner = true` on
its listing, keeps its row in the list, and admin still shows and edits
banners.

## To bring it back

In the live `app.js`, set `const SPONSOR_BANNERS = true;` (near the top of
`initResults()`), update the banner assertions in `tools/check.js` and
`tools/search-check.js`, run `node tools/stamp.js` and
`node tools/check.js`, publish.
