-- Equipment list (like the carriers' Excel): owned or leased, gross vehicle weight rating (GVWR) and
-- the plate's state, on trucks and trailers. (Truck title and lease agreement were already optional
-- document types, so they never show on the to-do list.)

alter table public.tms_trucks add column if not exists ownership text check (ownership in ('owned', 'leased'));
alter table public.tms_trucks add column if not exists gvwr integer;
alter table public.tms_trucks add column if not exists plate_state text;
alter table public.tms_trailers add column if not exists ownership text check (ownership in ('owned', 'leased'));
alter table public.tms_trailers add column if not exists gvwr integer;
alter table public.tms_trailers add column if not exists plate_state text;


notify pgrst, 'reload schema';
