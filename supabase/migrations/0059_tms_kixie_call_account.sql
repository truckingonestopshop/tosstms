-- Calls and texts can go through different Kixie users: calls ring the Kixie app of
-- kixie_call_email (the one someone is signed in to), texts go out from kixie_main_email's
-- number (the one that can text). Empty kixie_call_email = calls use kixie_main_email too.
alter table public.tms_settings add column if not exists kixie_call_email text;
update public.tms_settings set kixie_call_email = 'dayana.villa@truckingonestopshop.net' where id = 1 and kixie_call_email is null;
notify pgrst, 'reload schema';
