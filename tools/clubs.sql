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

-- 2026-10-05, the model corrected (Jacob): a club is NOT the student's own
-- page switched into club mode. The president keeps circuits.com/<their
-- handle> for the job market; the club is a SECOND page the account owns,
-- with its own address, made here. Officers (team) earn Leadership badges,
-- members (members) earn Member badges, project teams earn Project badges.
alter table public.companies add column if not exists members jsonb not null default '[]'::jsonb;
alter table public.companies drop constraint if exists companies_members_len_ck;
alter table public.companies add constraint companies_members_len_ck check (length(members::text) <= 40000);

create or replace function public.create_club_page(p_handle text, p_name text, p_college text default null)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare h text; n text; p profiles%rowtype; s text; k int := 0;
begin
  select * into p from profiles where user_id = auth.uid();
  if p.user_id is null then raise exception 'sign in first' using errcode = 'no_data_found'; end if;
  h := lower(trim(coalesce(p_handle, '')));
  n := trim(coalesce(p_name, ''));
  if n = '' or length(n) > 200 then raise exception 'club_name' using errcode = 'check_violation'; end if;
  if not handle_ok(h) then raise exception 'handle_format' using errcode = 'check_violation'; end if;
  if exists (select 1 from companies c where c.handle = h) or exists (select 1 from profiles q where q.handle = h) then
    raise exception 'handle_taken' using errcode = 'unique_violation';
  end if;
  if (select count(*) from company_users cu join companies c on c.slug = cu.company_slug where cu.user_id = p.user_id and c.kind = 'club') >= 5 then
    raise exception 'club_limit' using errcode = 'check_violation';
  end if;
  s := h;
  while exists (select 1 from companies c where c.slug = s) loop k := k + 1; s := h || '-' || k; end loop;
  insert into companies (slug, name, handle, kind, college_name, email, published)
  values (s, n, h, 'club', nullif(trim(coalesce(p_college, '')), ''), p.email, true);
  insert into company_users (user_id, company_slug, role) values (p.user_id, s, 'owner');
  return s;
end $$;
revoke execute on function public.create_club_page(text, text, text) from public, anon;
grant execute on function public.create_club_page(text, text, text) to authenticated;

-- 2026-10-05, invite links (Jacob): a president sends club members a link;
-- signing up through it adds them to the club automatically. One token per
-- club and role (member or officer), made and reset by the owner, read by
-- anyone holding it (club_invite_info), accepted by the signed-in account
-- it belongs to (accept_club_invite appends their handle to members or team).
-- The table has no direct grants: everything goes through these functions.
create table if not exists public.club_invites (
  token text primary key,
  company_slug text not null references public.companies(slug) on delete cascade,
  role text not null default 'member' check (role in ('member','officer')),
  created_by uuid not null,
  created_at timestamptz not null default now(),
  uses int not null default 0,
  revoked_at timestamptz
);
create index if not exists club_invites_slug_idx on public.club_invites (company_slug, role);
alter table public.club_invites enable row level security;
revoke all on public.club_invites from public, anon, authenticated;
-- club_invite_link(p_slug, p_role) -> token         (owner; creates on first call)
-- revoke_club_invite(p_slug, p_role)                (owner; the next link call makes a fresh token)
-- club_invite_info(p_token) -> name, handle, college_name, logo, role   (anon, for the register page)
-- accept_club_invite(p_token) -> club handle        (authenticated; idempotent per person)
-- Full bodies as applied: see the project; they mirror the description above.

