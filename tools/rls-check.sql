-- Circuits.com — row level security self-check.
-- Paste into the Supabase SQL editor and run. It creates two throwaway
-- companies owned by two different confirmed users, asserts neither can touch
-- the other's data, then deletes everything it made. Silence means it passed;
-- any failure raises.

-- Clear anything a previous failed run left behind. A raise aborts the block
-- before its cleanup, and the leftovers make the next run fail for the wrong
-- reason — which cost an afternoon once already.
delete from profiles       where handle like 'zz%';
delete from profile_events where company_slug like 'zz-%';
delete from reviews      where company_slug like 'zz-%';
delete from inquiries    where company_slug like 'zz-%';
delete from company_users where company_slug like 'zz-%';
delete from applications where company_slug like 'zz-%';
delete from companies    where slug like 'zz-%';
delete from staff        where email like 'zz-%@rlstest.invalid';
delete from auth.users   where email like 'zz-%@rlstest.invalid';

do $$
declare
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  n  int;
  st text;
  rid uuid;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-owner-a@rlstest.invalid', now(), now(), now()),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'zz-owner-b@rlstest.invalid', now(), now(), now());

  -- A takes reviews, B does not. Reviews are opt-in per company.
  insert into companies (slug, name, published, reviews_enabled) values
    ('zz-rlstest-a','ZZ RLS Test A', true, true),
    ('zz-rlstest-b','ZZ RLS Test B', true, false);
  insert into applications (company, company_slug, email, keyword, status, listing_price)
  values ('ZZ RLS Test A','zz-rlstest-a','zz-owner-a@rlstest.invalid','zztesta','Approved', 49),
         ('ZZ RLS Test B','zz-rlstest-b','zz-owner-b@rlstest.invalid','zztestb','Approved', 49);
  insert into inquiries (company_slug, from_name, from_email, body)
  values ('zz-rlstest-b','Buyer','buyer@rlstest.invalid','secret quote request');
  insert into reviews (company_slug, author_name, author_email, rating, body, status)
  values ('zz-rlstest-a','Buyer','buyer@rlstest.invalid',2,'mediocre','Pending') returning id into rid;

  ---------------- act as owner A ----------------
  perform set_config('request.jwt.claims', json_build_object('sub', ua::text, 'role','authenticated','email','zz-owner-a@rlstest.invalid')::text, true);
  set local role authenticated;

  if not owns_company('zz-rlstest-a') then raise exception 'FAIL: A should own its own company'; end if;
  if owns_company('zz-rlstest-b')     then raise exception 'FAIL: A must not own company B'; end if;

  update companies set description = 'hijacked' where slug = 'zz-rlstest-b';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: A edited company B (% rows)', n; end if;

  update companies set description = 'mine' where slug = 'zz-rlstest-a';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: A could not edit its own profile'; end if;

  select count(*) into n from inquiries where company_slug = 'zz-rlstest-b';
  if n <> 0 then raise exception 'FAIL: A read % of B''s inquiries', n; end if;

  update reviews set status = 'Approved' where id = rid;
  select status into st from reviews where id = rid;
  if st <> 'Pending' then raise exception 'FAIL: company self-approved a review (status=%)', st; end if;

  update applications set status = 'Approved', listing_price = 0, banner = true where company_slug = 'zz-rlstest-a';
  select listing_price into n from applications where company_slug = 'zz-rlstest-a';
  if n <> 49 then raise exception 'FAIL: owner rewrote its own price (now %)', n; end if;

  update applications set paused = true where company_slug = 'zz-rlstest-a';
  select count(*) into n from applications where company_slug = 'zz-rlstest-a' and paused;
  if n <> 1 then raise exception 'FAIL: owner could not pause its own listing'; end if;

  ---------------- act as the anonymous public ----------------
  reset role;
  perform set_config('request.jwt.claims', null, true);
  set local role anon;

  -- The public has no read grant on these at all, so this fails at the
  -- privilege check before RLS is even consulted. Two locks, not one.
  begin
    select count(*) into n from inquiries;
    raise exception 'FAIL: anon read % inquiries', n;
  exception when insufficient_privilege then null;
  end;

  begin
    select count(*) into n from profile_events;
    raise exception 'FAIL: anon read % profile_events', n;
  exception when insufficient_privilege then null;
  end;

  -- Reviews are readable, but only the approved ones — that is RLS filtering.
  select count(*) into n from reviews where status <> 'Approved';
  if n <> 0 then raise exception 'FAIL: anon saw % unapproved reviews', n; end if;

  insert into profile_events (company_slug, kind, visitor) values ('zz-rlstest-a','view','zz');
  insert into reviews (company_slug, author_name, author_email, rating, body, status)
  values ('zz-rlstest-a','Anon','a@rlstest.invalid',5,'good','Pending');

  begin
    insert into reviews (company_slug, author_name, author_email, rating, body, status)
    values ('zz-rlstest-a','Cheat','c@rlstest.invalid',5,'self-approved','Approved');
    raise exception 'FAIL: anon inserted a pre-approved review';
  exception when insufficient_privilege then null;
  end;

  -- B has reviews switched off, so nobody can post one there.
  begin
    insert into reviews (company_slug, author_name, author_email, rating, body, status)
    values ('zz-rlstest-b','Anon','a@rlstest.invalid',5,'good','Pending');
    raise exception 'FAIL: anon reviewed a company that has reviews turned off';
  exception when insufficient_privilege then null;
  end;

  reset role;
  raise notice 'ALL RLS CHECKS PASSED';
