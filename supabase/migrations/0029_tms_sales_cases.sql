-- Sales (products, templates & agreements, opportunities), Cases (work for a client, with a work
-- log and expenses, connected to an invoice / opportunity) and Customer Service cases (same table,
-- kind = 'customer_service'). Everything that happens shows on the company's Timeline.
-- TMS tables only.

-- ---------------------------------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------------------------------
create table if not exists public.tms_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  service text not null default 'other',
  kind text not null default 'subscription' check (kind in ('subscription', 'one_time')),
  price numeric(12, 2) not null default 0,
  billing_interval text check (billing_interval in ('weekly', 'monthly', 'quarterly', 'yearly')),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tms_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'agreement' check (kind in ('agreement', 'template', 'email')),
  service text not null default 'other',
  -- text with {{company_name}}, {{dot_number}}, {{mc_number}}, {{representative}}, {{date}}…
  body text not null default '',
  -- an uploaded file instead of / next to the text (tms-docs bucket)
  file_path text,
  file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tms_opportunities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.tms_companies (id) on delete cascade,
  title text not null,
  service text not null default 'other',
  product_id uuid references public.tms_products (id) on delete set null,
  value numeric(12, 2) not null default 0,
  stage text not null default 'new' check (stage in ('new', 'contacted', 'proposal', 'negotiation', 'won', 'lost')),
  owner_id uuid references auth.users (id) on delete set null,
  expected_close date,
  lost_reason text,
  notes text,
  closed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tms_opportunities_company_idx on public.tms_opportunities (company_id);
create index if not exists tms_opportunities_stage_idx on public.tms_opportunities (stage);

-- ---------------------------------------------------------------------------------------------
-- Cases (work) and Customer Service cases
-- ---------------------------------------------------------------------------------------------
create sequence if not exists tms_private.case_number_seq start 1001;
grant usage on sequence tms_private.case_number_seq to authenticated;

