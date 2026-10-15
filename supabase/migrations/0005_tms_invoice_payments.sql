-- Payments on invoices: each payment (date, amount, method, reference) is kept, and the
-- invoice's amount paid / status / paid date follow from them, as do its loads.
-- TMS tables only; nothing in TOSS Leads is touched.

create table if not exists public.tms_invoice_payments (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references public.tms_invoices(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  paid_on     date not null default current_date,
  method      text not null default 'ach' check (method in ('ach', 'zelle', 'wire', 'check', 'card', 'cash', 'factoring', 'other')),
  reference   text,
  notes       text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists tms_invoice_payments_invoice_idx on public.tms_invoice_payments (invoice_id, paid_on);

alter table public.tms_invoice_payments enable row level security;
revoke all on public.tms_invoice_payments from anon;
grant select, insert, update, delete on public.tms_invoice_payments to authenticated;
drop policy if exists tms_invoice_payments_all on public.tms_invoice_payments;
create policy tms_invoice_payments_all on public.tms_invoice_payments for all to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));

-- Invoices already marked paid keep their amount as one payment on the paid date.
insert into public.tms_invoice_payments (invoice_id, amount, paid_on, method, notes, created_by)
select i.id, i.amount_paid, coalesce(i.paid_at::date, i.issue_date), 'other', 'Recorded before payment history', null
from public.tms_invoices i
where i.amount_paid > 0
  and not exists (select 1 from public.tms_invoice_payments p where p.invoice_id = i.id);

-- Amount paid, status and paid date from the payments.
create or replace function tms_private.apply_invoice_payments(inv_id uuid) returns void
language plpgsql set search_path = '' as $$
declare
  inv public.tms_invoices;
  paid numeric(12,2);
  last_day date;
  next_status text;
begin
  select * into inv from public.tms_invoices where id = inv_id;
  if not found then return; end if;
  select coalesce(sum(amount), 0), max(paid_on) into paid, last_day from public.tms_invoice_payments where invoice_id = inv_id;

  next_status := case
    when inv.status in ('void', 'draft') and paid = 0 then inv.status
    when inv.status = 'void' then 'void'
    when paid > 0 and paid >= inv.total_due and inv.total_due > 0 then 'paid'
    when inv.status = 'paid' then 'sent'
    when paid > 0 then 'sent'          -- money received on a draft means it was sent
    else inv.status
  end;

  update public.tms_invoices set
    amount_paid = paid,
    status = next_status,
    paid_at = case when next_status = 'paid' then coalesce(inv.paid_at, last_day::timestamptz) else null end,
    sent_at = case when next_status in ('sent', 'paid') then coalesce(inv.sent_at, now()) else inv.sent_at end
  where id = inv_id
    and (amount_paid, status, paid_at) is distinct from (paid, next_status, case when next_status = 'paid' then coalesce(inv.paid_at, last_day::timestamptz) else null end);

  -- Loads follow: fully paid → paid; no longer fully paid → back to invoiced.
  if next_status = 'paid' and inv.status <> 'paid' then
    update public.tms_loads set status = 'paid'
    where id in (select load_id from public.tms_invoice_lines where invoice_id = inv_id and load_id is not null)
      and status in ('delivered', 'invoiced');
  elsif inv.status = 'paid' and next_status = 'sent' then
    update public.tms_loads set status = 'invoiced'
    where id in (select load_id from public.tms_invoice_lines where invoice_id = inv_id and load_id is not null)
      and status = 'paid';
  end if;
end $$;

create or replace function tms_private.on_invoice_payment() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform tms_private.apply_invoice_payments(coalesce(new.invoice_id, old.invoice_id));
  if tg_op = 'UPDATE' and new.invoice_id is distinct from old.invoice_id then
    perform tms_private.apply_invoice_payments(old.invoice_id);
  end if;
  return null;
end $$;

drop trigger if exists tms_invoice_payments_apply on public.tms_invoice_payments;
create trigger tms_invoice_payments_apply after insert or update or delete on public.tms_invoice_payments
  for each row execute function tms_private.on_invoice_payment();

-- A changed invoice total re-checks paid / not paid (e.g. a line was added after payment).
create or replace function tms_private.on_invoice_total() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.total_due is distinct from old.total_due and new.status in ('sent', 'paid') then
    perform tms_private.apply_invoice_payments(new.id);
  end if;
  return null;
end $$;

drop trigger if exists tms_invoices_total_recheck on public.tms_invoices;
create trigger tms_invoices_total_recheck after update of total_due on public.tms_invoices
  for each row execute function tms_private.on_invoice_total();

do $$ begin
  alter publication supabase_realtime add table public.tms_invoice_payments;
exception when duplicate_object then null; end $$;
