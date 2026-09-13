-- Recruiting is free (Jacob, 2026-09-13). Applied to circuits-com as
-- recruiting_free_boards on 2026-09-13.
--
-- 1. talent_contact(): any signed-in account may view a listed person's
--    resume and contact details. The Talent Access subscription
--    (companies.talent_access_until, has_talent_access()) is no longer the
--    gate; the column and function stay, unused.
-- 2. The Recruit Board is a table with a Location column and the Job Board a
--    table with a Years Experience column, so profiles get `location` and
--    jobs get `years_experience`. Owners edit both from the dashboard.
-- 3. talent_search(), job_search() and my_profile() return the new columns;
--    job_search() also returns the post's documents for the details panel.

alter table public.profiles add column if not exists location text;
grant update (location) on public.profiles to authenticated;
alter table public.jobs add column if not exists years_experience smallint
  check (years_experience is null or (years_experience >= 0 and years_experience <= 60));

create or replace function public.talent_contact(p_user uuid)
 returns table(handle text, display_name text, email text, phone text, resume_path text, photo_url text)
 language sql stable security definer
 set search_path to 'public'
as $function$
  select p.handle, p.display_name, p.email, p.phone, p.resume_path, p.photo_url
    from profiles p
   where p.user_id = p_user and p.talent_listed and p.talent_status = 'Approved' and p.suspended_at is null
     and (auth.uid() is not null or has_talent_access())
$function$;

drop function if exists public.talent_search(text);
create function public.talent_search(p_keyword text)
 returns table(user_id uuid, title text, years smallint, bio text, keywords text[], credentials jsonb, location text)
 language sql stable security definer
 set search_path to 'public'
as $function$
  select p.user_id, p.title, p.years, p.bio,
         coalesce((select array_agg(k.keyword order by k.keyword) from talent_keywords k where k.user_id = p.user_id and k.enabled), '{}'),
         p.credentials, p.location
    from profiles p
   where p.talent_listed and p.talent_status = 'Approved' and p.suspended_at is null
     and (norm_kw(p_keyword) = '' or exists (
           select 1 from talent_keywords k where k.user_id = p.user_id and k.enabled and k.keyword_norm = norm_kw(p_keyword)))
   order by p.updated_at desc nulls last
   limit 200
$function$;
grant execute on function public.talent_search(text) to anon, authenticated;

drop function if exists public.job_search(text);
create function public.job_search(p_keyword text)
 returns table(id uuid, title text, location text, description text, created_at timestamp with time zone, paid_until timestamp with time zone,
               company_slug text, company_name text, company_handle text, company_logo text, keywords text[], years_experience smallint, docs jsonb)
 language sql stable security definer
 set search_path to 'public'
as $function$
  select j.id, j.title, j.location, j.description, j.created_at, j.paid_until,
         j.company_slug, c.name, c.handle, c.logo,
         coalesce((select array_agg(k.keyword order by k.keyword) from job_keywords k where k.job_id = j.id), '{}'),
         j.years_experience, coalesce(j.docs, '[]'::jsonb)
    from jobs j join companies c on c.slug = j.company_slug
   where j.paid_until > now() and j.closed_at is null and c.suspended_at is null
     and (norm_kw(p_keyword) = '' or exists (
           select 1 from job_keywords k where k.job_id = j.id and k.keyword_norm = norm_kw(p_keyword)))
   order by j.paid_until desc
   limit 200
$function$;
grant execute on function public.job_search(text) to anon, authenticated;

drop function if exists public.my_profile();
create function public.my_profile()
 returns table(handle text, display_name text, email text, title text, years smallint, bio text, phone text, resume_path text,
               talent_listed boolean, talent_hidden boolean, keywords text[], account_type text, credentials jsonb, talent_status text,
               keyword_rows jsonb, photo_url text, location text)
 language sql stable security definer
 set search_path to 'public'
as $function$
  select p.handle, p.display_name, p.email, p.title, p.years, p.bio, p.phone, p.resume_path,
         p.talent_listed, p.talent_hidden,
         coalesce((select array_agg(k.keyword order by k.keyword) from talent_keywords k where k.user_id = p.user_id and k.enabled), '{}'),
         p.account_type, p.credentials, p.talent_status,
         coalesce((select jsonb_agg(jsonb_build_object('keyword', k.keyword, 'enabled', k.enabled) order by k.keyword) from talent_keywords k where k.user_id = p.user_id), '[]'),
         p.photo_url, p.location
    from profiles p where p.user_id = auth.uid()
$function$;
grant execute on function public.my_profile() to authenticated;