end $$;

delete from profile_events where company_slug like 'zz-rlstest-%';
delete from reviews      where company_slug like 'zz-rlstest-%';
delete from inquiries    where company_slug like 'zz-rlstest-%';
delete from applications where company_slug like 'zz-rlstest-%';
delete from companies    where slug like 'zz-rlstest-%';
delete from auth.users   where email like 'zz-owner-%@rlstest.invalid';

-- Regression: staff are NOT suppliers.
-- owns_company() once included is_staff(), which made every Circuits.com staff
-- account the owner of every listing — the supplier portal showed all 39
-- companies and pre-filled the form with another company's contact details.
do $$
declare us uuid := gen_random_uuid(); uo uuid := gen_random_uuid(); n int;
begin
  insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, created_at, updated_at)
  values (us,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-staff@rlstest.invalid',now(),now(),now()),
         (uo,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-supplier@rlstest.invalid',now(),now(),now());
  insert into staff (email) values ('zz-staff@rlstest.invalid');
  insert into companies (slug,name,published) values ('zz-a','ZZ A',true),('zz-b','ZZ B',true);
  insert into applications (company,company_slug,email,keyword,status)
  values ('ZZ A','zz-a','zz-supplier@rlstest.invalid','zza','Approved'),
         ('ZZ B','zz-b','someone-else@rlstest.invalid','zzb','Approved');

  perform set_config('request.jwt.claims', json_build_object('sub',us::text,'role','authenticated','email','zz-staff@rlstest.invalid')::text, true);
  set local role authenticated;
  select count(*) into n from my_companies();
  if n <> 0 then raise exception 'FAIL: staff sees % companies in the portal (must be 0)', n; end if;
  if not is_staff() then raise exception 'FAIL: staff lost their admin flag'; end if;
  update companies set description='staff fix' where slug='zz-b';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: staff can no longer edit a company profile'; end if;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',uo::text,'role','authenticated','email','zz-supplier@rlstest.invalid')::text, true);
  set local role authenticated;
  select count(*) into n from my_companies();
  if n <> 1 then raise exception 'FAIL: supplier sees % companies (must be exactly 1)', n; end if;
  if owns_company('zz-b') then raise exception 'FAIL: supplier owns someone else''s company'; end if;

  -- a profile edit must reach every keyword listing row, or half the site goes stale
  update companies set contact='New Person', phone='555-0100' where slug='zz-a';
  reset role;
  select count(*) into n from applications where company_slug='zz-a' and contact='New Person' and phone='555-0100';
  if n <> 1 then raise exception 'FAIL: profile edit did not propagate to the listing'; end if;

  raise notice 'STAFF SCOPE + SYNC CHECKS PASSED';
