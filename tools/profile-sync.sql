-- Profile sync, 2026-09-22. Applied to the project; kept here as the record.
--
-- The bug (Jacob's list of 2026-09-21, "Nathan Pierce for Davernon
-- Equipment"): staff changed a company's details on Website Applications and
-- the directory listings changed, but the public profile did not. The profile
-- reads the companies row; the listings read the applications rows. The
-- owner's Save on Profile Details writes both, the staff edit wrote one.
--
-- 1. applications -> companies. After a staff or owner edit changes the
--    company name, contact, email, phone or website on a listing, the same
--    change lands on the company row that listing belongs to. Only the
--    columns that changed in that statement move, and never to blank, so an
--    edit to one field cannot drag a stale value along with it.
create or replace function public.applications_mirror_company()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.company_slug is null then return new; end if;
  update companies c set
    name    = case when new.company is distinct from old.company and nullif(btrim(new.company), '') is not null then btrim(new.company) else c.name end,
    contact = case when new.contact is distinct from old.contact and nullif(btrim(new.contact), '') is not null then btrim(new.contact) else c.contact end,
    email   = case when new.email   is distinct from old.email   and nullif(btrim(new.email),   '') is not null then lower(btrim(new.email)) else c.email end,
    phone   = case when new.phone   is distinct from old.phone   and nullif(btrim(new.phone),   '') is not null then btrim(new.phone) else c.phone end,
    website = case when new.website is distinct from old.website and nullif(btrim(new.website), '') is not null then btrim(new.website) else c.website end,
    updated_at = now()
  where c.slug = new.company_slug
    and (new.company is distinct from old.company or new.contact is distinct from old.contact
      or new.email is distinct from old.email or new.phone is distinct from old.phone
      or new.website is distinct from old.website);
  return new;
end $$;

drop trigger if exists applications_mirror_company_trg on public.applications;
create trigger applications_mirror_company_trg
  after update of company, contact, email, phone, website on public.applications
  for each row execute function public.applications_mirror_company();

-- 2. A new account's company row carries the person as its contact. The
--    register page asks for the person's name ("Your Name"), and that name
--    used to become only the company name, so companies were listed with no
--    one to call. It is still the page heading until the owner types a
--    company name on Profile Details.
create or replace function public.register_company()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare p profiles%rowtype; s text; n int := 0;
begin
  select * into p from profiles where user_id = auth.uid();
  if p.user_id is null then raise exception 'no profile' using errcode = 'no_data_found'; end if;
  if exists (select 1 from company_users cu where cu.user_id = p.user_id) then
    return (select cu.company_slug from company_users cu where cu.user_id = p.user_id order by cu.created_at limit 1);
  end if;
  s := p.handle;
  while exists (select 1 from companies c where c.slug = s) loop n := n + 1; s := p.handle || '-' || n; end loop;
  insert into companies (slug, name, contact, email, phone, logo, published)
  values (s, coalesce(nullif(p.display_name, ''), p.handle), nullif(p.display_name, ''), p.email, p.phone, p.photo_url, false);
  insert into company_users (user_id, company_slug, role) values (p.user_id, s, 'owner');
  update companies set handle = p.handle where slug = s;
  return s;
end $$;

-- 3. Backfill for the one account that was out of step when this went in.
--    The other two companies whose listings differ from their row differ by
--    the owner's own later edits, and are left alone.
update companies c set
  name = a.company, contact = a.contact, phone = a.phone, website = a.website, updated_at = now()
from (select distinct on (company_slug) company_slug, company, contact, phone, website
        from applications where status = 'Approved' and company_slug = 'davernon'
       order by company_slug, created_at desc) a
where c.slug = a.company_slug and c.contact is null;
