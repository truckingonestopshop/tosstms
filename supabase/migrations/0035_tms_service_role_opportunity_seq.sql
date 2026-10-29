-- Lead Hunter's "Send to TOSS" (server, service role) starts new leads as opportunities.
grant usage on schema tms_private to service_role;
grant usage, select on sequence tms_private.opportunity_number_seq to service_role;
