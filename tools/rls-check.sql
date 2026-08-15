-- Circuits.com — row level security self-check.
-- Paste into the Supabase SQL editor and run. It creates two throwaway
-- companies owned by two different confirmed users, asserts neither can touch
-- the other's data, then deletes everything it made. Silence means it passed;
-- any failure raises.
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

  insert into companies (slug, name, published) values
    ('zz-rlstest-a','ZZ RLS Test A', true), ('zz-rlstest-b','ZZ RLS Test B', true);
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

  select count(*) into n from inquiries;
  if n <> 0 then raise exception 'FAIL: anon read % inquiries', n; end if;
  select count(*) into n from reviews where status <> 'Approved';
  if n <> 0 then raise exception 'FAIL: anon saw % unapproved reviews', n; end if;
  select count(*) into n from profile_events;
  if n <> 0 then raise exception 'FAIL: anon read profile_events'; end if;

  insert into profile_events (company_slug, kind, visitor) values ('zz-rlstest-a','view','zz');
  insert into reviews (company_slug, author_name, author_email, rating, body, status)
  values ('zz-rlstest-a','Anon','a@rlstest.invalid',5,'good','Pending');

  begin
    insert into reviews (company_slug, author_name, author_email, rating, body, status)
    values ('zz-rlstest-a','Cheat','c@rlstest.invalid',5,'self-approved','Approved');
    raise exception 'FAIL: anon inserted a pre-approved review';
  exception when insufficient_privilege then null;
  end;

  reset role;
  raise notice 'ALL RLS CHECKS PASSED';
end $$;

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

delete from applications where company_slug like 'zz-%';
delete from companies where slug like 'zz-%';
delete from staff where email like 'zz-%@rlstest.invalid';
delete from auth.users where email like 'zz-%@rlstest.invalid';
