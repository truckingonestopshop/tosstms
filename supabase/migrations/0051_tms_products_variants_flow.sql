-- Sales → cases, end to end.
--   Products: type Exchange; variants (e.g. Articles of Incorporation per state, each its price);
--   the expense TOSS pays for it; a timeframe (days) that sets the case's due date; and the
--   discounts a Rep / Manager / CRO may give (a manager Rep + Manager, the CRO all three).
--   Opportunities: New → Invoice sent (an invoice is made from it) → Won (the invoice is paid),
--   and then one case per product line ("product · variant"), assigned to the rep.
--   Cases: the overdue alert can be turned off with a reason; expenses carry how they were paid,
--   who processed them and where.

-- ---- Products ----------------------------------------------------------------------------------
alter table public.tms_products drop constraint if exists tms_products_kind_check;
alter table public.tms_products add constraint tms_products_kind_check check (kind in ('subscription', 'one_time', 'exchange'));
alter table public.tms_products
  add column if not exists expense numeric(12, 2),
  add column if not exists timeframe_days integer check (timeframe_days is null or timeframe_days >= 0),
  add column if not exists discount_rep numeric(12, 2) not null default 0 check (discount_rep >= 0),
  add column if not exists discount_manager numeric(12, 2) not null default 0 check (discount_manager >= 0),
  add column if not exists discount_cro numeric(12, 2) not null default 0 check (discount_cro >= 0);

create table if not exists public.tms_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.tms_products (id) on delete cascade,
  name text not null,
  price numeric(12, 2) not null default 0,
  -- empty: the product's own expense / timeframe
  expense numeric(12, 2),
  timeframe_days integer check (timeframe_days is null or timeframe_days >= 0),
  active boolean not null default true,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists tms_product_variants_product_idx on public.tms_product_variants (product_id, sort);

-- ---- Opportunity lines -------------------------------------------------------------------------
alter table public.tms_opportunity_items drop constraint if exists tms_opportunity_items_kind_check;
alter table public.tms_opportunity_items add constraint tms_opportunity_items_kind_check check (kind in ('subscription', 'one_time', 'exchange'));
alter table public.tms_opportunity_items
  add column if not exists variant_id uuid references public.tms_product_variants (id) on delete set null,
  add column if not exists variant_name text,
  -- off the line total, in dollars
  add column if not exists discount numeric(12, 2) not null default 0 check (discount >= 0),
  add column if not exists discount_by uuid references auth.users (id) on delete set null,
  add column if not exists expense numeric(12, 2),
  add column if not exists timeframe_days integer;

-- ---- Who may give which discount ---------------------------------------------------------------
alter table public.tms_members add column if not exists sales_level text not null default 'rep';
alter table public.tms_members drop constraint if exists tms_members_sales_level_check;
alter table public.tms_members add constraint tms_members_sales_level_check check (sales_level in ('rep', 'manager', 'cro'));

create or replace function tms_private.check_line_discount()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lvl text;
  p public.tms_products;
  cap numeric;
begin
  if coalesce(new.discount, 0) = 0 or (tg_op = 'UPDATE' and new.discount is not distinct from old.discount) or (select auth.uid()) is null then
    return new;
  end if;
  select case when m.role = 'owner' then 'cro' else m.sales_level end into lvl from public.tms_members m where m.user_id = (select auth.uid());
  select * into p from public.tms_products where id = new.product_id;
  if p.id is null then
    raise exception 'Discounts are only for catalog products' using errcode = '42501';
  end if;
  cap := p.discount_rep
    + case when lvl in ('manager', 'cro') then p.discount_manager else 0 end
    + case when lvl = 'cro' then p.discount_cro else 0 end;
  if new.discount > cap then
    raise exception 'The most you can discount % is $%', p.name, to_char(cap, 'FM999,990.00') using errcode = '42501';
  end if;
  new.discount_by := (select auth.uid());
  return new;
end;
$$;
drop trigger if exists tms_opportunity_items_discount on public.tms_opportunity_items;
create trigger tms_opportunity_items_discount before insert or update of discount on public.tms_opportunity_items
  for each row execute function tms_private.check_line_discount();

-- ---- Opportunity status: New → Invoice sent → Won (or Lost / Abandoned) ------------------------
alter table public.tms_opportunities drop constraint if exists tms_opportunities_status_check;
update public.tms_opportunities set status = 'new' where status = 'open';
alter table public.tms_opportunities alter column status set default 'new';
alter table public.tms_opportunities add constraint tms_opportunities_status_check check (status in ('new', 'invoice_sent', 'won', 'lost', 'abandoned'));

-- ---- Invoices know their opportunity ----------------------------------------------------------
alter table public.tms_invoices add column if not exists opportunity_id uuid references public.tms_opportunities (id) on delete set null;
create index if not exists tms_invoices_opportunity_idx on public.tms_invoices (opportunity_id);

-- ---- Cases from a sale -------------------------------------------------------------------------
alter table public.tms_cases
  add column if not exists product_id uuid references public.tms_products (id) on delete set null,
  add column if not exists variant_id uuid references public.tms_product_variants (id) on delete set null,
  add column if not exists opportunity_item_id uuid references public.tms_opportunity_items (id) on delete set null,
  -- the overdue alert turned off (e.g. the state takes longer than us), with why
  add column if not exists alert_off boolean not null default false,
  add column if not exists alert_off_reason text;
