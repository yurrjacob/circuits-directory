-- College clubs, student profiles and projects, 2026-09-29. Applied to the
-- project; kept here as the record.
--
-- The model (Jacob's "Circuits Industry Hiring Process" brief):
--   * A club is a page. It lives on the companies row every account already
--     has, flagged kind = 'club', with the college's name and logo beside the
--     club's own (dual branding) and three promo texts for new members, alumni
--     and employers. Its officers are the row's team list, each entry tagged
--     with a Circuits.com handle.
--   * A project belongs to a club page: title, year, summary, a cover, more
--     pictures, build documents, and a team list of handles with roles.
--   * A badge is never self-awarded. A Leadership badge on a student's page is
--     derived from being an officer on a club page; a Project badge from being
--     on a project's team. The club account decides both. The student can hide
--     the lot with one switch (profiles.show_clubs).
--   * Skills are the student's own words, a short list on the profile.

-- ---- pages: club flag, dual branding, promo texts --------------------------
alter table public.companies add column if not exists kind text not null default 'company';
alter table public.companies drop constraint if exists companies_kind_check;
alter table public.companies add constraint companies_kind_check check (kind in ('company','club'));
alter table public.companies add column if not exists college_name text;
alter table public.companies add column if not exists college_logo text;
alter table public.companies add column if not exists club_promo jsonb;
alter table public.companies drop constraint if exists companies_club_len_ck;
alter table public.companies add constraint companies_club_len_ck check (
  length(coalesce(college_name, '')) <= 160 and length(coalesce(college_logo, '')) <= 500
  and length(coalesce(club_promo::text, '')) <= 4000);
-- companies carries a table-level SELECT for anon and UPDATE for owners, so
-- the new columns need no grant of their own.

-- ---- people: skills and the privacy switch ---------------------------------
alter table public.profiles add column if not exists skills text[] not null default '{}';
alter table public.profiles add column if not exists show_clubs boolean not null default true;
alter table public.profiles drop constraint if exists profiles_skills_ck;
alter table public.profiles add constraint profiles_skills_ck check (
  cardinality(skills) <= 20 and coalesce(length(array_to_string(skills, ',')), 0) <= 1200);
-- profiles is read column by column: both columns are public, both are the
-- owner's to change (see rls-check.sql, PROFILE_PUBLIC_COLS).
grant select (skills, show_clubs) on public.profiles to anon, authenticated;
grant update (skills, show_clubs) on public.profiles to authenticated;

-- my_profile() hands the dashboard the same two columns.
drop function if exists public.my_profile();
create function public.my_profile()
 returns table(handle text, display_name text, email text, title text, years smallint, bio text, phone text, resume_path text,
               talent_listed boolean, talent_hidden boolean, keywords text[], account_type text, credentials jsonb, talent_status text,
               keyword_rows jsonb, photo_url text, location text, contact_email text, skills text[], show_clubs boolean)
 language sql stable security definer
 set search_path to 'public'
as $function$
  select p.handle, p.display_name, p.email, p.title, p.years, p.bio, p.phone, p.resume_path,
         p.talent_listed, p.talent_hidden,
         coalesce((select array_agg(k.keyword order by k.keyword) from talent_keywords k where k.user_id = p.user_id and k.enabled), '{}'),
         p.account_type, p.credentials, p.talent_status,
         coalesce((select jsonb_agg(jsonb_build_object('keyword', k.keyword, 'enabled', k.enabled) order by k.keyword) from talent_keywords k where k.user_id = p.user_id), '[]'),
         p.photo_url, p.location, p.contact_email, p.skills, p.show_clubs
    from profiles p where p.user_id = auth.uid()
$function$;
revoke execute on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

-- ---- projects --------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_slug text not null references public.companies(slug) on delete cascade,
  title text not null,
  year text,
  summary text,
  cover_url text,
  pics jsonb not null default '[]'::jsonb,
  docs jsonb not null default '[]'::jsonb,
  team jsonb not null default '[]'::jsonb,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_len_ck check (
    length(title) between 1 and 120 and length(coalesce(year, '')) <= 20
    and length(coalesce(summary, '')) <= 2000 and length(coalesce(cover_url, '')) <= 500
    and length(pics::text) <= 20000 and length(docs::text) <= 20000 and length(team::text) <= 10000)
);
create index if not exists projects_company_idx on public.projects (company_slug, created_at desc);
create index if not exists projects_team_gin on public.projects using gin (team jsonb_path_ops);

alter table public.projects enable row level security;
drop policy if exists projects_read on public.projects;
create policy projects_read on public.projects for select
  using ((published and not company_suspended(company_slug)) or owns_company(company_slug) or is_staff());
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (owns_company(company_slug) or is_staff());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using (owns_company(company_slug) or is_staff()) with check (owns_company(company_slug) or is_staff());
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated
  using (owns_company(company_slug) or is_staff());
revoke all on public.projects from public, anon, authenticated;
grant select on public.projects to anon, authenticated;
grant insert, update, delete on public.projects to authenticated;

-- updated_at moves with every edit
create or replace function public.projects_touch() returns trigger
language plpgsql set search_path to 'public' as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists projects_touch_trg on public.projects;
create trigger projects_touch_trg before update on public.projects
  for each row execute function public.projects_touch();

-- ---- the resume page and the club words are pages, not handles ------------
insert into public.reserved_handles (name) values ('resume'), ('resumes'), ('club'), ('clubs'), ('project'), ('projects')
  on conflict do nothing;

-- 2026-10-01, Jacob's sketch of the club page: a project card also carries
-- videos (links, embedded when they are YouTube or Vimeo) and other
-- documents beside the build documents; the page has a Join Club button.
alter table public.projects add column if not exists videos jsonb not null default '[]'::jsonb;
alter table public.projects add column if not exists other_docs jsonb not null default '[]'::jsonb;
alter table public.projects drop constraint if exists projects_media_len_ck;
alter table public.projects add constraint projects_media_len_ck check (length(videos::text) <= 4000 and length(other_docs::text) <= 20000);
alter table public.companies add column if not exists club_join_url text;
alter table public.companies drop constraint if exists companies_join_len_ck;
alter table public.companies add constraint companies_join_len_ck check (length(coalesce(club_join_url, '')) <= 500);
