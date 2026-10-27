-- Truck Map: map points for "City, ST" places (truck empty points, the broker's city), so the
-- same city is looked up on Mapbox once instead of on every visit. TMS tables only.

create table if not exists public.tms_geo_cache (
  key text primary key,            -- normalized "city, st" / ZIP
  lng double precision,            -- null = Mapbox found nothing
  lat double precision,
  updated_at timestamptz not null default now()
);

alter table public.tms_geo_cache enable row level security;
drop policy if exists tms_geo_cache_all on public.tms_geo_cache;
create policy tms_geo_cache_all on public.tms_geo_cache for all to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));

notify pgrst, 'reload schema';
