-- TOSS Accounting: TOSS's own money. Expenses, incoming money and transfers between TOSS's
-- accounts, with categories, merchants, payment methods, custom fields, recurring expenses and the
-- receipt / proof of every transaction. Only owners and people given "Accounting" on Users can
-- see any of it (tms_members.sections contains 'accounting'). TOSS Cloud tables only.

-- Who may use Accounting.
create or replace function tms_private.can_accounting()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tms_members m
     where m.user_id = (select auth.uid())
       and (m.role = 'owner' or 'accounting' = any (coalesce(m.sections, '{}')))
  );
$$;
revoke all on function tms_private.can_accounting() from public, anon;
grant execute on function tms_private.can_accounting() to authenticated;

create table if not exists public.acc_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'bank' check (kind in ('bank', 'card', 'cash', 'online', 'other')),
  last4 text,
  opening_balance numeric(14, 2) not null default 0,
  opening_date date,
  color text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.acc_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  parent_id uuid references public.acc_categories (id) on delete set null,
  color text,
  budget_monthly numeric(14, 2),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.acc_merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_category_id uuid references public.acc_categories (id) on delete set null,
  website text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists acc_merchants_name_idx on public.acc_merchants (lower(name));

create table if not exists public.acc_payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'card' check (kind in ('card', 'ach', 'zelle', 'wire', 'check', 'cash', 'paypal', 'other')),
  account_id uuid references public.acc_accounts (id) on delete set null,
  last4 text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Extra fields the team adds to the forms (text, number, date, yes/no, dropdown).
create table if not exists public.acc_custom_fields (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  type text not null default 'text' check (type in ('text', 'number', 'date', 'boolean', 'select')),
  options text[] not null default '{}',
  applies_to text not null default 'all' check (applies_to in ('expense', 'income', 'all')),
  required boolean not null default false,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.acc_recurring (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  merchant_id uuid references public.acc_merchants (id) on delete set null,
  counterparty text,
  category_id uuid references public.acc_categories (id) on delete set null,
  payment_method_id uuid references public.acc_payment_methods (id) on delete set null,
  account_id uuid references public.acc_accounts (id) on delete set null,
  amount numeric(14, 2) not null default 0,
  frequency text not null default 'monthly' check (frequency in ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_date date not null default current_date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.acc_transactions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('expense', 'income', 'transfer')),
  date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  -- expense: paid from (via the payment method); income: available in; transfer: from
  account_id uuid references public.acc_accounts (id) on delete set null,
  -- transfer: to
  to_account_id uuid references public.acc_accounts (id) on delete set null,
  payment_method_id uuid references public.acc_payment_methods (id) on delete set null,
  merchant_id uuid references public.acc_merchants (id) on delete set null,
  -- income "From" (customer, client, bank) / a merchant not on the list
  counterparty text,
  category_id uuid references public.acc_categories (id) on delete set null,
  processed_by uuid references auth.users (id) on delete set null,
  -- optional: a carrier this is about (refund to a client, a client's payment…)
  company_id uuid references public.tms_companies (id) on delete set null,
  status text not null default 'cleared' check (status in ('pending', 'cleared')),
  tags text[] not null default '{}',
  notes text,
  custom jsonb not null default '{}'::jsonb,
  -- receipt / invoice / proof of payment: [{ path, name, mime, size }] in the tms-accounting bucket
  files jsonb not null default '[]'::jsonb,
  recurring_id uuid references public.acc_recurring (id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists acc_transactions_date_idx on public.acc_transactions (date desc);
create index if not exists acc_transactions_category_idx on public.acc_transactions (category_id);
create index if not exists acc_transactions_account_idx on public.acc_transactions (account_id);

-- Settings: whether a receipt / proof is required.
create table if not exists public.acc_settings (
  id integer primary key default 1 check (id = 1),
  require_receipt boolean not null default true,
  require_proof boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.acc_settings (id) values (1) on conflict do nothing;

-- updated_at, access, live updates
do $$
declare t text;
begin
  foreach t in array array['acc_accounts', 'acc_categories', 'acc_merchants', 'acc_payment_methods', 'acc_custom_fields', 'acc_recurring', 'acc_transactions', 'acc_settings'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated', t);
    execute format('create trigger %I before update on public.%I for each row execute function tms_private.touch_updated_at()', t || '_updated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select tms_private.can_accounting())) with check ((select tms_private.can_accounting()))', t || '_all', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Receipts and proofs: a private bucket only Accounting users can read or write.
insert into storage.buckets (id, name, public) values ('tms-accounting', 'tms-accounting', false) on conflict (id) do nothing;
drop policy if exists "tms accounting read" on storage.objects;
drop policy if exists "tms accounting insert" on storage.objects;
drop policy if exists "tms accounting update" on storage.objects;
drop policy if exists "tms accounting delete" on storage.objects;
create policy "tms accounting read" on storage.objects for select to authenticated using (bucket_id = 'tms-accounting' and (select tms_private.can_accounting()));
create policy "tms accounting insert" on storage.objects for insert to authenticated with check (bucket_id = 'tms-accounting' and (select tms_private.can_accounting()));
create policy "tms accounting update" on storage.objects for update to authenticated using (bucket_id = 'tms-accounting' and (select tms_private.can_accounting()));
create policy "tms accounting delete" on storage.objects for delete to authenticated using (bucket_id = 'tms-accounting' and (select tms_private.can_accounting()));

-- Starter categories for a dispatch / services company (all editable).
insert into public.acc_categories (name, kind, color, sort)
select v.name, v.kind, v.color, v.sort
  from (values
    ('Payroll & commissions', 'expense', '#8b5cf6', 10),
    ('Software & load boards', 'expense', '#0ea5e9', 20),
    ('Marketing & leads', 'expense', '#ec4899', 30),
    ('Office & rent', 'expense', '#f59e0b', 40),
    ('Phone & internet', 'expense', '#14b8a6', 50),
    ('Insurance', 'expense', '#6366f1', 60),
    ('Licenses & permits', 'expense', '#84cc16', 70),
    ('Professional fees', 'expense', '#a855f7', 80),
    ('Bank & card fees', 'expense', '#64748b', 90),
    ('Factoring fees', 'expense', '#78716c', 100),
    ('Travel & meals', 'expense', '#f97316', 110),
    ('Refunds to clients', 'expense', '#ef4444', 120),
    ('Taxes', 'expense', '#dc2626', 130),
    ('Other expenses', 'expense', '#9ca3af', 140),
    ('Dispatch fees', 'income', '#16a34a', 10),
    ('Service subscriptions', 'income', '#22c55e', 20),
    ('One-time services', 'income', '#10b981', 30),
    ('Other income', 'income', '#6b7280', 40)
  ) as v(name, kind, color, sort)
 where not exists (select 1 from public.acc_categories);

notify pgrst, 'reload schema';
