-- Trucks: model (next to make, e.g. Peterbilt T680) and the time it's available
-- (with available_date). Truck document names as the team uses them.
-- TMS tables only; nothing in TOSS Leads is touched.

alter table public.tms_trucks
  add column if not exists model          text,
  add column if not exists available_time time;

alter table public.tms_doc_types disable trigger tms_doc_types_guard;
update public.tms_doc_types set name = 'Truck Registration (Cab Card)' where key = 'registration';
update public.tms_doc_types set name = 'Annual Truck Inspection' where key = 'inspection';
alter table public.tms_doc_types enable trigger tms_doc_types_guard;

notify pgrst, 'reload schema';
