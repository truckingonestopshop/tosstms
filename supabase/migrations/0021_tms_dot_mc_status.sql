-- The carrier's USDOT and MC status kept apart (one can be inactive or out of service while the
-- other is fine). Typed by the team; empty = not recorded. TMS tables only.
alter table public.tms_companies
  add column if not exists dot_status text check (dot_status in ('active', 'inactive', 'oos')),
  add column if not exists mc_status  text check (mc_status in ('active', 'inactive', 'oos'));

notify pgrst, 'reload schema';
