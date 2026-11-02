-- Agreements are sent for signing (Signing), not chased as required paperwork: none of them
-- shows on a carrier's Required paperwork, Pending or the to-dos.
update public.tms_doc_types set required_from = null
where key in ('dispatch_agreement', 'dot_compliance_agreement', 'factoring_agreement', 'driver_agreement');
