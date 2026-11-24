-- Inbox: every call and text (Kixie) and every email (Resend) with a customer, in one place.
--
-- Kixie sends TOSS a webhook when a call ends, when the agent picks the call outcome
-- (disposition) and for every text in or out. Each lands here as one row per call / message,
-- matched to the carrier by phone number. Call recordings are copied into the tms-docs bucket
-- (calls/<call id>.mp3), so they're kept in TOSS as well as in Kixie.
-- Rows are written by the server only (service role); members read them and mark them read.

-- The email each member signs in to Kixie with (Make a Call / SMS need it). Empty = their TOSS email.
alter table public.tms_members add column if not exists kixie_email text;

create table if not exists public.tms_comms (
  id              uuid primary key default gen_random_uuid(),
  channel         text not null check (channel in ('call', 'sms', 'email')),
  direction       text not null check (direction in ('inbound', 'outbound')),
  -- the customer's side: a phone in E.164 (+13105551234) or a lowercase email
  contact         text not null,
  contact_name    text,
  company_id      uuid references public.tms_companies (id) on delete set null,
  -- our side: the Kixie business number or our sending address
  our_address     text,
  -- the TOSS member who called / texted / emailed (tms_members.user_id), when known
  member_id       uuid,
  agent_email     text,
  subject         text,
  body            text,
  -- call: answered / missed / voicemail …; text and email: sent / received / failed
  status          text,
  duration_sec    integer,
  -- Kixie's recording, and TOSS's own copy (tms-docs bucket)
  recording_url   text,
  recording_path  text,
  -- the call outcome the agent picked in Kixie, and their note
  disposition     text,
  outcome_note    text,
  invoice_id      uuid references public.tms_invoices (id) on delete set null,
  sign_request_id uuid references public.tms_sign_requests (id) on delete set null,
  -- Kixie call id / message id, Resend email id
  external_id     text,
  error           text,
  raw             jsonb,
  read_at         timestamptz,
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists tms_comms_external_idx on public.tms_comms (channel, external_id) where external_id is not null;
create index if not exists tms_comms_contact_idx on public.tms_comms (contact, occurred_at desc);
create index if not exists tms_comms_company_idx on public.tms_comms (company_id, occurred_at desc);
create index if not exists tms_comms_time_idx on public.tms_comms (occurred_at desc);

drop trigger if exists tms_comms_updated on public.tms_comms;
create trigger tms_comms_updated before update on public.tms_comms
  for each row execute function tms_private.touch_updated_at();

alter table public.tms_comms enable row level security;
drop policy if exists tms_comms_read on public.tms_comms;
create policy tms_comms_read on public.tms_comms for select to authenticated
  using ((select tms_private.is_member()));
-- members mark conversations read and link a conversation to a carrier
drop policy if exists tms_comms_update on public.tms_comms;
create policy tms_comms_update on public.tms_comms for update to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));

do $$
begin
  alter publication supabase_realtime add table public.tms_comms;
exception when duplicate_object then null;
end $$;

-- A private link to view and download an invoice without signing in (sent by text and email).
alter table public.tms_invoices add column if not exists public_token text;
update public.tms_invoices
  set public_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
  where public_token is null;
alter table public.tms_invoices
  alter column public_token set default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
create unique index if not exists tms_invoices_public_token_idx on public.tms_invoices (public_token);

-- Calls, texts and emails show on the carrier's timeline.
alter table public.tms_company_events drop constraint if exists tms_company_events_kind_check;
alter table public.tms_company_events add constraint tms_company_events_kind_check
  check (kind in ('created', 'note', 'document', 'service', 'status', 'update', 'case', 'sale', 'call', 'sms', 'email'));

notify pgrst, 'reload schema';
