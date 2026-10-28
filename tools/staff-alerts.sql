-- Staff alerts, 2026-10-12. Applied to the project; kept here as the record.
--
-- Jacob: "Need Email Sent to both our circuits.com email addresses that a New
-- Profile has been created and confirmed." notify_staff() writes an inbox
-- notice for every address in the staff table; the notifications insert
-- trigger has the notify edge function email each one to its owner, so the
-- recipients come from the staff table, never from a request.
-- (The new club alert lives in clubs.sql.)
create or replace function public.notify_profile_confirmed()
returns trigger language plpgsql security definer set search_path to 'public', 'auth' as $fn$
declare p profiles%rowtype;
begin
  if old.email_confirmed_at is not null or new.email_confirmed_at is null then return new; end if;
  select * into p from profiles where user_id = new.id;
  perform notify_staff('New profile confirmed: ' || coalesce(nullif(p.display_name, ''), p.handle, new.email),
    coalesce(nullif(p.display_name, ''), 'Someone') || ' created a profile' ||
    coalesce(' at circuits.com/' || p.handle, '') || ' and confirmed the email address ' || new.email || '.',
    coalesce('/' || p.handle, '/portal#admin'));
  return new;
end $fn$;
create trigger on_email_confirmed_trg after update of email_confirmed_at on auth.users
  for each row execute function notify_profile_confirmed();

-- 2026-10-28, All Profiles (Jacob: "When new individual profile URL has been
-- created it should populate into the All Profiles tab ... Currently we do
-- not know when a Profile URL is created"). All Profiles listed company pages
-- only, so 23 people with a profile and no page never appeared. Staff only.
create or replace function public.admin_profiles()
returns table(handle text, display_name text, email text, created_at timestamptz, confirmed boolean,
              company_slug text, company_name text, company_kind text, suspended_at timestamptz, source text)
language plpgsql stable security definer set search_path to 'public', 'auth' as $fn$
begin
  if not is_staff() then raise exception 'staff only' using errcode = 'insufficient_privilege'; end if;
  return query
    select p.handle, p.display_name, coalesce(p.email, u.email::text), p.created_at, (u.email_confirmed_at is not null),
           c.slug, c.name, c.kind, coalesce(c.suspended_at, p.suspended_at), 'profile'::text
      from profiles p
      left join auth.users u on u.id = p.user_id
      left join lateral (select c2.slug, c2.name, c2.kind, c2.suspended_at from company_users cu join companies c2 on c2.slug = cu.company_slug
                          where cu.user_id = p.user_id and c2.kind <> 'club' order by cu.created_at limit 1) c on true
    union all
    select c.handle, c.name, c.email, c.created_at, null::boolean, c.slug, c.name, c.kind, c.suspended_at, 'page'::text
      from companies c
     where c.kind <> 'club'
       and not exists (select 1 from company_users cu join profiles p on p.user_id = cu.user_id where cu.company_slug = c.slug)
    order by 4 desc;
end $fn$;
revoke execute on function public.admin_profiles() from public, anon;
grant execute on function public.admin_profiles() to authenticated;
