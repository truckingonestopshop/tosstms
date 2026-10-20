-- Trailer photos: one document type per photo slot, so photos live with the trailer's
-- files (private bucket, signed links) and can be filtered by slot.
-- TMS tables only; nothing in TOSS Leads is touched.
insert into public.tms_doc_types (key, name, scope, is_default, required_from, has_expiry, in_packet, sort) values
  ('trailer_photo_side', 'Photo · Exterior side views', 'trailer', true, null, false, false, 200),
  ('trailer_photo_reefer_unit', 'Photo · Reefer unit exterior', 'trailer', true, null, false, false, 201),
  ('trailer_photo_interior', 'Photo · Interior', 'trailer', true, null, false, false, 202),
  ('trailer_photo_rear', 'Photo · Exterior rear', 'trailer', true, null, false, false, 203),
  ('trailer_photo_air_chute', 'Photo · Reefer air chute (interior)', 'trailer', true, null, false, false, 204),
  ('trailer_photo_plate', 'Photo · License plate', 'trailer', true, null, false, false, 205)
on conflict (key) do nothing;
