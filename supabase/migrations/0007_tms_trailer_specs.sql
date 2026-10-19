-- Type-specific trailer specs (reefer air chute and unit, flatbed deck, tank capacity…),
-- stored as { key: value | [values] }. The form shows the fields for the trailer's type.
alter table public.tms_trailers add column if not exists specs jsonb not null default '{}'::jsonb;
notify pgrst, 'reload schema';
