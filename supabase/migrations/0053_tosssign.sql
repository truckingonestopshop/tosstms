-- TossSign: our own DocuSign (see docs/research-esignature.md).
--   Recipients: signer, needs to view, approver, copy; signing in person on this device.
--   Verification before opening: an access code, or a one-time code emailed to them.
--   Reminders every N days until done (sent by /api/sign/cron).
--   Public links: anyone with the link fills and signs a template (driver application, W-9…).
--   The signed PDF gets a digital seal; the key lives only in tms_private (never sent out).

-- ---- Recipients --------------------------------------------------------------------------------
alter table public.tms_sign_recipients drop constraint if exists tms_sign_recipients_kind_check;
alter table public.tms_sign_recipients add constraint tms_sign_recipients_kind_check check (kind in ('signer', 'viewer', 'approver', 'cc'));
alter table public.tms_sign_recipients drop constraint if exists tms_sign_recipients_status_check;
alter table public.tms_sign_recipients add constraint tms_sign_recipients_status_check check (status in ('waiting', 'sent', 'viewed', 'signed', 'declined'));
alter table public.tms_sign_recipients
  -- none | code (an access code TOSS gives them) | email (a one-time code emailed when they open it)
  add column if not exists verify text not null default 'none' check (verify in ('none', 'code', 'email')),
  add column if not exists access_code text,
  add column if not exists otp_hash text,
  add column if not exists otp_expires_at timestamptz,
  add column if not exists verified_at timestamptz,
  -- signs on the sender's device (in person): no link is emailed
  add column if not exists in_person boolean not null default false,
  -- files the signer attached: [{ fieldId, name, path, mime }]
  add column if not exists files jsonb not null default '[]'::jsonb;

-- ---- Requests: reminders -------------------------------------------------------------------------
alter table public.tms_sign_requests
  add column if not exists remind_every_days integer check (remind_every_days is null or remind_every_days between 1 and 30),
  add column if not exists last_reminded_at timestamptz,
  add column if not exists sealed boolean not null default false;

-- ---- Public links ------------------------------------------------------------------------------
create table if not exists public.tms_sign_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  title text not null,
  template_id uuid references public.tms_sign_templates (id) on delete set null,
  -- the carrier the signed copies are filed on (e.g. its driver application link); null = TOSS
  company_id uuid references public.tms_companies (id) on delete cascade,
  doc_type text,
  -- the document as it is signed (written templates are made a PDF when the link is created)
  file_path text not null,
  file_name text not null,
  pages jsonb not null default '[]'::jsonb,
  roles jsonb not null default '[]'::jsonb,
  fields jsonb not null default '[]'::jsonb,
  values jsonb not null default '{}'::jsonb,
  -- ask the visitor to confirm their email with a one-time code first
  verify_email boolean not null default false,
  active boolean not null default true,
  uses integer not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.tms_sign_requests add column if not exists link_id uuid references public.tms_sign_links (id) on delete set null;

alter table public.tms_sign_links enable row level security;
drop policy if exists tms_sign_links_all on public.tms_sign_links;
create policy tms_sign_links_all on public.tms_sign_links for all to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));
do $$
begin
  alter publication supabase_realtime add table public.tms_sign_links;
exception when duplicate_object then null;
end $$;

-- ---- The seal's key (server only) --------------------------------------------------------------
create table if not exists tms_private.sign_keys (
  id text primary key default 'default',
  p12_base64 text not null,
  passphrase text not null,
  subject text not null,
  created_at timestamptz not null default now()
);
revoke all on tms_private.sign_keys from public, anon, authenticated;
grant select, insert on tms_private.sign_keys to service_role;

-- The server reads / stores the key through these (tms_private isn't exposed to the API).
create or replace function public.tms_sign_key_get()
returns table (p12_base64 text, passphrase text, subject text)
language sql stable security definer set search_path = '' as $$
  select k.p12_base64, k.passphrase, k.subject from tms_private.sign_keys k where k.id = 'default';
$$;
create or replace function public.tms_sign_key_put(p12 text, pass text, subj text)
returns void language sql security definer set search_path = '' as $$
  insert into tms_private.sign_keys (id, p12_base64, passphrase, subject) values ('default', p12, pass, subj)
  on conflict (id) do nothing;
$$;
revoke all on function public.tms_sign_key_get() from public, anon, authenticated;
revoke all on function public.tms_sign_key_put(text, text, text) from public, anon, authenticated;
grant execute on function public.tms_sign_key_get() to service_role;
grant execute on function public.tms_sign_key_put(text, text, text) to service_role;

notify pgrst, 'reload schema';
