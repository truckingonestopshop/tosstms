-- Only owners delete carriers (already so), drivers, trucks and trailers. Everyone on the team can
-- still add and change them.

do $$
declare t text;
begin
  foreach t in array array['tms_drivers', 'tms_trucks', 'tms_trailers'] loop
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_read', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select tms_private.is_member()))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select tms_private.is_member()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select tms_private.is_member())) with check ((select tms_private.is_member()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select tms_private.is_owner()))', t || '_delete', t);
  end loop;
end $$;
