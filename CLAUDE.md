# Circuits.com, house rules

Plain HTML, CSS and JavaScript on GitHub Pages, deployed from `main`. Supabase
holds the data; the browser talks to it with the public key and row-level
security decides everything. There is no build step.

- Run `node tools/check.js` before every push. It is the whole test suite.
- Run `node tools/stamp.js` after changing any stylesheet or script. Every
  page links assets with `?v=<hash>` and the checks refuse a stale stamp.
- Never `select('*')` for anonymous reads: anon has column grants, and one
  ungranted column fails the whole query. Use the column lists in store.js.
- A new column on `profiles` needs a SELECT grant for anon (see
  tools/rls-check.sql) or every person page goes blank.
- Every onclick name in admin.js must be exported to `window` at the bottom
  of the file; the checks fail otherwise.
- No em dashes anywhere a reader sees, and none in the code either.
- Database changes: apply to the project, then record the SQL under tools/
  (audit-hardening.sql, recruiting-free.sql, bot-signup-guard.sql,
  grouped-listing-notifications.sql, profile-sync.sql). Edge functions live at
  tools/edge-auth.ts and tools/edge-notify.ts; deploy after editing.
- The Ideas panel, notifications and every email derive their recipient from
  a database row, never from the request.
- backups/ is frozen history; do not edit or delete it without asking.
