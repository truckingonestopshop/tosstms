-- Some state permits have no expiration date: the date is optional for them (it still shows
-- and reminds when one is entered). IFTA and UCR keep asking for theirs. TMS tables only.
alter table public.tms_doc_types disable trigger tms_doc_types_guard;
update public.tms_doc_types set has_expiry = false
 where key in ('ny_hut_permit', 'nm_state_permit', 'ky_state_permit', 'or_state_permit', 'ct_state_permit');
alter table public.tms_doc_types enable trigger tms_doc_types_guard;
