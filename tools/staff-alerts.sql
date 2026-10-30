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

-- ---- Manage Accounts (Jacob, 2026-10-30) ------------------------------------
-- Directory Admin, Manage Accounts: staff see every account, edit it, add live
-- keywords to it and change its address. Each function is staff only. The
-- sign-in email is changed by the auth edge function (tools/edge-auth.ts,
-- action admin_set_email), which checks the caller against the staff table.

create or replace function public.admin_accounts()
returns table(user_id uuid, handle text, display_name text, signin_email text, created_at timestamptz,
              confirmed boolean, last_sign_in timestamptz, company_slug text, company_name text,
              logo text, suspended_at timestamptz, kw_live int, kw_pending int, account_type text)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_staff() then raise exception 'staff only' using errcode = 'insufficient_privilege'; end if;
  return query
    select p.user_id, p.handle, p.display_name, u.email::text, p.created_at,
           (u.email_confirmed_at is not null), u.last_sign_in_at,
           c.slug, c.name, coalesce(c.logo, p.photo_url), coalesce(c.suspended_at, p.suspended_at),
           coalesce((select count(*)::int from applications a where a.company_slug = c.slug and a.status = 'Approved'), 0),
           coalesce((select count(*)::int from applications a where a.company_slug = c.slug and a.status = 'Pending'), 0),
           p.account_type
      from profiles p
      left join auth.users u on u.id = p.user_id
      left join lateral (select c2.* from company_users cu join companies c2 on c2.slug = cu.company_slug
                          where cu.user_id = p.user_id and c2.kind <> 'club' order by cu.created_at limit 1) c on true
     order by p.created_at desc;
end $$;