end $$;

delete from profiles       where handle like 'zz%';
delete from profile_events where company_slug like 'zz-%';
delete from reviews      where company_slug like 'zz-%';
delete from inquiries    where company_slug like 'zz-%';
delete from company_users where company_slug like 'zz-%';
delete from applications where company_slug like 'zz-%';
delete from companies    where slug like 'zz-%';
delete from staff        where email like 'zz-%@rlstest.invalid';
delete from auth.users   where email like 'zz-%@rlstest.invalid';

-- Regression: your public contact email is not your ownership key.
-- applications.email was both the account that owns the listing and the address
-- shown on search results, and companies_sync_listings() copies the profile
-- email onto it. So editing your public email in the portal either locked you
-- out of your own company or handed it to whoever owns the address you typed.
do $$
declare uo uuid := gen_random_uuid(); ux uuid := gen_random_uuid(); n int;
begin
  insert into auth.users (id,instance_id,aud,role,email,email_confirmed_at,created_at,updated_at)
  values (uo,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-owner@rlstest.invalid',now(),now(),now()),
         (ux,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-attacker@rlstest.invalid',now(),now(),now());
  insert into companies (slug,name,published) values ('zz-own','ZZ Own',true);
  insert into applications (company,company_slug,email,keyword,status)
  values ('ZZ Own','zz-own','zz-owner@rlstest.invalid','zzown','Approved');

  perform set_config('request.jwt.claims', json_build_object('sub',uo::text,'role','authenticated','email','zz-owner@rlstest.invalid')::text, true);
  set local role authenticated;
  if not owns_company('zz-own') then raise exception 'FAIL: owner did not own their company to begin with'; end if;

  update companies set email='zz-attacker@rlstest.invalid' where slug='zz-own';

  select count(*) into n from my_companies();
  if n <> 1 then raise exception 'FAIL: owner lost their company after editing their public email (sees %)', n; end if;

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub',ux::text,'role','authenticated','email','zz-attacker@rlstest.invalid')::text, true);
  set local role authenticated;
  if owns_company('zz-own') then raise exception 'FAIL: public email change handed the company to someone else'; end if;
  select count(*) into n from my_companies();
  if n <> 0 then raise exception 'FAIL: stranger sees % companies', n; end if;

  reset role;
  select count(*) into n from applications where company_slug='zz-own' and email='zz-attacker@rlstest.invalid';
  if n <> 1 then raise exception 'FAIL: public email did not reach the listing'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub',uo::text,'role','authenticated','email','zz-owner@rlstest.invalid')::text, true);
  set local role authenticated;
  update applications set owner_email='zz-attacker@rlstest.invalid' where company_slug='zz-own';
  reset role;
  select count(*) into n from applications where company_slug='zz-own' and owner_email='zz-owner@rlstest.invalid';
  if n <> 1 then raise exception 'FAIL: supplier reassigned ownership'; end if;

  raise notice 'OWNERSHIP CHECKS PASSED';
end $$;

delete from applications where company_slug like 'zz-%';
delete from companies    where slug like 'zz-%';
delete from auth.users   where email like 'zz-%@rlstest.invalid';

-- Stored text is capped in the database, and the security log is append-only.
do $$
declare us uuid := gen_random_uuid(); n int; before_n int;
begin
  insert into auth.users (id,instance_id,aud,role,email,email_confirmed_at,created_at,updated_at)
  values (us,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-staff@rlstest.invalid',now(),now(),now());
  insert into staff (email) values ('zz-staff@rlstest.invalid');
  insert into companies (slug,name,published) values ('zz-aud','ZZ Audit',true);
  insert into applications (company,company_slug,email,keyword,status,listing_price)
  values ('ZZ Audit','zz-aud','zz-aud@rlstest.invalid','zzaud','Pending',49);

  begin
    update companies set contact = repeat('x',300) where slug='zz-aud';
    raise exception 'FAIL: accepted a 300-char contact name';
  exception when check_violation then null;
  end;

  begin
    update companies set gallery = to_jsonb(array(select repeat('u',400) from generate_series(1,80))) where slug='zz-aud';
    raise exception 'FAIL: accepted a 32KB gallery blob';
  exception when check_violation then null;
  end;

  begin
    insert into inquiries (company_slug,from_name,from_email,subject,body)
    values ('zz-aud','B','b@rlstest.invalid',repeat('x',300),'hi');
    raise exception 'FAIL: accepted a 300-char subject';
  exception when check_violation then null;
  end;

  update companies set contact='Jacob', address='12 Example Street, Springfield' where slug='zz-aud';

  -- only staff may approve and price, so the audit has to run as staff
  perform set_config('request.jwt.claims', json_build_object('sub',us::text,'role','authenticated','email','zz-staff@rlstest.invalid')::text, true);
  set local role authenticated;

  select count(*) into before_n from security_log;
  update applications set status='Approved', listing_price=99 where company_slug='zz-aud';
  select count(*) into n from security_log;
  if n <> before_n + 1 then raise exception 'FAIL: approval was not logged'; end if;

  update applications set phone='555-0199' where company_slug='zz-aud';
  select count(*) into before_n from security_log;
  if before_n <> n then raise exception 'FAIL: logged a routine edit'; end if;
  reset role;

  begin
    update security_log set actor='someone else' where id=(select max(id) from security_log);
    raise exception 'FAIL: security_log was editable';
  exception when raise_exception then
    if sqlerrm <> 'security_log is append-only' then raise; end if;
  end;

  begin
    delete from security_log where id=(select max(id) from security_log);
    raise exception 'FAIL: security_log was deletable';
  exception when raise_exception then
    if sqlerrm <> 'security_log is append-only' then raise; end if;
  end;

  begin
    truncate security_log;
    raise exception 'FAIL: security_log could be truncated away';
  exception when raise_exception then
    if sqlerrm <> 'security_log is append-only' then raise; end if;
  end;

  raise notice 'TEXT CAP + SECURITY LOG CHECKS PASSED';
end $$;

delete from profiles       where handle like 'zz%';
delete from profile_events where company_slug like 'zz-%';
delete from reviews      where company_slug like 'zz-%';
delete from inquiries    where company_slug like 'zz-%';
delete from company_users where company_slug like 'zz-%';
delete from applications where company_slug like 'zz-%';
delete from companies    where slug like 'zz-%';
delete from staff        where email like 'zz-%@rlstest.invalid';
delete from auth.users   where email like 'zz-%@rlstest.invalid';

-- Listing is not the same thing as profile.
-- A company can sit in the directory with nobody behind it; a person can hold
-- circuits.com/name with no company. circuits.com/<name> is ONE namespace, so
-- a profile and a listing must never be able to claim the same address.
do $$
declare u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); n int; why text;
begin
  insert into auth.users (id,instance_id,aud,role,email,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
  values (u1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-p1@rlstest.invalid',now(),now(),now(),
          jsonb_build_object('handle','zzprofile','display_name','ZZ Person'));
  select count(*) into n from profiles where user_id=u1 and handle='zzprofile';
  if n <> 1 then raise exception 'FAIL: signing up did not create the profile'; end if;

  begin
    insert into auth.users (id,instance_id,aud,role,email,email_confirmed_at,created_at,updated_at,raw_user_meta_data)
    values (u2,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','zz-p2@rlstest.invalid',now(),now(),now(),
            jsonb_build_object('handle','zzprofile'));
    raise exception 'FAIL: two profiles took the same address';
  exception when unique_violation then null;
  end;

  begin
    insert into companies (slug,name,handle,published) values ('zz-c1','ZZ Co','zzprofile',true);
    raise exception 'FAIL: a listing took an address a profile already holds';
  exception when unique_violation then null;
  end;

  insert into companies (slug,name,handle,published) values ('zz-c2','ZZ Co2','zzcompany',true);
  select handle_taken('zzcompany') into why;
  if why <> 'company'  then raise exception 'FAIL: company handle reported as "%"', why; end if;
  select handle_taken('register') into why;
  if why <> 'reserved' then raise exception 'FAIL: reserved handle reported as "%"', why; end if;
  select handle_taken('ab') into why;
  if why <> 'format'   then raise exception 'FAIL: too-short handle reported as "%"', why; end if;
  select handle_taken('zzprofile') into why;
  if why <> 'profile'  then raise exception 'FAIL: profile handle reported as "%"', why; end if;
  select handle_taken('zzfree') into why;
  if why <> ''         then raise exception 'FAIL: a free handle reported as "%"', why; end if;

  -- a listing with nobody behind it is a valid, normal state
  select count(*) into n from companies where slug='zz-c2';
  if n <> 1 then raise exception 'FAIL: a listing cannot exist without a profile'; end if;

  if email_for_login('zzprofile') <> 'zz-p1@rlstest.invalid' then
    raise exception 'FAIL: username sign-in did not resolve the account';
  end if;

  perform set_config('request.jwt.claims', json_build_object('sub',u1::text,'role','authenticated','email','zz-p1@rlstest.invalid')::text, true);
  set local role authenticated;

  -- holding a profile grants no control over any listing
  select count(*) into n from my_companies();
  if n <> 0 then raise exception 'FAIL: a bare profile controls % listings', n; end if;
  select count(*) into n from my_profile();
  if n <> 1 then raise exception 'FAIL: my_profile() returned % rows', n; end if;

  update profiles set handle='zzrenamed' where user_id=u1;
  begin
    update profiles set handle='zzcompany' where user_id=u1;
    raise exception 'FAIL: a profile renamed itself onto a listing address';
  exception when unique_violation then null;
  end;
  reset role;

  raise notice 'LISTING / PROFILE SEPARATION CHECKS PASSED';
end $$;

/* ---- analytics stay private ----
   company_insights() is SECURITY DEFINER, which means it runs with the rights
   of its owner and RLS does not protect it. The ownership check inside it is
   the only thing stopping one supplier reading another's numbers. */
do $$
declare u uuid; r record;
begin
  delete from profile_events where company_slug = 'zz-ins';
  delete from company_users   where company_slug = 'zz-ins';
  delete from companies       where slug = 'zz-ins';
  delete from auth.users      where email like 'zz-ins%@rlstest.invalid';

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'zz-ins-owner@rlstest.invalid','x',now(),now(),now()) returning id into u;
  insert into companies (slug, name, handle) values ('zz-ins','ZZ Ins','zzins');
  insert into company_users (user_id, company_slug) values (u, 'zz-ins');
  insert into profile_events (company_slug, kind, visitor, keyword, created_at) values
    ('zz-ins','view','v1','oscillators', now() - interval '1 day'),
    ('zz-ins','view','v1','oscillators', now() - interval '2 days'),
    ('zz-ins','view','v2','oscillators', now() - interval '3 days'),
    ('zz-ins','view','v2','buyers',      now() - interval '4 days'),
    ('zz-ins','view', null,'buyers',     now() - interval '5 days'),
    ('zz-ins','website','v1',null,       now() - interval '1 day'),
    ('zz-ins','phone','v2',null,         now() - interval '2 days'),
    ('zz-ins','rfq','v1',null,           now() - interval '1 day');
  insert into profile_events (company_slug, kind, visitor, created_at) values
    ('zz-ins','view','v9', now() - interval '40 days'),
    ('zz-ins','view','v9', now() - interval '45 days');

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u::text,
    'email','zz-ins-owner@rlstest.invalid','role','authenticated')::text, true);
  select * into r from company_insights('zz-ins', 30);
  reset role; perform set_config('request.jwt.claims', null, true);

  if r.views <> 5           then raise exception 'FAIL: views=%, expected 5', r.views; end if;
  if r.unique_visitors <> 2 then raise exception 'FAIL: unique visitors=%, expected 2', r.unique_visitors; end if;
  if r.anonymous_views <> 1 then raise exception 'FAIL: anonymous views=%, expected 1', r.anonymous_views; end if;
  if r.contacts <> 2        then raise exception 'FAIL: contacts=%, expected 2', r.contacts; end if;
  if r.quotes <> 1          then raise exception 'FAIL: quotes=%, expected 1', r.quotes; end if;
  -- the previous window must not bleed into the current one
  if r.prev_views <> 2      then raise exception 'FAIL: previous views=%, expected 2', r.prev_views; end if;
  if r.top_keyword <> 'oscillators' then raise exception 'FAIL: top keyword=%', r.top_keyword; end if;

  -- a different signed-in supplier must get nothing at all
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
          'zz-ins-other@rlstest.invalid','x',now(),now(),now()) returning id into u;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u::text,
    'email','zz-ins-other@rlstest.invalid','role','authenticated')::text, true);
  select * into r from company_insights('zz-ins', 30);
  reset role; perform set_config('request.jwt.claims', null, true);
  if coalesce(r.views, 0) <> 0 then
    raise exception 'FAIL: a stranger read another company''s analytics (views=%)', r.views;
  end if;

  if has_function_privilege('anon', 'public.company_insights(text,int)', 'execute') then
    raise exception 'FAIL: anon can call company_insights';
  end if;

  delete from profile_events where company_slug = 'zz-ins';
  delete from company_users   where company_slug = 'zz-ins';
  delete from companies       where slug = 'zz-ins';
  delete from auth.users      where email like 'zz-ins%@rlstest.invalid';
  raise notice 'ANALYTICS CHECKS PASSED';