-- 2026-10-12, club approval (Jacob: "Add Manage Clubs tab in the Admin so we
-- can approve and manage club accounts"). Applied to the project; kept here as
-- the record. A club page goes live at its address at once, but only an
-- Approved club appears on the Global Club List and in Search Clubs.
alter table public.companies add column if not exists club_status text not null default 'Approved';
alter table public.companies add constraint companies_club_status_ck check (club_status in ('Pending','Approved','Denied'));
-- the three clubs made on 2026-10-11 went into the queue; Jacob's own stayed Approved
-- update companies set club_status = 'Pending' where kind = 'club' and slug <> 'jacob';

-- owners cannot approve themselves or turn a page into a club: the existing
-- guard (companies_talent_guard, BEFORE UPDATE) now also keeps club_status and kind
create or replace function public.guard_talent_staff_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if is_staff() then return new; end if;
  if tg_table_name = 'profiles' then new.talent_hidden := old.talent_hidden; new.talent_status := old.talent_status; end if;
  if tg_table_name = 'companies' then
    new.talent_access_until := old.talent_access_until;
    new.club_status := old.club_status;
    new.kind := old.kind;
  end if;
  if tg_table_name = 'jobs' then new.paid_until := old.paid_until; end if;
  return new;
end $fn$;

-- every club page a non-staff account creates starts Pending
create or replace function public.guard_company_insert()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if not is_staff() and new.kind = 'club' then new.club_status := 'Pending'; end if;
  return new;
end $fn$;
create trigger companies_insert_guard before insert on public.companies for each row execute function guard_company_insert();

-- a new club page tells staff: inbox notice, which the notify function also
-- emails to every staff address (both circuits.com inboxes included)
create or replace function public.notify_new_club()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare who text;
begin
  if new.kind <> 'club' then return new; end if;
  select coalesce(nullif(p.display_name, ''), p.handle) into who from profiles p where p.user_id = auth.uid();
  perform notify_staff('New club page: ' || new.name,
    new.name || coalesce(' at ' || nullif(new.college_name, ''), '') || ' was created' || coalesce(' by ' || who, '') ||
    ' at circuits.com/' || coalesce(new.handle, new.slug) || '. Approve it under Admin, Manage Clubs to put it on the Global Club List.',
    '/portal#admin');
  return new;
end $fn$;
create trigger companies_new_club_trg after insert on public.companies for each row execute function notify_new_club();

-- the staff decision tells the club's owner
create or replace function public.notify_club_decision()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare u uuid;
begin
  if new.kind <> 'club' or new.club_status is not distinct from old.club_status or not is_staff() then return new; end if;
  for u in select cu.user_id from company_users cu where cu.company_slug = new.slug loop
    perform notify_user(u,
      case new.club_status when 'Approved' then new.name || ' is on the Global Club List' when 'Denied' then new.name || ' was not approved' else new.name || ' is under review again' end,
      case new.club_status when 'Approved' then 'Circuits.com approved your club page. Students searching clubs can now find it on the Global Club List.'
           when 'Denied' then 'Circuits.com did not approve your club page for the Global Club List. Reply through the Contact page if you think this is a mistake.'
           else 'Circuits.com is looking at your club page again. You get a message here when that is done.' end,
      '/' || coalesce(new.handle, new.slug));
  end loop;
  return new;
end $fn$;
create trigger companies_club_decision_trg after update of club_status on public.companies for each row execute function notify_club_decision();

-- 2026-10-12, Student Club (Jacob's list). Applied to the project.
-- 1. The page picker: the person's own page first, labelled with its contact
--    name, then the clubs. my_companies() keeps its old shape for older code.
create or replace function public.my_pages()
returns table(slug text, name text, kind text, contact text, handle text)
language sql stable security definer set search_path to 'public' as $fn$
  select c.slug, c.name, c.kind, c.contact, c.handle from companies c
   where owns_company(c.slug)
   order by (c.kind = 'club'), c.name
$fn$;
revoke execute on function public.my_pages() from public, anon;
grant execute on function public.my_pages() to authenticated;

-- 2. create_club_page: the college is required, and the club starts with the
--    owner's own name as its Contact Person. Without one every Save club was
--    refused ("a contact person is needed") by a field on a tab the club owner
--    never sees, which is why nothing below the required fields ever saved.
--    (Body as above, plus:)
--      if nullif(trim(coalesce(p_college, '')), '') is null then raise exception 'club_college' ...
--      insert ... contact = coalesce(nullif(p.display_name, ''), p.handle)
-- Backfill, the one club without a contact (mike-s-club):
--   update companies c set contact = coalesce(nullif(p.display_name, ''), p.handle)
--     from company_users cu join profiles p on p.user_id = cu.user_id
--    where cu.company_slug = c.slug and c.kind = 'club' and nullif(trim(coalesce(c.contact, '')), '') is null;

-- 3. One owner per club: only the account that created it can edit it.
create or replace function public.guard_club_single_owner()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if exists (select 1 from companies c where c.slug = new.company_slug and c.kind = 'club')
     and exists (select 1 from company_users cu where cu.company_slug = new.company_slug and cu.user_id <> new.user_id) then
    raise exception 'club_single_owner' using errcode = 'check_violation',
      hint = 'A club page has one owner. Officers are added by the owner on the Club Details tab.';
  end if;
  return new;
end $fn$;
create trigger company_users_club_owner before insert on public.company_users for each row execute function guard_club_single_owner();

-- 4. Officers are approved by the owner alone: no more officer invite links.
--    club_invite_link() raises officers_by_owner for role 'officer' and only
--    makes member links; the four live officer links were revoked:
--   update club_invites set revoked_at = now() where role = 'officer' and revoked_at is null;

-- 2026-10-28, club keywords are their own dataset (Jacob: "Club approved
-- keywords ... are incorrectly populating in the regular Main Directory").
-- Applied to the project. The Get Listed form picked the account's first page
-- by name, so a club owner's keywords were filed under their own page; the
-- form now files /join?club=<slug> under the club, and every Directory query
-- (results, related keywords, keyword index, the full list) adds
-- is_club = false, while Search Clubs reads is_club = true.
alter table public.applications add column if not exists is_club boolean not null default false;
grant select (is_club) on public.applications to anon;
grant select (is_club) on public.applications to authenticated;
create or replace function public.applications_set_is_club()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  new.is_club := coalesce((select c.kind = 'club' from companies c where c.slug = new.company_slug), false);
  return new;
end $fn$;
create trigger applications_is_club_trg before insert or update of company_slug on public.applications
  for each row execute function applications_set_is_club();
create or replace function public.companies_sync_is_club()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if new.kind is distinct from old.kind then
    update applications set is_club = (new.kind = 'club') where company_slug = new.slug;
  end if;
  return new;
end $fn$;
create trigger companies_is_club_trg after update of kind on public.companies
  for each row execute function companies_sync_is_club();
-- backfill (no club rows existed yet):
-- update applications a set is_club = true from companies c where c.slug = a.company_slug and c.kind = 'club';

-- notify_applications_batch(): a club's request is announced to staff as
-- "New club keyword request: <club> / <keywords>", linked to Admin, Club
-- Admin, Club Keywords. That subject is not one the notify function skips, so
-- the inbox notice is also emailed to every staff address. Directory requests
-- keep "New listing request:" unchanged. (Full body as applied: see the project.)

-- The Global Directory List (2026-10-28) lives at /global, so the name is
-- reserved like every other root page.
insert into public.reserved_handles (name) values ('global') on conflict do nothing;

-- ---- Project Parts and uploaded project videos (Jacob, 2026-10-28) ---------
-- Up to 10 parts per project: [{name, does, qty, datasheet:{name,url}}].
-- projects has table-level grants, so anon reads the new column as is.
alter table public.projects add column if not exists parts jsonb not null default '[]'::jsonb;
alter table public.projects add constraint projects_parts_max10
  check (jsonb_typeof(parts) = 'array' and jsonb_array_length(parts) <= 10);

-- Videos uploaded from Add a Project: their own public bucket, 50 MB, video
-- only. Same policies as docs: anyone reads, signed-in uploads, staff delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do nothing;
create policy videos_public_read on storage.objects for select using (bucket_id = 'videos');
create policy videos_signed_in_upload on storage.objects for insert to authenticated with check (bucket_id = 'videos');
create policy videos_staff_delete on storage.objects for delete using (bucket_id = 'videos' and public.is_staff());

-- ---- Members & Officers (Jacob, 2026-10-28) --------------------------------
-- Every person on a club page (companies.team for officers, companies.members
-- for members) is {id, handle, name, role?, confirmed, status, badge}.
--   confirmed: they joined through the club's invite link and confirmed their
--              email. Only accept_club_invite sets it.
--   status:    Pending until staff approve it in Club Admin, Members &
--              Officers. Entries from before this change have none and read as
--              Approved, so no badge already shown disappears.
--   badge:     {text, color}, set by staff. Defaults: the club's name for a
--              member, the officer's title for an officer.
-- Emails are private, so they never go in companies (anyone can read it):
-- they live in club_emails, readable by the club's owner and staff only.
create table if not exists public.club_emails (
  company_slug text not null references public.companies(slug) on delete cascade on update cascade,
  person_id text not null,
  email text not null,
  primary key (company_slug, person_id)
);
alter table public.club_emails enable row level security;
create policy club_emails_owner_or_staff on public.club_emails for all to authenticated
  using (public.owns_company(company_slug) or public.is_staff())
  with check (public.owns_company(company_slug) or public.is_staff());
grant select, insert, update, delete on public.club_emails to authenticated;

create or replace function public.club_people_ids(j jsonb) returns jsonb
language sql volatile set search_path = public as $$
  select coalesce(jsonb_agg(case when jsonb_typeof(v) = 'object' and coalesce(v->>'id', '') = ''
    then v || jsonb_build_object('id', replace(gen_random_uuid()::text, '-', '')) else v end order by o), '[]'::jsonb)
  from jsonb_array_elements(coalesce(j, '[]'::jsonb)) with ordinality as x(v, o)
$$;

-- An owner edits names, addresses, emails and titles; status, badge and
-- confirmed always come from the row as it was. A new person, or one whose
-- address changed, starts Pending and unconfirmed. Staff and the invite
-- function pass through.
create or replace function public.club_people_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare lst text; arr jsonb; olds jsonb; e jsonb; o jsonb; outa jsonb;
begin
  if new.kind is distinct from 'club' then return new; end if;
  if public.is_staff() or current_setting('circuits.club_invite', true) = 'on' then
    new.team := public.club_people_ids(new.team);
    new.members := public.club_people_ids(new.members);
    return new;
  end if;
  foreach lst in array array['team', 'members'] loop
    arr := case lst when 'team' then coalesce(new.team, '[]'::jsonb) else coalesce(new.members, '[]'::jsonb) end;
    olds := case when tg_op = 'UPDATE' then (case lst when 'team' then coalesce(old.team, '[]'::jsonb) else coalesce(old.members, '[]'::jsonb) end) else '[]'::jsonb end;
    outa := '[]'::jsonb;
    for e in select value from jsonb_array_elements(arr) loop
      if jsonb_typeof(e) <> 'object' then continue; end if;
      o := null;
      if coalesce(e->>'id', '') <> '' then
        select value into o from jsonb_array_elements(olds) where value->>'id' = e->>'id' limit 1;
      end if;
      if o is null and coalesce(e->>'handle', '') <> '' then
        select value into o from jsonb_array_elements(olds) where lower(value->>'handle') = lower(e->>'handle') limit 1;
      end if;
      e := e - 'status' - 'badge' - 'confirmed';
      if o is not null and lower(coalesce(o->>'handle', '')) = lower(coalesce(e->>'handle', '')) then
        e := e || jsonb_strip_nulls(jsonb_build_object('status', o->'status', 'badge', o->'badge', 'confirmed', o->'confirmed'));
        if coalesce(e->>'id', '') = '' and coalesce(o->>'id', '') <> '' then e := e || jsonb_build_object('id', o->>'id'); end if;
      else
        e := e || jsonb_build_object('status', 'Pending', 'confirmed', false);
      end if;
      if coalesce(e->>'id', '') = '' then e := e || jsonb_build_object('id', replace(gen_random_uuid()::text, '-', '')); end if;
      outa := outa || jsonb_build_array(e);
    end loop;
    if lst = 'team' then new.team := outa; else new.members := outa; end if;
  end loop;
  return new;
end $$;
create trigger companies_club_people_trg before insert or update of team, members on public.companies
  for each row execute function public.club_people_guard();

-- every existing person gets an id now, status untouched
select set_config('circuits.club_invite', 'on', true);
update public.companies set team = team, members = members where kind = 'club';
select set_config('circuits.club_invite', 'off', true);

-- Officer invite links are back (Jacob, 2026-10-28); 2026-10-12 had made
-- officers owner-only.
create or replace function public.club_invite_link(p_slug text, p_role text default 'member')
returns text language plpgsql security definer set search_path = public as $$
declare t text;
begin
  if auth.uid() is null or not owns_company(p_slug) then raise exception 'not_yours' using errcode = 'insufficient_privilege'; end if;
  if not exists (select 1 from companies c where c.slug = p_slug and c.kind = 'club') then raise exception 'not_a_club' using errcode = 'check_violation'; end if;
  if p_role is distinct from 'officer' then p_role := 'member'; end if;
  select token into t from club_invites where company_slug = p_slug and role = p_role and revoked_at is null order by created_at desc limit 1;
  if t is null then
    t := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into club_invites (token, company_slug, role, created_by) values (t, p_slug, p_role, auth.uid());
  end if;
  return t;
end $$;

-- Joining through an invite link: the person lands on the list Confirmed and
-- Pending. If the owner already listed them (by address, or by the email the
-- owner typed) that row is confirmed instead of adding a second one. Staff
-- are told there is someone to approve.
create or replace function public.accept_club_invite(p_token text)
returns text language plpgsql security definer set search_path = public as $$
declare inv club_invites%rowtype; p profiles%rowtype; c companies%rowtype;
        k text; lst jsonb; idx int; e jsonb; pid text; em text;
begin
  select * into p from profiles where user_id = auth.uid();
  if p.user_id is null or p.handle is null then raise exception 'no_profile' using errcode = 'no_data_found'; end if;
  select * into inv from club_invites where token = p_token and revoked_at is null;
  if inv.token is null then raise exception 'bad_invite' using errcode = 'no_data_found'; end if;
  select * into c from companies where slug = inv.company_slug and kind = 'club' and suspended_at is null;
  if c.slug is null then raise exception 'bad_invite' using errcode = 'no_data_found'; end if;
  k := case when inv.role = 'officer' then 'team' else 'members' end;
  em := lower(coalesce(nullif(auth.jwt()->>'email', ''), (select email from auth.users where id = auth.uid()), ''));
  /* already an officer: a member link changes nothing */
  if k = 'members' and coalesce(c.team, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('handle', p.handle)) then
    update club_invites set uses = uses + 1 where token = inv.token;
    return c.handle;
  end if;
  lst := case k when 'team' then coalesce(c.team, '[]'::jsonb) else coalesce(c.members, '[]'::jsonb) end;
  select (x.o - 1)::int into idx from jsonb_array_elements(lst) with ordinality as x(v, o)
   where lower(coalesce(x.v->>'handle', '')) = lower(p.handle)
      or (em <> '' and exists (select 1 from club_emails ce where ce.company_slug = c.slug and ce.person_id = x.v->>'id' and lower(ce.email) = em))
   order by x.o limit 1;
  if idx is not null then
    e := lst->idx;
    e := e || jsonb_build_object('handle', p.handle, 'confirmed', true);
    if coalesce(e->>'name', '') = '' then e := e || jsonb_build_object('name', coalesce(nullif(p.display_name, ''), p.handle)); end if;
    lst := jsonb_set(lst, array[idx::text], e);
  else
    pid := replace(gen_random_uuid()::text, '-', '');
    e := jsonb_build_object('id', pid, 'handle', p.handle, 'name', coalesce(nullif(p.display_name, ''), p.handle), 'confirmed', true, 'status', 'Pending');
    if k = 'team' then e := e || jsonb_build_object('role', 'Officer'); end if;
    lst := lst || jsonb_build_array(e);
    if em <> '' then insert into club_emails (company_slug, person_id, email) values (c.slug, pid, em) on conflict do nothing; end if;
  end if;
  perform set_config('circuits.club_invite', 'on', true);
  if k = 'team' then update companies set team = lst, updated_at = now() where slug = c.slug;
  else update companies set members = lst, updated_at = now() where slug = c.slug; end if;
  perform set_config('circuits.club_invite', 'off', true);
  update club_invites set uses = uses + 1 where token = inv.token;
  if idx is null or coalesce(lst->idx->>'status', '') = 'Pending' then
    perform notify_staff('New club ' || case k when 'team' then 'officer' else 'member' end || ' to approve: ' || c.name,
      coalesce(nullif(p.display_name, ''), p.handle) || ' (circuits.com/' || p.handle || ') joined ' || c.name || ' through its '
        || case k when 'team' then 'officer' else 'member' end || ' invite link and confirmed their email.',
      '/portal#admin:clubppl');
  end if;
  return c.handle;
end $$;
