-- Companies as a CRM: a company is a lead (prospect, e.g. sent from TOSS Lead Hunter) or a client
-- (customer; GoHighLevel "Customer" or set by the team). Every existing carrier is a client.
-- became_client_at records when a lead turned into a client. TMS tables only.

alter table public.tms_companies add column if not exists stage text not null default 'client';
alter table public.tms_companies drop constraint if exists tms_companies_stage_check;
alter table public.tms_companies add constraint tms_companies_stage_check check (stage in ('lead', 'client'));
alter table public.tms_companies add column if not exists became_client_at timestamptz;

-- Stamp the moment a lead becomes a client (any path: form, GHL, Lead Hunter).
create or replace function tms_private.company_stage_stamp()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.stage = 'client' and (tg_op = 'INSERT' or old.stage is distinct from 'client') and new.became_client_at is null then
    new.became_client_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists tms_companies_stage_stamp on public.tms_companies;
create trigger tms_companies_stage_stamp before insert or update of stage on public.tms_companies
  for each row execute function tms_private.company_stage_stamp();

-- Existing clients: client since they were added.
update public.tms_companies set became_client_at = created_at where stage = 'client' and became_client_at is null;

create index if not exists tms_companies_stage_idx on public.tms_companies (stage);

notify pgrst, 'reload schema';
