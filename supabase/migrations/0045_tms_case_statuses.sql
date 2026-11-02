-- Case statuses follow the real work: a new case is Received, the owner moves it along, and
-- Completed / Cancelled close it (closed_at is stamped, the Timeline says so).

alter table public.tms_cases drop constraint if exists tms_cases_status_check;
update public.tms_cases set status = case status
  when 'open' then 'received'
  when 'in_progress' then 'ready_to_process'
  when 'waiting' then 'pending_documents'
  when 'closed' then 'completed'
  else status end;
alter table public.tms_cases alter column status set default 'received';
alter table public.tms_cases add constraint tms_cases_status_check check (status in (
  'received', 'pending_documents', 'pending_payment', 'submitted_not_approved', 'ready_to_process',
  'in_review', 'approved', 'completed', 'cancelled'));

create or replace function tms_private.stamp_closed()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_table_name = 'tms_cases' then
    if new.status in ('completed', 'cancelled') and (tg_op = 'INSERT' or old.status not in ('completed', 'cancelled')) then new.closed_at := now();
    elsif new.status not in ('completed', 'cancelled') then new.closed_at := null; end if;
  else
    if new.stage in ('won', 'lost') and (tg_op = 'INSERT' or old.stage is distinct from new.stage) then new.closed_at := now();
    elsif new.stage not in ('won', 'lost') then new.closed_at := null; end if;
  end if;
  return new;
end;
$$;

create or replace function tms_private.log_case_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  label text := case when new.kind = 'customer_service' then 'Customer service case' else 'Case' end;
  st constant jsonb := '{"received":"Received","pending_documents":"Pending documents - client","pending_payment":"Pending exchange payment","submitted_not_approved":"Submitted - not approved","ready_to_process":"Ready to process","in_review":"In review by the state","approved":"Approved by state","completed":"Completed","cancelled":"Cancelled"}';
begin
  if new.company_id is null then return new; end if;
  if tg_op = 'INSERT' then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.company_id, 'case', label || ' #' || new.number || ' opened: ' || new.title, tms_private.actor_name());
  elsif new.status is distinct from old.status then
    insert into public.tms_company_events (company_id, kind, message, actor_name)
    values (new.company_id, 'case', label || ' #' || new.number || ': ' || (st ->> new.status) || ' · ' || new.title
      || case when new.status in ('completed', 'cancelled') and coalesce(new.resolution, '') <> '' then ' — ' || new.resolution else '' end, tms_private.actor_name());
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
