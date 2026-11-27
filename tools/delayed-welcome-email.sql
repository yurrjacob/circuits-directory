-- Delayed welcome email (Jacob, 2026-09-20). Applied as delayed_welcome_email
-- and notification_email_sweeper_schedule.
--
-- Confirming an email opens /welcome, the on-boarding page. The welcome email
-- is the second net behind it, so it waits ten minutes instead of racing the
-- confirmation email. Every other notice still emails the moment it is inserted.
--
-- How: notifications gains email_after (when the email may leave) and
-- emailed_at (when it did). The insert trigger sends at once unless email_after
-- is in the future; a pg_cron job runs send_due_notification_emails() every
-- minute for the rest. welcome_notification() sets email_after ten minutes out.
-- The recipient is still derived from the notification row by the notify edge
-- function (kind inbox, id), never from the request.
--
-- Guards: every row that existed when the columns arrived was marked emailed_at
-- = created_at, so the sweeper could never mail the archive (502 rows). The
-- sweeper only considers rows under a day old and closes off anything older,
-- so a notice can never arrive days late. Both functions are execute-revoked
-- from anon and authenticated.

-- alter table notifications
--   add column if not exists email_after timestamptz not null default now(),
--   add column if not exists emailed_at  timestamptz;
-- update notifications set emailed_at = created_at where emailed_at is null;

-- create or replace function public.email_notification() returns trigger
-- language plpgsql security definer set search_path to 'public', 'extensions' as $$
-- begin
--   if new.email_after > now() then return new; end if;
--   perform net.http_post(
--     url := 'https://ghpruernzhjwsgsezdyn.supabase.co/functions/v1/notify',
--     body := jsonb_build_object('kind', 'inbox', 'id', new.id),
--     headers := '{"Content-Type": "application/json"}'::jsonb);
--   update notifications set emailed_at = now() where id = new.id;
--   return new;
-- end $$;

-- create or replace function public.send_due_notification_emails() returns integer
-- language plpgsql security definer set search_path to 'public', 'extensions' as $$
-- declare sent integer := 0; r record;
-- begin
--   for r in select id from notifications
--             where emailed_at is null and email_after <= now()
--               and created_at > now() - interval '1 day'
--             order by email_after limit 100
--   loop
--     perform net.http_post(url := '.../functions/v1/notify',
--       body := jsonb_build_object('kind', 'inbox', 'id', r.id),
--       headers := '{"Content-Type": "application/json"}'::jsonb);
--     update notifications set emailed_at = now() where id = r.id;
--     sent := sent + 1;
--   end loop;
--   update notifications set emailed_at = now()
--    where emailed_at is null and created_at <= now() - interval '1 day';
--   return sent;
-- end $$;
-- revoke execute on function public.send_due_notification_emails() from public, anon, authenticated;
-- revoke execute on function public.email_notification() from public, anon, authenticated;

-- welcome_notification(p_user, p_name): same body as before, plus
--   email_after = now() + interval '10 minutes'   on the insert.

-- create extension if not exists pg_cron;
-- select cron.schedule('send-due-notification-emails', '* * * * *',
--                      'select public.send_due_notification_emails()');
--
-- To change the delay: edit the interval in welcome_notification().
-- To stop the delay: set it to now() and the insert trigger sends at once.

-- 2026-10-12 (Jacob's on-boarding list): the welcome email has three green
-- buttons again (notify v18) and its text uses the current tab names. Applied:
-- create or replace function public.welcome_notification(p_user uuid, p_name text) ... body lines:
--   'Free Directory Listing: choose up to 10 free Circuits-Keywords™ under Your Listings and be found by everyone searching them.'
--   'Post Free Job: post an open role under Hire Talent. It goes on the Job Board.'
--   'Post Free Resume: add your resume and Circuits-Keywords™ under Search Work and list yourself on the Talent Board.'
-- Everything else (subject, link, the ten minute email_after) is unchanged.

-- 2026-11-16 fix, applied as notification_email_claim_in_function: no inbox
-- email had gone out since this file was applied. Both functions above set
-- emailed_at in the same transaction as net.http_post, and pg_net only sends
-- after commit, so the notify function always found the row already marked
-- and answered nothing_to_send. Both functions now only post; the notify
-- function's own "update ... where emailed_at is null" claims the row, so a
-- notice still goes out at most once even if the trigger and the sweeper both
-- post it. The one-day close-off in the sweeper is unchanged.

-- 2026-11-27, applied as welcome_parts_projects. The 2026-11-23 change list:
-- the welcome's Post Free Job and Post Free Resume lines become Parts and
-- Projects, matching the email's new buttons (tools/edge-notify.ts v20).
create or replace function public.welcome_notification(p_user uuid, p_name text)
 returns void
 language sql
 security definer
 set search_path to 'public'
as $function$
  insert into notifications (user_id, sender_name, sender_avatar, subject, body, link, email_after)
  select p_user, 'Circuits.com', 'https://circuits.com/assets/favicon.png',
         'Welcome to Circuits.com',
         'Hi ' || coalesce(nullif(p_name, ''), 'there') || ', and welcome to Circuits.com, the directory that connects the circuits industry.' || E'\n\n' ||
         'Your dashboard is where everything happens. Pick where to start:' || E'\n\n' ||
         'Free Directory Listing: choose up to 10 free Circuits-Keywords™ under Your Listings and be found by everyone searching them.' || E'\n\n' ||
         'Post Parts and Part Numbers for Free. They appear live in the Global Directory and in Parts Keyword Searches.' || E'\n\n' ||
         'Post Your Projects for Free. They appear live in the Global Projects Directory and in Projects Keyword Searches.' || E'\n\n' ||
         'Questions? Ask through the Contact page and a person answers.',
         '/portal#listings',
         now() + interval '10 minutes'
   where not exists (select 1 from notifications n where n.user_id = p_user and n.subject = 'Welcome to Circuits.com')
$function$;