end $$;

/* ---- suspension ----
   Suspension exists so bad actors can be handled without deleting anything.
   It is only worth having if the public really stops seeing them and they
   really cannot lift it themselves. */
do $$
declare u uuid; n int;
begin
  delete from applications  where company_slug = 'zz-susp';
  delete from company_users where company_slug = 'zz-susp';
  delete from companies     where slug = 'zz-susp';
  delete from auth.users    where email = 'zz-susp@rlstest.invalid';

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'zz-susp@rlstest.invalid', 'x', now(), now(), now())
  returning id into u;

  insert into companies (slug, name, handle, published) values ('zz-susp','ZZ Susp','zzsusp', true);
  insert into company_users (user_id, company_slug) values (u, 'zz-susp');
  insert into applications (company, keyword, status, company_slug, owner_email, email)
  values ('ZZ Susp','zzkeyword','Approved','zz-susp','zz-susp@rlstest.invalid','zz-susp@rlstest.invalid');

  set local role anon;
  select count(*) into n from companies where slug = 'zz-susp';
  if n <> 1 then raise exception 'FAIL: active company is not publicly visible'; end if;
  select count(*) into n from applications where company_slug = 'zz-susp';
  if n <> 1 then raise exception 'FAIL: active listing is not publicly visible'; end if;
  reset role;

  update companies set suspended_at = now() where slug = 'zz-susp';

  set local role anon;
  select count(*) into n from companies where slug = 'zz-susp';
  if n <> 0 then raise exception 'FAIL: suspended company is still publicly visible'; end if;
  -- the keyword search reads applications, not companies; suspension must reach it
  select count(*) into n from applications where company_slug = 'zz-susp';
  if n <> 0 then raise exception 'FAIL: suspended company keeps its ranked keyword listing'; end if;
  reset role;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', u::text,
    'email','zz-susp@rlstest.invalid','role','authenticated')::text, true);

  -- still readable by its owner, so the portal can explain rather than look broken
  select count(*) into n from companies where slug = 'zz-susp';
  if n <> 1 then raise exception 'FAIL: a suspended owner cannot see their own listing'; end if;

  begin
    update companies set name = 'Renamed while suspended' where slug = 'zz-susp';
  exception when insufficient_privilege then null;
  end;

  begin
    update companies set suspended_at = null where slug = 'zz-susp';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', null, true);

  if (select name from companies where slug = 'zz-susp') <> 'ZZ Susp' then
    raise exception 'FAIL: a suspended owner edited their listing';
  end if;
  if (select suspended_at is null from companies where slug = 'zz-susp') then
    raise exception 'FAIL: an owner lifted their own suspension';
  end if;

  delete from applications  where company_slug = 'zz-susp';
  delete from company_users where company_slug = 'zz-susp';
  delete from companies     where slug = 'zz-susp';
  delete from auth.users    where email = 'zz-susp@rlstest.invalid';

  raise notice 'SUSPENSION CHECKS PASSED';