create table if not exists public.tms_cases (
  id uuid primary key default gen_random_uuid(),
  number integer not null default nextval('tms_private.case_number_seq') unique,
  kind text not null default 'work' check (kind in ('work', 'customer_service')),
  company_id uuid references public.tms_companies (id) on delete cascade,
  title text not null,
  -- work: the service (dispatch, dot_compliance…); customer service: overcharge, service,
  -- dispatcher, safety_manager, suggestion, other
  category text,
  status text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  owner_id uuid references auth.users (id) on delete set null,
  opportunity_id uuid references public.tms_opportunities (id) on delete set null,
  invoice_id uuid references public.tms_invoices (id) on delete set null,
  description text,
  resolution text,
  due_date date,
  closed_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tms_cases_company_idx on public.tms_cases (company_id);
create index if not exists tms_cases_kind_status_idx on public.tms_cases (kind, status);

create table if not exists public.tms_case_entries (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.tms_cases (id) on delete cascade,
  kind text not null default 'note' check (kind in ('note', 'work', 'expense')),
  body text,
  -- work: time spent; expense: amount and date
  minutes integer,
  amount numeric(12, 2),
  spent_on date,
  attachments jsonb not null default '[]'::jsonb,
  actor_id uuid default auth.uid(),
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists tms_case_entries_case_idx on public.tms_case_entries (case_id, created_at);

drop trigger if exists tms_case_entries_actor_trg on public.tms_case_entries;
create trigger tms_case_entries_actor_trg before insert on public.tms_case_entries
  for each row execute function tms_private.fill_event_actor();

-- updated_at
do $$
declare t text;
begin
  foreach t in array array['tms_products', 'tms_templates', 'tms_opportunities', 'tms_cases'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated', t);
    execute format('create trigger %I before update on public.%I for each row execute function tms_private.touch_updated_at()', t || '_updated', t);
  end loop;
end $$;

-- closed_at follows the status / stage
create or replace function tms_private.stamp_closed()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'tms_cases' then
    if new.status = 'closed' and (tg_op = 'INSERT' or old.status is distinct from 'closed') then new.closed_at := now();
    elsif new.status <> 'closed' then new.closed_at := null; end if;
  else
    if new.stage in ('won', 'lost') and (tg_op = 'INSERT' or old.stage is distinct from new.stage) then new.closed_at := now();
    elsif new.stage not in ('won', 'lost') then new.closed_at := null; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists tms_cases_closed on public.tms_cases;
create trigger tms_cases_closed before insert or update of status on public.tms_cases for each row execute function tms_private.stamp_closed();
drop trigger if exists tms_opportunities_closed on public.tms_opportunities;
create trigger tms_opportunities_closed before insert or update of stage on public.tms_opportunities for each row execute function tms_private.stamp_closed();

-- ---------------------------------------------------------------------------------------------
-- Timeline: cases, opportunities and "became a client" show on the company's Timeline
-- ---------------------------------------------------------------------------------------------
alter table public.tms_company_events drop constraint if exists tms_company_events_kind_check;
alter table public.tms_company_events add constraint tms_company_events_kind_check
  check (kind in ('created', 'note', 'document', 'service', 'status', 'update', 'case', 'sale'));

create or replace function tms_private.log_case_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  label text := case when new.kind = 'customer_service' then 'Customer service case' else 'Case' end;
  st constant jsonb := '{"open":"Open","in_progress":"In progress","waiting":"Waiting","closed":"Closed"}';
begin
  if new.company_id is null then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.company_id, 'case', label || ' #' || new.number || ' opened: ' || new.title, tms_private.actor_name());
  elsif new.status is distinct from old.status then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.company_id, 'case', label || ' #' || new.number || ' ' || lower(st ->> new.status) || ': ' || new.title
      || case when new.status = 'closed' and coalesce(new.resolution, '') <> '' then ' — ' || new.resolution else '' end, tms_private.actor_name());
  end if;
  return new;
end;
$$;
drop trigger if exists tms_cases_events_trg on public.tms_cases;
create trigger tms_cases_events_trg after insert or update of status on public.tms_cases
  for each row execute function tms_private.log_case_event();

create or replace function tms_private.log_opportunity_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  st constant jsonb := '{"new":"New","contacted":"Contacted","proposal":"Proposal","negotiation":"Negotiation","won":"Won","lost":"Lost"}';
  v text := case when new.value > 0 then ' ($' || to_char(new.value, 'FM999,999,990.00') || ')' else '' end;
begin
  if tg_op = 'INSERT' then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.company_id, 'sale', 'Opportunity added: ' || new.title || v, tms_private.actor_name());
  elsif new.stage is distinct from old.stage then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.company_id, 'sale', 'Opportunity ' || lower(st ->> new.stage) || ': ' || new.title || v
      || case when new.stage = 'lost' and coalesce(new.lost_reason, '') <> '' then ' — ' || new.lost_reason else '' end, tms_private.actor_name());
  end if;
  return new;
end;
$$;
drop trigger if exists tms_opportunities_events_trg on public.tms_opportunities;
create trigger tms_opportunities_events_trg after insert or update of stage on public.tms_opportunities
  for each row execute function tms_private.log_opportunity_event();

-- Lead → client
create or replace function tms_private.log_stage_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.id, 'status', case when new.stage = 'client' then 'Became a client' else 'Moved back to lead' end, tms_private.actor_name());
  end if;
  return new;
end;
$$;
drop trigger if exists tms_companies_stage_event on public.tms_companies;
create trigger tms_companies_stage_event after update of stage on public.tms_companies
  for each row execute function tms_private.log_stage_event();

-- ---------------------------------------------------------------------------------------------
-- Access: TOSS Cloud members
-- ---------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['tms_products', 'tms_templates', 'tms_opportunities', 'tms_cases', 'tms_case_entries'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select tms_private.is_member())) with check ((select tms_private.is_member()))', t || '_all', t);
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
