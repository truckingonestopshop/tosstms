-- Phone numbers read (XXX) XXX-XXXX everywhere, however they were typed or imported (GHL, Lead
-- Hunter). 10 digits, or 11 starting with 1, are formatted; anything else (other countries,
-- extensions) is kept as typed.

create or replace function tms_private.fmt_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p is null or btrim(p) = '' then p
    when length(regexp_replace(p, '\D', '', 'g')) = 11 and left(regexp_replace(p, '\D', '', 'g'), 1) = '1'
      then regexp_replace(right(regexp_replace(p, '\D', '', 'g'), 10), '^(\d{3})(\d{3})(\d{4})$', '(\1) \2-\3')
    when length(regexp_replace(p, '\D', '', 'g')) = 10
      then regexp_replace(regexp_replace(p, '\D', '', 'g'), '^(\d{3})(\d{3})(\d{4})$', '(\1) \2-\3')
    else btrim(p)
  end;
$$;

create or replace function tms_private.format_phones()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  col text;
  v jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    if v ? col then
      v := jsonb_set(v, array[col], to_jsonb(tms_private.fmt_phone(v ->> col)));
    end if;
  end loop;
  return jsonb_populate_record(new, v);
end;
$$;

drop trigger if exists tms_drivers_phone on public.tms_drivers;
create trigger tms_drivers_phone before insert or update of phone on public.tms_drivers
  for each row execute function tms_private.format_phones('phone');
drop trigger if exists tms_companies_phone on public.tms_companies;
create trigger tms_companies_phone before insert or update of contact_phone, secondary_phone on public.tms_companies
  for each row execute function tms_private.format_phones('contact_phone', 'secondary_phone');
drop trigger if exists tms_loads_phone on public.tms_loads;
create trigger tms_loads_phone before insert or update of broker_phone on public.tms_loads
  for each row execute function tms_private.format_phones('broker_phone');
drop trigger if exists tms_members_phone on public.tms_members;
create trigger tms_members_phone before insert or update of phone on public.tms_members
  for each row execute function tms_private.format_phones('phone');

-- Today's numbers (as the server: the member guard only lets owners change member rows). The
-- timeline triggers are paused so the reformat doesn't show up as changes on companies and loads.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
alter table public.tms_companies disable trigger tms_companies_events_trg;
alter table public.tms_companies disable trigger tms_companies_stage_event;
alter table public.tms_loads disable trigger tms_loads_events_trg;
update public.tms_drivers set phone = phone where phone is not null and phone is distinct from tms_private.fmt_phone(phone);
update public.tms_companies set contact_phone = contact_phone, secondary_phone = secondary_phone
 where contact_phone is distinct from tms_private.fmt_phone(contact_phone) or secondary_phone is distinct from tms_private.fmt_phone(secondary_phone);
update public.tms_loads set broker_phone = broker_phone where broker_phone is not null and broker_phone is distinct from tms_private.fmt_phone(broker_phone);
update public.tms_members set phone = phone where phone is not null and phone is distinct from tms_private.fmt_phone(phone);
alter table public.tms_companies enable trigger tms_companies_events_trg;
alter table public.tms_companies enable trigger tms_companies_stage_event;
alter table public.tms_loads enable trigger tms_loads_events_trg;
