-- Sales & Cases updates:
-- 1. Per-variant discount caps (discount_rep, discount_manager, discount_cro) on tms_product_variants.
-- 2. Update check_line_discount() to use the selected variant's discount caps when present.
-- 3. Only owners and sales managers/CROs may delete opportunities (agents/reps cannot delete lost opportunities).

alter table public.tms_product_variants
  add column if not exists discount_rep numeric(12, 2) check (discount_rep is null or discount_rep >= 0),
  add column if not exists discount_manager numeric(12, 2) check (discount_manager is null or discount_manager >= 0),
  add column if not exists discount_cro numeric(12, 2) check (discount_cro is null or discount_cro >= 0);

create or replace function tms_private.check_line_discount()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  lvl text;
  p public.tms_products;
  v public.tms_product_variants;
  rep_cap numeric;
  mgr_cap numeric;
  cro_cap numeric;
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
  if new.variant_id is not null then
    select * into v from public.tms_product_variants where id = new.variant_id;
  end if;
  rep_cap := coalesce(v.discount_rep, p.discount_rep, 0);
  mgr_cap := coalesce(v.discount_manager, p.discount_manager, 0);
  cro_cap := coalesce(v.discount_cro, p.discount_cro, 0);
  cap := rep_cap
    + case when lvl in ('manager', 'cro') then mgr_cap else 0 end
    + case when lvl = 'cro' then cro_cap else 0 end;
  if new.discount > cap then
    raise exception 'The most you can discount % is $%', p.name, to_char(cap, 'FM999,990.00') using errcode = '42501';
  end if;
  new.discount_by := (select auth.uid());
  return new;
end;
$$;

-- Restrict opportunity deletion to owners, managers, and CROs.
drop policy if exists tms_opportunities_all on public.tms_opportunities;
drop policy if exists tms_opportunities_select on public.tms_opportunities;
drop policy if exists tms_opportunities_insert on public.tms_opportunities;
drop policy if exists tms_opportunities_update on public.tms_opportunities;
drop policy if exists tms_opportunities_delete on public.tms_opportunities;

create policy tms_opportunities_select on public.tms_opportunities
  for select to authenticated
  using ((select tms_private.is_member()));

create policy tms_opportunities_insert on public.tms_opportunities
  for insert to authenticated
  with check ((select tms_private.is_member()));

create policy tms_opportunities_update on public.tms_opportunities
  for update to authenticated
  using ((select tms_private.is_member()))
  with check ((select tms_private.is_member()));

create policy tms_opportunities_delete on public.tms_opportunities
  for delete to authenticated
  using (
    exists (
      select 1 from public.tms_members m
      where m.user_id = (select auth.uid())
        and (m.role = 'owner' or m.sales_level in ('manager', 'cro'))
    )
  );

notify pgrst, 'reload schema';

