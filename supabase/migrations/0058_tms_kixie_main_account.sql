-- The company's main Kixie account: everyone in TOSS calls and texts through this Kixie user,
-- whoever is signed in (owners change it in Inbox → Phone setup). Empty = each member's own
-- Kixie login. Must be a Kixie user on Professional or higher whose number can text.
alter table public.tms_settings add column if not exists kixie_main_email text;
update public.tms_settings set kixie_main_email = 'andrea.martinez@truckingonestopshop.net' where id = 1 and kixie_main_email is null;
notify pgrst, 'reload schema';