create unique index if not exists tms_cases_opportunity_item_uniq on public.tms_cases (opportunity_item_id) where opportunity_item_id is not null;
alter table public.tms_cases drop constraint if exists tms_cases_alert_reason;
alter table public.tms_cases add constraint tms_cases_alert_reason check (not alert_off or coalesce(btrim(alert_off_reason), '') <> '');

-- ---- Case expenses: how it was paid, by whom, where --------------------------------------------
alter table public.tms_case_entries
  add column if not exists payment_method text check (payment_method in ('card', 'bank', 'client_bank', 'client_card')),
  add column if not exists account_id uuid references public.acc_accounts (id) on delete set null,
  add column if not exists processed_by uuid references auth.users (id) on delete set null,
  add column if not exists website text;

-- ---- The flow ------------------------------------------------------------------------------------
create or replace function tms_private.invoice_moves_opportunity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  o public.tms_opportunities;
  i record;
begin
  if new.opportunity_id is null then return new; end if;
  select * into o from public.tms_opportunities where id = new.opportunity_id;
  if o.id is null then return new; end if;

  -- Paid (charged): won, and a case for each product line.
  if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    if o.status <> 'won' then
      update public.tms_opportunities set status = 'won', closed_at = now() where id = o.id;
    end if;
    for i in select * from public.tms_opportunity_items where opportunity_id = o.id order by sort loop
      insert into public.tms_cases (kind, company_id, title, category, status, priority, owner_id, opportunity_id, invoice_id,
                                    product_id, variant_id, opportunity_item_id, due_date, description, created_by)
      values ('work', o.company_id, i.name || coalesce(' · ' || nullif(i.variant_name, ''), ''), i.service, 'received', 'normal', o.owner_id,
              o.id, new.id, i.product_id, i.variant_id, i.id,
              case when i.timeframe_days is not null then current_date + i.timeframe_days end,
              'From OPP-' || o.number || ' · invoice ' || new.invoice_number, o.owner_id)
      on conflict (opportunity_item_id) where opportunity_item_id is not null do nothing;
    end loop;
  -- Made / sent: invoice sent.
  elsif o.status = 'new' and new.status in ('draft', 'sent') then
    update public.tms_opportunities set status = 'invoice_sent' where id = o.id;
  end if;
  return new;
end;
$$;
drop trigger if exists tms_invoices_opportunity_flow on public.tms_invoices;
create trigger tms_invoices_opportunity_flow after insert or update of status, opportunity_id on public.tms_invoices
  for each row execute function tms_private.invoice_moves_opportunity();

-- ---- Access ------------------------------------------------------------------------------------
alter table public.tms_product_variants enable row level security;
drop policy if exists tms_product_variants_all on public.tms_product_variants;
create policy tms_product_variants_all on public.tms_product_variants for all to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));
do $$
begin
  alter publication supabase_realtime add table public.tms_product_variants;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';

-- ---- Closed only when won / lost / abandoned; readable status names in the history ----------------
create or replace function tms_private.opportunity_stamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status in ('won', 'lost', 'abandoned') and (tg_op = 'INSERT' or old.status is distinct from new.status) then new.closed_at := now();
  elsif new.status not in ('won', 'lost', 'abandoned') then new.closed_at := null; end if;
  if tg_op = 'INSERT' or old.stage_id is distinct from new.stage_id then new.stage_entered_at := now(); end if;
  return new;
end;
$$;

create or replace function tms_private.log_opportunity_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v text := case when new.value > 0 then ' ($' || to_char(new.value, 'FM999,999,990.00') || ')' else '' end;
  ref text := 'OPP-' || new.number || ' ' || new.title;
  st constant jsonb := '{"new":"New","invoice_sent":"Invoice sent","won":"Won","lost":"Lost","abandoned":"Abandoned"}';
  from_name text;
  to_name text;
  reason text;
begin
  if tg_op = 'INSERT' then
    insert into public.tms_opportunity_events (opportunity_id, kind, message, to_stage_id, actor_name)
    values (new.id, 'created', 'Opportunity created', new.stage_id, tms_private.actor_name());
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.company_id, 'sale', 'Opportunity added: ' || ref || v, tms_private.actor_name());
    return new;
  end if;
  if new.stage_id is distinct from old.stage_id then
    select name into from_name from public.tms_pipeline_stages where id = old.stage_id;
    select name into to_name from public.tms_pipeline_stages where id = new.stage_id;
    insert into public.tms_opportunity_events (opportunity_id, kind, message, from_stage_id, to_stage_id, actor_name)
    values (new.id, 'stage', coalesce(from_name, '—') || ' → ' || coalesce(to_name, '—'), old.stage_id, new.stage_id, tms_private.actor_name());
  end if;
  if new.status is distinct from old.status then
    select name into reason from public.tms_lost_reasons where id = new.lost_reason_id;
    insert into public.tms_opportunity_events (opportunity_id, kind, message, actor_name)
    values (new.id, 'status', 'Status: ' || (st ->> new.status) || case when new.status = 'lost' and reason is not null then ': ' || reason else '' end, tms_private.actor_name());
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.company_id, 'sale', 'Opportunity ' || lower(st ->> new.status) || ': ' || ref || v || case when new.status = 'lost' and reason is not null then ' — ' || reason else '' end, tms_private.actor_name());
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
