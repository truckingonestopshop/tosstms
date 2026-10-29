-- Opportunity # (shown as OPP-1001), so an opportunity can be found from the top search bar and
-- quoted on calls. Existing opportunities get numbers in the order they were added. TMS tables only.

create sequence if not exists tms_private.opportunity_number_seq start 1001;
grant usage on sequence tms_private.opportunity_number_seq to authenticated;

alter table public.tms_opportunities add column if not exists number integer;
update public.tms_opportunities o set number = n.num
  from (select id, 1000 + row_number() over (order by created_at) as num from public.tms_opportunities where number is null) n
 where o.id = n.id;
select setval('tms_private.opportunity_number_seq', greatest(1001, coalesce((select max(number) + 1 from public.tms_opportunities), 1001)), false);
alter table public.tms_opportunities alter column number set default nextval('tms_private.opportunity_number_seq');
alter table public.tms_opportunities alter column number set not null;
create unique index if not exists tms_opportunities_number_idx on public.tms_opportunities (number);

notify pgrst, 'reload schema';
