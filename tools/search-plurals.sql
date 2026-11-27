-- Singular and plural search, and the all-words keyword search (2026-11-27).
-- From the 2026-11-23 change list: "Plurals and singular keyword searches
-- should bring up the same results", and keyword searches follow the Global
-- Directory rule (every typed word matches a company name or keyword)
-- instead of an exact keyword match.
--
-- Applied to the project as the migration search_plurals_all_words.
-- Dry run before applying: of 296 listing and 23 talent keywords only three
-- keys changed (defense -> defen twice, fuse -> fus), no two keywords merged,
-- and no unique index (banner per keyword, locked position, one keyword per
-- person or job) was broken.

-- 1. norm_kw: the old rules, plus
--    - a capitalised acronym plural drops its s: ICs -> ic, LEDs -> led
--    - a singular ending in ie, che or se meets its plural:
--      movie/movies, cache/caches, lens/lenses, bus/buses, process/processes,
--      status/statuses, gas/gases, bias/biases
--    store.js normKw() is the JavaScript twin and must give the same answer;
--    tools/check.js holds both to the same table of words.
create or replace function public.norm_kw(s text)
 returns text
 language sql
 immutable
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(acro, case when length(v) > 3 and right(v,1) = 's' and right(v,2) <> 'ss' and right(u,2) = 'se'
                             then left(v, length(v)-1) else v end)
  from (
    select acro, u, case
        when length(u) > 4 and right(u,2) = 'ie' then left(u, length(u)-2) || 'y'
        when length(u) > 3 and right(u,3) = 'che' then left(u, length(u)-1)
        when length(u) > 3 and right(u,2) = 'se' then left(u, length(u)-1)
        else u end as v
    from (
      select acro, case
          when length(t) > 4 and right(t,3) = 'ies' then left(t, length(t)-3) || 'y'
          when length(t) > 3 and (right(t,3) in ('xes','zes') or right(t,4) in ('ches','shes')) then left(t, length(t)-2)
          when length(t) > 3 and right(t,1) = 's' and right(t,2) <> 'ss' then left(t, length(t)-1)
          else t end as u
      from (
        select case when last ~ '^[A-Z0-9]*[A-Z][A-Z0-9]*s$' and length(last) >= 3 then left(t, length(t)-1) end as acro, t
        from (select lower(pg_catalog.regexp_replace(coalesce(s,''), '[^a-zA-Z0-9]', '', 'g')) as t,
                     coalesce((pg_catalog.regexp_match(coalesce(s,''), '([A-Za-z0-9]+)[^A-Za-z0-9]*$'))[1], '') as last) a
      ) b
    ) c
  ) d
$function$;

-- 2. Recompute the stored keys. SET EXPRESSION (Postgres 17) rewrites the
--    generated column in place, so none of the row triggers on applications
--    (notifications, audit, company sync) fire.
alter table public.applications alter column keyword_norm set expression as (norm_kw(keyword));
alter table public.talent_keywords alter column keyword_norm set expression as (norm_kw(keyword));
alter table public.job_keywords alter column keyword_norm set expression as (norm_kw(keyword));

-- the search log groups by q_norm, so old rows follow the new rule too
update public.searches set q_norm = left(norm_kw(q), 120) where q_norm is distinct from left(norm_kw(q), 120);

-- 3. The all-words search behind the main search bar. Every word typed must
--    start a word of the listing's company name or keyword, singular and
--    plural alike, the Global Directory rule. Returns ids only, so the
--    browser still reads the rows through anon's column grants (store.js
--    APP_PUBLIC_COLS). exact = the listing is under the searched keyword
--    itself; those come first on the page. Security invoker: row-level
--    security decides, as for any other read.
create or replace function public.search_listing_ids(p_q text)
 returns table(id uuid, exact boolean)
 language sql
 stable
 security invoker
 set search_path to 'public', 'pg_temp'
as $function$
  with q as (
    select array_agg(distinct norm_kw(w)) filter (where norm_kw(w) <> '') as ws
    from regexp_split_to_table(left(coalesce(p_q, ''), 200), '[^A-Za-z0-9]+') w
  )
  select a.id, a.keyword_norm = norm_kw(p_q)
  from public.applications a, q
  where a.status = 'Approved' and not a.paused and not a.is_club
    and coalesce(array_length(q.ws, 1), 0) between 1 and 8
    and not exists (
      select 1 from unnest(q.ws) w
      where not exists (
        select 1 from regexp_split_to_table(coalesce(a.company, '') || ' ' || coalesce(a.keyword, ''), '[^A-Za-z0-9]+') h
        where h <> '' and norm_kw(h) like w || '%'))
  limit 500
$function$;
revoke all on function public.search_listing_ids(text) from public;
grant execute on function public.search_listing_ids(text) to anon, authenticated;
