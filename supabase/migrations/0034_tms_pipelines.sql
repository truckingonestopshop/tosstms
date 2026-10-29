-- Sales, GHL-style: pipelines with their own stages (add / rename / reorder / delete, a color, a win %
-- and a "too long after X days" limit), and opportunities that have a stage AND a status
-- (open / won / lost / abandoned) with a lost reason from an editable list. Opportunities get
-- products as line items, followers, source, tags, custom fields, tasks, a notes + history timeline,
-- and agreements (draft → sent → signed). TMS tables only.

-- ---- pipelines & stages -------------------------------------------------------------------------
create table if not exists public.tms_pipelines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tms_pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references public.tms_pipelines (id) on delete cascade,
  name text not null,
  color text,
  sort integer not null default 0,
  probability integer not null default 0 check (probability between 0 and 100),
  rot_days integer check (rot_days is null or rot_days > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tms_pipeline_stages_pipeline_idx on public.tms_pipeline_stages (pipeline_id, sort);

create table if not exists public.tms_lost_reasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Opportunity custom fields (same idea as Accounting's).
create table if not exists public.tms_opportunity_fields (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  type text not null default 'text' check (type in ('text', 'number', 'date', 'boolean', 'select')),
  options text[] not null default '{}',
  required boolean not null default false,
  sort integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- opportunities: new columns ------------------------------------------------------------------
alter table public.tms_opportunities add column if not exists pipeline_id uuid references public.tms_pipelines (id) on delete set null;
alter table public.tms_opportunities add column if not exists stage_id uuid references public.tms_pipeline_stages (id) on delete set null;
alter table public.tms_opportunities add column if not exists status text not null default 'open';
alter table public.tms_opportunities drop constraint if exists tms_opportunities_status_check;
alter table public.tms_opportunities add constraint tms_opportunities_status_check check (status in ('open', 'won', 'lost', 'abandoned'));
alter table public.tms_opportunities add column if not exists lost_reason_id uuid references public.tms_lost_reasons (id) on delete set null;
alter table public.tms_opportunities add column if not exists source text;
alter table public.tms_opportunities add column if not exists contact_name text;
alter table public.tms_opportunities add column if not exists tags text[] not null default '{}';
alter table public.tms_opportunities add column if not exists followers uuid[] not null default '{}';
alter table public.tms_opportunities add column if not exists custom jsonb not null default '{}'::jsonb;
alter table public.tms_opportunities add column if not exists stage_entered_at timestamptz not null default now();
create index if not exists tms_opportunities_pipeline_idx on public.tms_opportunities (pipeline_id, stage_id);
create index if not exists tms_opportunities_status_idx on public.tms_opportunities (status);

-- Products on an opportunity (the value adds up from them).
create table if not exists public.tms_opportunity_items (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.tms_opportunities (id) on delete cascade,
  product_id uuid references public.tms_products (id) on delete set null,
  name text not null,
  service text not null default 'other',
  kind text not null default 'one_time' check (kind in ('subscription', 'one_time')),
  billing_interval text check (billing_interval in ('weekly', 'monthly', 'quarterly', 'yearly')),
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists tms_opportunity_items_opp_idx on public.tms_opportunity_items (opportunity_id);

-- Follow-ups.
create table if not exists public.tms_opportunity_tasks (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.tms_opportunities (id) on delete cascade,
  title text not null,
  due_date date,
  assignee uuid references auth.users (id) on delete set null,
  done boolean not null default false,
  done_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tms_opportunity_tasks_opp_idx on public.tms_opportunity_tasks (opportunity_id);

-- Notes and history (stage / status changes) on an opportunity.
create table if not exists public.tms_opportunity_events (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.tms_opportunities (id) on delete cascade,
  kind text not null check (kind in ('created', 'stage', 'status', 'note', 'update')),
  message text,
  from_stage_id uuid,
  to_stage_id uuid,
  attachments jsonb not null default '[]'::jsonb,
  actor_id uuid default auth.uid(),
  actor_name text,
  created_at timestamptz not null default now()
);
create index if not exists tms_opportunity_events_opp_idx on public.tms_opportunity_events (opportunity_id, created_at);
drop trigger if exists tms_opportunity_events_actor_trg on public.tms_opportunity_events;
create trigger tms_opportunity_events_actor_trg before insert on public.tms_opportunity_events
  for each row execute function tms_private.fill_event_actor();

-- Agreements made from a template for a company / opportunity.
create table if not exists public.tms_agreements (
  id uuid primary key default gen_random_uuid(),
  template_id uuid references public.tms_templates (id) on delete set null,
  company_id uuid references public.tms_companies (id) on delete cascade,
  opportunity_id uuid references public.tms_opportunities (id) on delete set null,
  title text not null,
  body text not null default '',
  status text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'void')),
  sent_at timestamptz,
  signed_at timestamptz,
  -- the signed copy: { path, name, mime } in the tms-docs bucket
  signed_file jsonb,
  invoice_id uuid references public.tms_invoices (id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tms_agreements_company_idx on public.tms_agreements (company_id);

-- ---- default pipeline, and the existing opportunities moved into it -------------------------------
do $$
declare
  p uuid;
  s_new uuid; s_contacted uuid; s_proposal uuid; s_neg uuid;
begin
  if not exists (select 1 from public.tms_pipelines) then
    insert into public.tms_pipelines (name, sort) values ('Sales', 0) returning id into p;
    insert into public.tms_pipeline_stages (pipeline_id, name, color, sort, probability, rot_days) values (p, 'New', '#a1a1aa', 0, 10, 7) returning id into s_new;
    insert into public.tms_pipeline_stages (pipeline_id, name, color, sort, probability, rot_days) values (p, 'Contacted', '#0ea5e9', 1, 25, 7) returning id into s_contacted;
    insert into public.tms_pipeline_stages (pipeline_id, name, color, sort, probability, rot_days) values (p, 'Proposal', '#8b5cf6', 2, 50, 10) returning id into s_proposal;
    insert into public.tms_pipeline_stages (pipeline_id, name, color, sort, probability, rot_days) values (p, 'Negotiation', '#f59e0b', 3, 75, 14) returning id into s_neg;
    update public.tms_opportunities set
      pipeline_id = p,
      stage_id = case stage when 'new' then s_new when 'contacted' then s_contacted when 'proposal' then s_proposal else s_neg end,
      status = case stage when 'won' then 'won' when 'lost' then 'lost' else 'open' end
    where pipeline_id is null;
  end if;
end $$;

insert into public.tms_lost_reasons (name, sort)
select v.name, v.sort from (values ('Price too high', 10), ('Went with a competitor', 20), ('No response', 30), ('Not a fit', 40), ('Bad timing', 50), ('Other', 60)) v(name, sort)
 where not exists (select 1 from public.tms_lost_reasons);

-- The old fixed stage column is replaced by pipeline stages + status.
drop trigger if exists tms_opportunities_closed on public.tms_opportunities;
drop trigger if exists tms_opportunities_events_trg on public.tms_opportunities;
alter table public.tms_opportunities drop constraint if exists tms_opportunities_stage_check;
alter table public.tms_opportunities drop column if exists stage;

-- ---- triggers --------------------------------------------------------------------------------------
-- closed_at follows the status; stage_entered_at follows the stage.
create or replace function tms_private.opportunity_stamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status <> 'open' and (tg_op = 'INSERT' or old.status is distinct from new.status) then new.closed_at := now();
  elsif new.status = 'open' then new.closed_at := null; end if;
  if tg_op = 'INSERT' or old.stage_id is distinct from new.stage_id then new.stage_entered_at := now(); end if;
  return new;
end;
$$;
drop trigger if exists tms_opportunities_stamps on public.tms_opportunities;
create trigger tms_opportunities_stamps before insert or update of status, stage_id on public.tms_opportunities
  for each row execute function tms_private.opportunity_stamps();

-- History on the opportunity, and the company's Timeline.
create or replace function tms_private.log_opportunity_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v text := case when new.value > 0 then ' ($' || to_char(new.value, 'FM999,999,990.00') || ')' else '' end;
  ref text := 'OPP-' || new.number || ' ' || new.title;
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
    values (new.id, 'status', 'Marked ' || new.status || case when new.status = 'lost' and reason is not null then ': ' || reason else '' end, tms_private.actor_name());
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.company_id, 'sale', 'Opportunity ' || new.status || ': ' || ref || v || case when new.status = 'lost' and reason is not null then ' — ' || reason else '' end, tms_private.actor_name());
  end if;
  return new;
end;
$$;
create trigger tms_opportunities_events_trg after insert or update of stage_id, status on public.tms_opportunities
  for each row execute function tms_private.log_opportunity_event();

-- Agreement status stamps.
create or replace function tms_private.agreement_stamps()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'sent' and new.sent_at is null then new.sent_at := now(); end if;
  if new.status = 'signed' and new.signed_at is null then new.signed_at := now(); end if;
  if new.status <> 'signed' then new.signed_at := null; end if;
  return new;
end;
$$;
drop trigger if exists tms_agreements_stamps on public.tms_agreements;
create trigger tms_agreements_stamps before insert or update of status on public.tms_agreements
  for each row execute function tms_private.agreement_stamps();

-- Agreements on the company Timeline.
create or replace function tms_private.log_agreement_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.company_id is null then return new; end if;
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.company_id, 'sale', 'Agreement ' || case new.status when 'draft' then 'drafted' else new.status end || ': ' || new.title, tms_private.actor_name());
  end if;
  return new;
end;
$$;
drop trigger if exists tms_agreements_events_trg on public.tms_agreements;
create trigger tms_agreements_events_trg after insert or update of status on public.tms_agreements
  for each row execute function tms_private.log_agreement_event();

-- updated_at, access, live updates
do $$
declare t text;
begin
  foreach t in array array['tms_pipelines', 'tms_pipeline_stages', 'tms_opportunity_fields', 'tms_opportunity_tasks', 'tms_agreements'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_updated', t);
    execute format('create trigger %I before update on public.%I for each row execute function tms_private.touch_updated_at()', t || '_updated', t);
  end loop;
  foreach t in array array['tms_pipelines', 'tms_pipeline_stages', 'tms_lost_reasons', 'tms_opportunity_fields', 'tms_opportunity_items', 'tms_opportunity_tasks', 'tms_opportunity_events', 'tms_agreements'] loop
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
