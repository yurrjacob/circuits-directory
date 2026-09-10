-- Grouped "New listing request" staff notification (2026-09-10).
--
-- One Get Listed submit files one applications row per keyword, all in one
-- INSERT. The row trigger told staff once per row, so a five-keyword request
-- was five messages in every staff inbox. Staff now get ONE message per
-- company per INSERT statement, naming the company, its username and every
-- keyword asked for. A keyword added later is its own statement, so it is its
-- own message; nothing is merged across submits. The applicant's own
-- per-keyword receipt, and every UPDATE/DELETE message, are unchanged.
--
-- Applied to circuits-com on 2026-09-10 as grouped_listing_request_notifications.

-- 1. the row trigger no longer tells staff about inserts
create or replace function public.notify_applications()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare owner uuid; kw text; page text;
begin
  if tg_op = 'DELETE' then
    owner := user_id_by_email(old.owner_email);
    perform notify_user(owner, 'Your ' || coalesce(old.keyword, 'keyword') || ' listing was removed',
      'Circuits.com removed the ' || coalesce(old.keyword, 'keyword') || ' listing for ' || old.company ||
      '. Your company page and account are not affected. Reply through the Contact page if you have questions.', '/portal');
    return old;
  end if;
  owner := user_id_by_email(new.owner_email);
  kw := coalesce(new.keyword, 'keyword');
  if tg_op = 'INSERT' then
    perform notify_user(owner, 'Listing request received: ' || kw,
      'We received your request for the ' || kw || ' listing for ' || new.company ||
      '. A person reviews every listing, and you get a message here the moment it is approved.', '/portal');
    -- staff are told once per statement, see notify_applications_batch()
    return new;
  end if;
  -- UPDATE: only the changes a person cannot see for themselves
  page := '/results?q=' || kw;
  if new.status = 'Approved' and old.status is distinct from 'Approved' then
    perform notify_user(owner, 'Your ' || kw || ' listing is live',
      new.company || ' now appears when people search ' || kw || '. Add your certifications, team and gallery from the Listings tab, and switch on buyer reviews if you want them.', page);
  elsif new.status = 'Denied' and old.status is distinct from 'Denied' then
    perform notify_user(owner, 'Your ' || kw || ' listing was not approved',
      'Circuits.com did not approve the ' || kw || ' listing for ' || new.company || '. Reply through the Contact page if you think this is a mistake or want to know why.', '/contact');
  end if;
  if new.paused is distinct from old.paused and new.status is not distinct from old.status and is_staff() then
    perform notify_user(owner, case when new.paused then 'Your ' || kw || ' listing is paused' else 'Your ' || kw || ' listing is active again' end,
      case when new.paused then 'Circuits.com paused the ' || kw || ' listing for ' || new.company || '. It is hidden from search until it is resumed. Reply through the Contact page if you have questions.'
           else 'The ' || kw || ' listing for ' || new.company || ' is back in search results.' end, page);
  end if;
  if (new.badge is null) <> (old.badge is null) then
    perform notify_user(owner, case when new.badge is not null then 'Trust Badge added to ' || kw else 'Trust Badge removed from ' || kw end,
      case when new.badge is not null then 'Your ' || kw || ' listing now shows the Trust Badge next to ' || new.company || '.'
           else 'The Trust Badge was removed from your ' || kw || ' listing.' end, page);
  end if;
  if new.banner is distinct from old.banner then
    perform notify_user(owner, case when new.banner then 'Sponsor banner is on for ' || kw else 'Sponsor banner is off for ' || kw end,
      case when new.banner then new.company || ' now has the sponsor banner at the top of the ' || kw || ' results.'
           else 'The sponsor banner on your ' || kw || ' listing is off.' end, page);
  end if;
  if new.locked_position is distinct from old.locked_position then
    perform notify_user(owner, case when new.locked_position is not null then kw || ' listing locked to spot #' || new.locked_position else kw || ' listing is no longer locked' end,
      case when new.locked_position is not null then new.company || ' is now fixed at position ' || new.locked_position || ' in the ' || kw || ' results.'
           else 'Your ' || kw || ' listing now rotates with the others.' end, page);
  end if;
  return new;
end $function$;

-- 2. one staff message per company per INSERT statement
create or replace function public.notify_applications_batch()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare r record;
begin
  for r in
    select company, company_handle,
           count(*) as n,
           string_agg(coalesce(keyword, 'keyword'), ', ' order by keyword) as kws,
           string_agg(coalesce(keyword, 'keyword')
             || case when fee is not null then ' (' || fee || ')' else '' end, ', ' order by keyword) as kws_fee
      from inserted
     group by company_slug, company, company_handle
  loop
    perform notify_staff(
      'New listing request: ' || r.company || ' / '
        || case when r.n = 1 then r.kws else r.n || ' keywords' end,
      r.company
        || case when r.company_handle is not null then ' (circuits.com/' || r.company_handle || ')' else '' end
        || ' asked for '
        || case when r.n = 1 then 'the ' || r.kws_fee || ' listing' else r.n || ' listings: ' || r.kws_fee end
        || '. Approve or deny ' || case when r.n = 1 then 'it' else 'them' end || ' in the Admin tab.',
      '/portal');
  end loop;
  return null;
end $function$;

drop trigger if exists notify_applications_batch_trg on public.applications;
create trigger notify_applications_batch_trg
  after insert on public.applications
  referencing new table as inserted
  for each statement execute function public.notify_applications_batch();
