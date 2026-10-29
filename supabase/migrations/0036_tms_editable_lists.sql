-- Every list people pick from can be edited: add, rename, turn off, delete and reorder. Products,
-- Accounting accounts and payment methods get a position (sort). Lists that were fixed in code
-- (case categories, customer service categories, opportunity sources) move to tms_option_lists.
-- `value` is what records store and never changes; `label` is what people see and can be renamed.

alter table public.tms_products add column if not exists sort integer not null default 0;
alter table public.acc_accounts add column if not exists sort integer not null default 0;
alter table public.acc_payment_methods add column if not exists sort integer not null default 0;

-- Keep today's order (alphabetical) as the starting position.
update public.tms_products p set sort = x.n from (select id, row_number() over (order by service, name) - 1 as n from public.tms_products) x where x.id = p.id and p.sort = 0;
update public.acc_accounts a set sort = x.n from (select id, row_number() over (order by name) - 1 as n from public.acc_accounts) x where x.id = a.id and a.sort = 0;
update public.acc_payment_methods m set sort = x.n from (select id, row_number() over (order by name) - 1 as n from public.acc_payment_methods) x where x.id = m.id and m.sort = 0;

create table if not exists public.tms_option_lists (
  id uuid primary key default gen_random_uuid(),
  list text not null,
  value text not null,
  label text not null,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (list, value)
);

insert into public.tms_option_lists (list, value, label, sort)
values
  ('case_work', 'dispatch', 'Dispatch', 0),
  ('case_work', 'dot_compliance', 'DOT Compliance', 1),
  ('case_work', 'mcpt', 'MCPT', 2),
  ('case_work', 'accounting', 'Accounting', 3),
  ('case_work', 'factoring', 'Factoring', 4),
  ('case_work', 'fuel_card', 'Fuel Card', 5),
  ('case_work', 'insurance', 'Insurance', 6),
  ('case_work', 'other', 'Other', 7),
  ('case_cs', 'overcharge', 'Overcharge', 0),
  ('case_cs', 'service', 'Unhappy with the service', 1),
  ('case_cs', 'dispatcher', 'Unhappy with the dispatcher', 2),
  ('case_cs', 'safety_manager', 'Unhappy with the safety account manager', 3),
  ('case_cs', 'suggestion', 'Suggestion', 4),
  ('case_cs', 'other', 'Other', 5),
  ('opp_source', 'Call list', 'Call list', 0),
  ('opp_source', 'Lead Hunter', 'Lead Hunter', 1),
  ('opp_source', 'GoHighLevel', 'GoHighLevel', 2),
  ('opp_source', 'Referral', 'Referral', 3),
  ('opp_source', 'Website', 'Website', 4),
  ('opp_source', 'Facebook', 'Facebook', 5),
  ('opp_source', 'Instagram', 'Instagram', 6),
  ('opp_source', 'LinkedIn', 'LinkedIn', 7),
  ('opp_source', 'Email', 'Email', 8),
  ('opp_source', 'Text', 'Text', 9),
  ('opp_source', 'WhatsApp', 'WhatsApp', 10),
  ('opp_source', 'Fiverr', 'Fiverr', 11),
  ('opp_source', 'Cross sale', 'Cross sale', 12),
  ('opp_source', 'Other', 'Other', 13)
on conflict (list, value) do nothing;

alter table public.tms_option_lists enable row level security;
drop policy if exists tms_option_lists_all on public.tms_option_lists;
create policy tms_option_lists_all on public.tms_option_lists for all to authenticated using ((select tms_private.is_member())) with check ((select tms_private.is_member()));
do $$ begin
  alter publication supabase_realtime add table public.tms_option_lists;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
