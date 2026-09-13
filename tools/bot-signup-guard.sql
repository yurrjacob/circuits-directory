-- Bot sign-ups (Jacob, 2026-09-14). Applied to circuits-com as
-- guard_bot_signup and guard_bot_signup_v2.
--
-- From 2026-09-05 to 2026-09-13 a script filled the register form 136 times:
-- a username of 14-26 random lowercase letters, a display name of 14-26
-- random mixed-case letters, a harvested real email address. Each one made
-- Supabase send a stranger a confirmation email from Circuits.com (thirteen
-- clicked it, which confirmed the account and the portal then created a
-- company with the random name). 136 of 148 accounts on the site were fake.
--
-- This refuses that fingerprint BEFORE the auth row exists, so no email goes
-- out. Real names have a space, or match the username (ParallelCascade /
-- parallelcascade), or carry fewer than four capitals; and no real username
-- on the site has a run of five consonants.
create or replace function public.guard_bot_signup()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare h text; n text;
begin
  h := lower(trim(coalesce(new.raw_user_meta_data ->> 'handle', '')));
  n := trim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  if h ~ '^[a-z]{14,26}$'
     and n ~ '^[A-Za-z]{14,26}$'
     and lower(n) <> h
     and (length(regexp_replace(n, '[^A-Z]', '', 'g')) >= 4 or h ~ '[b-df-hj-np-tv-z]{5}') then
    raise exception 'Sign-up refused' using errcode = 'check_violation';
  end if;
  return new;
end $function$;

drop trigger if exists guard_bot_signup_trg on auth.users;
create trigger guard_bot_signup_trg
  before insert on auth.users
  for each row execute function public.guard_bot_signup();

-- The cleanup that ran the same day (136 accounts, 13 junk companies):
-- deleting auth.users cascades to profiles, notifications and company_users.
-- Kept for the record; the fingerprint above is what it selected on, plus
-- "never listed, never applied", so no real account could match.
--
-- with bot as (
--   select p.user_id from profiles p join auth.users u on u.id = p.user_id
--    where p.handle ~ '^[a-z]{14,26}$' and coalesce(p.display_name,'') ~ '^[A-Za-z]{14,26}$'
--      and lower(p.display_name) <> p.handle and p.title is null
--      and not exists (select 1 from talent_keywords k where k.user_id = p.user_id)
--      and not exists (select 1 from applications a where lower(a.email) = lower(u.email))),
-- delc as (delete from companies c where c.published = false
--            and c.slug in (select cu.company_slug from company_users cu join bot b on b.user_id = cu.user_id)
--            and not exists (select 1 from applications a where a.company_slug = c.slug)
--            and not exists (select 1 from jobs j where j.company_slug = c.slug) returning slug),
-- delu as (delete from auth.users u where u.id in (select user_id from bot) returning id)
-- select (select count(*) from delc), (select count(*) from delu);
