-- "IRP Cab Card" duplicated the required "Truck Registration (Cab Card)" (key registration):
-- trucks showed two cab-card slots and cab-card files went to the optional one, leaving the
-- registration "missing". Retire it when nothing uses it. TMS tables only.

delete from public.tms_doc_types t
where t.key = 'cab_card'
  and not exists (select 1 from public.tms_documents d where d.doc_type = 'cab_card');
