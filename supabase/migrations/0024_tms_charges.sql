-- Billing: what TOSS charges each carrier for its services besides invoices: subscriptions
-- (recurring) and one-time charges (à la carte). Typed by the team. TMS tables only.

create table if not exists public.tms_charges (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.tms_companies (id) on delete cascade,
  service     text not null default 'other'
              check (service in ('dispatch', 'dot_compliance', 'mcpt', 'accounting', 'factoring', 'fuel_card', 'insurance', 'other')),
  kind        text not null check (kind in ('subscription', 'one_time')),
  description text not null,
  amount      numeric(12, 2) not null check (amount >= 0),
  -- subscription: how often it's charged, from when (and until when, once it ends)
  billing_interval text check (billing_interval in ('weekly', 'monthly', 'quarterly', 'yearly')),
  start_date  date,
  end_date    date,
  -- one-time: the day it's charged, and when it was paid
  charge_date date,
  paid_on     date,
  -- subscription: active / paused / cancelled · one-time: unpaid / paid / void
  status      text not null check (status in ('active', 'paused', 'cancelled', 'unpaid', 'paid', 'void')),
  notes       text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint tms_charges_kind_fields check (
    (kind = 'subscription' and billing_interval is not null and status in ('active', 'paused', 'cancelled'))
    or (kind = 'one_time' and charge_date is not null and status in ('unpaid', 'paid', 'void'))
  )
);
create index if not exists tms_charges_company_idx on public.tms_charges (company_id, kind);

drop trigger if exists tms_charges_updated on public.tms_charges;
create trigger tms_charges_updated before update on public.tms_charges
  for each row execute function tms_private.touch_updated_at();

alter table public.tms_charges enable row level security;
drop policy if exists tms_charges_all on public.tms_charges;
create policy tms_charges_all on public.tms_charges for all to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));

do $$ begin
  alter publication supabase_realtime add table public.tms_charges;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