-- a page for an account that has only a profile, as its owner's first save
-- would make it (register_company)
create or replace function public.admin_ensure_page(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare p profiles%rowtype; s text; n int := 0;
begin
  if not is_staff() then raise exception 'staff only' using errcode = 'insufficient_privilege'; end if;
  select * into p from profiles where user_id = p_user;
  if p.user_id is null then raise exception 'no profile' using errcode = 'no_data_found'; end if;
  select cu.company_slug into s from company_users cu join companies c on c.slug = cu.company_slug
   where cu.user_id = p_user and c.kind <> 'club' order by cu.created_at limit 1;
  if s is not null then return s; end if;
  s := p.handle;
  while exists (select 1 from companies c where c.slug = s) loop n := n + 1; s := p.handle || '-' || n; end loop;
  insert into companies (slug, name, contact, email, phone, logo, published)
  values (s, coalesce(nullif(p.display_name, ''), p.handle), nullif(p.display_name, ''), p.email, p.phone, p.photo_url, false);
  insert into company_users (user_id, company_slug, role) values (p.user_id, s, 'owner');
  update companies set handle = p.handle where slug = s;
  return s;
end $$;

-- Keywords staff add go live at once. The "request received" and "new listing
-- request" notices are for requests, so they stay quiet (circuits.admin_kw);
-- the owner gets one notice, bell and email, naming what went live. A keyword
-- already waiting is approved rather than added twice.
create or replace function public.admin_add_keywords(p_user uuid, p_keywords text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare s text; c companies%rowtype; k text; kn text; added text[] := '{}'; skipped text[] := '{}'; pid uuid; lst text;
begin
  if not is_staff() then raise exception 'staff only' using errcode = 'insufficient_privilege'; end if;
  s := admin_ensure_page(p_user);
  select * into c from companies where slug = s;
  perform set_config('circuits.admin_kw', 'on', true);
  for k in select distinct on (norm_kw(trim(x))) trim(x) from unnest(coalesce(p_keywords, '{}')) x
            where length(trim(x)) between 2 and 60 limit 10 loop
    kn := norm_kw(k);
    if exists (select 1 from applications a where a.company_slug = s and a.keyword_norm = kn and a.status = 'Approved') then
      skipped := skipped || k; continue;
    end if;
    select a.id into pid from applications a where a.company_slug = s and a.keyword_norm = kn and a.status = 'Pending' limit 1;
    if pid is not null then
      update applications set status = 'Approved' where id = pid;
    else
      insert into applications (company, contact, email, phone, website, logo, keywords, keyword, status, terms, company_slug, company_handle)
      values (c.name, c.contact, c.email, c.phone, c.website, c.logo, array[k], k, 'Approved', true, s, c.handle);
    end if;
    added := added || k;
  end loop;
  perform set_config('circuits.admin_kw', 'off', true);
  if array_length(added, 1) > 0 then
    update companies set published = true where slug = s and not published;
    lst := array_to_string(added, ', ');
    perform notify_user(p_user,
      'Keywords added to your listing: ' || case when array_length(added, 1) = 1 then lst else array_length(added, 1) || ' keywords' end,
      'Circuits.com added ' || c.name || ' to the Directory under ' || lst || '. ' ||
      case when array_length(added, 1) = 1 then 'It is' else 'They are' end ||
      ' live now: buyers searching ' || case when array_length(added, 1) = 1 then 'it' else 'them' end ||
      ' find your listing. Manage your keywords under Your Listings in your dashboard.',
      '/portal#listings');
  end if;
  insert into security_log (actor, action, target, detail)
  values (auth_email(), 'admin_add_keywords', s, jsonb_build_object('added', to_jsonb(added), 'skipped', to_jsonb(skipped)));
  return jsonb_build_object('slug', s, 'added', to_jsonb(added), 'skipped', to_jsonb(skipped));
end $$;

-- a new circuits.com/address: the profile and its own page move together,
-- checked the same way a person's own change is
create or replace function public.admin_set_handle(p_user uuid, p_handle text)
returns text language plpgsql security definer set search_path = public as $$
declare h text := lower(trim(coalesce(p_handle, ''))); s text; why text; old text;
begin
  if not is_staff() then raise exception 'staff only' using errcode = 'insufficient_privilege'; end if;
  select handle into old from profiles where user_id = p_user;
  if old is null then raise exception 'no profile' using errcode = 'no_data_found'; end if;
  select cu.company_slug into s from company_users cu join companies c on c.slug = cu.company_slug
   where cu.user_id = p_user and c.kind <> 'club' order by cu.created_at limit 1;
  why := handle_taken(h, p_user, s);
  if why <> '' then raise exception 'handle_%', why using errcode = 'check_violation'; end if;
  update profiles set handle = h where user_id = p_user;
  if s is not null then update companies set handle = h where slug = s; end if;
  insert into security_log (actor, action, target, detail)
  values (auth_email(), 'admin_set_handle', h, jsonb_build_object('from', old));
  return h;
end $$;

revoke execute on function public.admin_accounts(), public.admin_ensure_page(uuid), public.admin_add_keywords(uuid, text[]), public.admin_set_handle(uuid, text) from anon;

-- notify_applications and notify_applications_batch return early while
-- circuits.admin_kw is on. Added in place, so the rest of each stays as it is:
do $do$
declare d text;
begin
  d := pg_get_functiondef('public.notify_applications'::regproc);
  if position('circuits.admin_kw' in d) = 0 then
    d := replace(d, E'begin\n  if tg_op = ''DELETE'' then',
      E'begin\n  -- staff adding live keywords (admin_add_keywords) send their own notice\n  if current_setting(''circuits.admin_kw'', true) = ''on'' then return coalesce(new, old); end if;\n  if tg_op = ''DELETE'' then');
    if position('circuits.admin_kw' in d) = 0 then raise exception 'notify_applications: anchor not found'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('public.notify_applications_batch'::regproc);
  if position('circuits.admin_kw' in d) = 0 then
    d := replace(d, E'begin\n  for r in',
      E'begin\n  -- staff adding live keywords (admin_add_keywords) is not a request\n  if current_setting(''circuits.admin_kw'', true) = ''on'' then return null; end if;\n  for r in');
    if position('circuits.admin_kw' in d) = 0 then raise exception 'notify_applications_batch: anchor not found'; end if;
    execute d;
  end if;
end $do$;
