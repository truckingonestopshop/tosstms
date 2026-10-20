-- Driver names stay in step both ways: editing first / last rebuilds the full name; editing
-- only the full name (older screens) splits it into first / last.
create or replace function tms_private.driver_full_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and new.first_name is not distinct from old.first_name
     and new.last_name is not distinct from old.last_name then
    -- Only the full name was edited (older screens): keep first / last in step with it.
    if new.name is distinct from old.name then
      new.first_name := split_part(trim(new.name), ' ', 1);
      new.last_name := nullif(trim(substr(trim(new.name), length(split_part(trim(new.name), ' ', 1)) + 1)), '');
    end if;
    return new;
  end if;
  if new.first_name is not null or new.last_name is not null then
    new.name := coalesce(nullif(trim(concat_ws(' ', nullif(trim(new.first_name), ''), nullif(trim(new.last_name), ''))), ''), new.name, '');
  end if;
  return new;
end $$;
