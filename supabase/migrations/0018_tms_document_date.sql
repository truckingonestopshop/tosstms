-- The date on the document itself (e.g. the day of a roadside inspection), apart from when it
-- was uploaded and when it expires. TMS tables only.
alter table public.tms_documents
  add column if not exists issued_on date;

notify pgrst, 'reload schema';
