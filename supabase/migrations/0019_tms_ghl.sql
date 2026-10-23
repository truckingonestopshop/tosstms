-- GHL → TOSS Cloud: when an agent sets a GoHighLevel contact to Customer, GHL calls
-- /api/ghl/customer and the carrier is created (docs/ghl-integration-plan.md, part 2). TMS tables only.

-- Which GHL contact a carrier came from (one carrier per contact).
alter table public.tms_companies add column if not exists ghl_contact_id text;
create unique index if not exists tms_companies_ghl_contact_idx on public.tms_companies (ghl_contact_id) where ghl_contact_id is not null;

-- Every call from GHL: what came in and what was done (created / updated / skipped / failed).
create table if not exists public.tms_ghl_events (
  id             uuid primary key default gen_random_uuid(),
  received_at    timestamptz not null default now(),
  ghl_contact_id text,
  dot_number     text,
  action         text not null check (action in ('created', 'updated', 'unchanged', 'skipped', 'failed')),
  company_id     uuid references public.tms_companies (id) on delete set null,
  message        text,
  payload        jsonb not null default '{}'::jsonb
);
create index if not exists tms_ghl_events_received_idx on public.tms_ghl_events (received_at desc);

-- Written by the server only (secret key); the team can read it.
alter table public.tms_ghl_events enable row level security;
drop policy if exists tms_ghl_events_read on public.tms_ghl_events;
create policy tms_ghl_events_read on public.tms_ghl_events for select to authenticated using ((select tms_private.is_member()));
revoke insert, update, delete on public.tms_ghl_events from anon, authenticated;

notify pgrst, 'reload schema';
