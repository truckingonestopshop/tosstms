-- Truck photos: one document type per photo slot (like trailer photos, migration 0008), so
-- photos live with the truck's files (private bucket, signed links) and can be filtered by slot.
insert into public.tms_doc_types (key, name, scope, is_default, required_from, has_expiry, in_packet, sort) values
  ('truck_photo_side', 'Photo · Truck exterior side views', 'truck', true, null, false, false, 200),
  ('truck_photo_front', 'Photo · Truck exterior front view', 'truck', true, null, false, false, 201)
on conflict (key) do nothing;
