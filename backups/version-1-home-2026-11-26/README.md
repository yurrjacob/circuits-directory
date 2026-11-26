# Version 1, home page (2026-11-26)

A copy of the home page and the files that drive it, taken just before the
home page search was cut down to Directory, Parts and Projects. Not to be
confused with `backups/mvp1-baseline-2026-08-25`, the pre-MVP1 "Version 1"
of the whole site.

**Commit:** `e1fe9dc3d95936b51e5f496d2780a730d1588750`, also tagged `version-1-2026-11-26`. Every file of
the site as it stood is recoverable from git at that tag.

## What the home page had

- Four search tabs: Directory, Hire Talent (people on /talent), Search Work
  (roles on /jobs) and Search Clubs (the Global Club List on /clubs).
- A one-line hint above the search box for each tab, for example
  "Directory: companies, products and services, listed by their
  Circuits-Keywords&trade;." (`HOME_HINT` in app.js).
- A Popular line for each tab.
- The green nav button read "Get Listed" on every page.

## What changed after it

- Hire Talent and Search Work came off the home page only. /talent and
  /jobs, their pages, data and nav links stayed as they were.
- The hint line was removed for every tab.
- Search Clubs was renamed Projects; it still searches /clubs.
- A Parts tab was added. Until parts exist it runs the Directory search.
- The nav button became "Post Free Listing"; /join itself kept its wording.

## To bring a tab back

Copy its `<button ... data-target="...">` and its `<div class="popular"
data-for="...">` line from `index.html` here into the live `index.html`,
and its `HOME_PLACEHOLDER` / `HOME_HINT` entries and the routing in
`initHome()` from `app.js` here. Then update the tab assertions in
`tools/check.js`, run `node tools/stamp.js` and `node tools/check.js`.