end $$;

/* Postgres grants EXECUTE to PUBLIC on every new function, so "revoke from
   anon" is not enough — that mistake shipped once and is easy to repeat. */
do $$
begin
  if has_function_privilege('anon', 'public.set_company_suspended(text,boolean,text)', 'execute')
  or has_function_privilege('anon', 'public.set_profile_suspended(text,boolean,text)', 'execute') then
    raise exception 'FAIL: anon can reach the suspension functions';
  end if;
  -- but the read-side helper must stay reachable, or keyword search breaks for
  -- every logged-out visitor
  if not has_function_privilege('anon', 'public.company_suspended(text)', 'execute') then
    raise exception 'FAIL: anon cannot evaluate company_suspended(); keyword search would error';
  end if;
  raise notice 'SUSPENSION FUNCTION GRANTS CORRECT';
end $$;

/* ---- rate limiting on the public forms ----
   The honeypot and timing traps live in the browser and can be bypassed by
   anyone who reads the page source. This trigger is the layer that actually
   holds, so it needs a test that fails loudly if it is ever dropped. */
do $$
declare
  n int := 0; blocked boolean := false; s text; was_enabled boolean;
begin
  delete from rate_log where bucket in ('review','inquiry');

  insert into companies (slug, name, reviews_enabled) values ('zz-rl', 'ZZ Rate Ltd', true);
  select slug, reviews_enabled into s, was_enabled from companies where slug = 'zz-rl';

  -- reviews: 3 an hour
  begin
    while n < 6 loop
      insert into reviews (company_slug, author_name, author_email, rating, body)
      values (s, 'zz probe', 'zz-probe@rlstest.invalid', 5, 'probe');
      n := n + 1;
    end loop;
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: review rate limit never fired (% accepted)', n; end if;
  if n <> 3 then raise exception 'FAIL: review limit let % through, expected 3', n; end if;

  -- quote requests: 5 an hour, so the caps are genuinely per-bucket and not shared
  n := 0; blocked := false;
  begin
    while n < 8 loop
      insert into inquiries (company_slug, from_name, from_email, body)
      values (s, 'zz probe', 'zz-probe@rlstest.invalid', 'probe');
      n := n + 1;
    end loop;
  exception when check_violation then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: inquiry rate limit never fired'; end if;
  if n <> 5 then raise exception 'FAIL: inquiry limit let % through, expected 5', n; end if;

  raise notice 'RATE LIMIT CHECKS PASSED';
end $$;

-- rate_log must never be readable through the API, or the IP list leaks
do $$
declare n int;
begin
  select count(*) into n from pg_policies where tablename = 'rate_log';
  if n <> 0 then raise exception 'FAIL: rate_log has % policies; it should be reachable only by the definer functions', n; end if;
  raise notice 'RATE LOG IS SEALED';
end $$;

delete from inquiries    where from_email = 'zz-probe@rlstest.invalid';
delete from reviews      where author_email = 'zz-probe@rlstest.invalid';
delete from rate_log     where bucket in ('review','inquiry');
delete from profiles     where handle like 'zz%';
delete from companies    where slug like 'zz-%';
delete from auth.users   where email like 'zz-%@rlstest.invalid';
