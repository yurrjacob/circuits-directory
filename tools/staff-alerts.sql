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
