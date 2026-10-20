-- Invoices: billing adjustments (additional charges / credits), truck + miles on load
-- lines (shown under the lane), and the issuer's website + tagline for the letterhead.
-- TMS tables only; nothing in TOSS Leads is touched.

-- item = load fee or custom line; charge = added to the total; credit = taken off it
alter table public.tms_invoice_lines
  add column if not exists kind         text not null default 'item' check (kind in ('item', 'charge', 'credit')),
  add column if not exists truck_number text,
  add column if not exists loaded_miles numeric(10,1);

-- Existing load lines: copy the truck and miles from their load.
update public.tms_invoice_lines li set
  truck_number = coalesce(li.truck_number, t.unit_number),
  loaded_miles = coalesce(li.loaded_miles, l.loaded_miles)
from public.tms_loads l
left join public.tms_trucks t on t.id = l.truck_id
where li.load_id = l.id;

alter table public.tms_settings
  add column if not exists issuer_website text not null default 'www.truckingonestopshop.net',
  add column if not exists issuer_tagline text not null default 'All your trucking needs in one place';

alter table public.tms_invoices
  add column if not exists issuer_website text;

notify pgrst, 'reload schema';
