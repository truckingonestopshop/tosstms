-- Incoming money from investments, loans and company profits, and a category for computers and
-- equipment. Added next to the existing categories (nothing is changed or removed); skipped if a
-- category with the same name already exists.

insert into public.acc_categories (name, kind, color, sort)
select v.name, v.kind, v.color, v.sort
  from (values
    ('Company profits', 'income', '#15803d', 31),
    ('Investment', 'income', '#0ea5e9', 32),
    ('Loan', 'income', '#f59e0b', 33),
    ('Equipment & computers', 'expense', '#0891b2', 45)
  ) as v(name, kind, color, sort)
 where not exists (select 1 from public.acc_categories c where lower(c.name) = lower(v.name) and c.kind = v.kind);
