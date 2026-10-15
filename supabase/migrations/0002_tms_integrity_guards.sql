-- TOSS TMS — integrity guards (applied 2026-10-15)

-- The TOSS fee is always gross x fee %, whatever a client sends.
create or replace function tms_private.load_fee()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.dispatcher_cut := round(coalesce(new.gross_amount, 0) * coalesce(new.commission_percent, 0) / 100, 2);
  return new;
end;
$$;
drop trigger if exists tms_loads_fee_trg on public.tms_loads;
create trigger tms_loads_fee_trg
  before insert or update of gross_amount, commission_percent, dispatcher_cut on public.tms_loads
  for each row execute function tms_private.load_fee();

-- The team can never be left without an owner.
create or replace function tms_private.keep_an_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner')
     and not exists (select 1 from public.tms_members m where m.role = 'owner' and m.user_id <> old.user_id) then
    raise exception 'The team needs at least one owner' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
drop trigger if exists tms_members_owner_trg on public.tms_members;
create trigger tms_members_owner_trg
  before update of role or delete on public.tms_members
  for each row execute function tms_private.keep_an_owner();
