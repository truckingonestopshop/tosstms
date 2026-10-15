-- Where the truck is empty before the first pickup; deadhead miles are routed from here
-- and the map draws that leg. TMS table only (nothing in TOSS Leads is touched).
alter table public.tms_loads add column if not exists deadhead_from text;
comment on column public.tms_loads.deadhead_from is 'Where the truck is empty before the first pickup (City, ST); deadhead miles are routed from here.';
