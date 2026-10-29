-- Drivers: date of birth, and paperwork marked "Not required" for one driver (e.g. no MVR for a
-- Mexican license) so it leaves the to-dos and shows N/A on the drivers list.

alter table public.tms_drivers add column if not exists dob date;
alter table public.tms_drivers add column if not exists waived_docs text[] not null default '{}';

notify pgrst, 'reload schema';
