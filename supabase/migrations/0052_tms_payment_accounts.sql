-- Case expenses say which TOSS card / bank account paid. Accounting itself is for owners and the
-- people given it, so the team only gets this short list (name, kind, last 4) of active accounts.

create or replace function public.tms_payment_accounts()
returns table (id uuid, name text, kind text, last4 text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.name, a.kind, a.last4
  from public.acc_accounts a
  where a.active and (select tms_private.is_member())
  order by a.sort, a.name;
$$;
revoke all on function public.tms_payment_accounts() from public, anon;
grant execute on function public.tms_payment_accounts() to authenticated;

notify pgrst, 'reload schema';
