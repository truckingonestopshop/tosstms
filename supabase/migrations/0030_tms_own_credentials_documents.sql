-- TOSS's own Credentials and Documents (menu sections), apart from each carrier's.
--  * Credentials: the same encrypted store (tms_private.vault_items); company_id null = TOSS's own
--    master accounts / logins. Same view, same encryption, same dispatch-only rule.
--  * Documents: TOSS company files (agreements, licenses, insurance, forms) in folders, in their own
--    table so they never mix with carrier paperwork (Pending, Services, company cards).
-- TMS tables only.

alter table tms_private.vault_items alter column company_id drop not null;

create table if not exists public.tms_own_documents (
  id uuid primary key default gen_random_uuid(),
  folder text not null default 'General',
  name text not null,
  file_path text not null,
  file_name text not null,
  file_size bigint,
  mime_type text,
  expires_on date,
  notes text,
  uploaded_by uuid default auth.uid(),
  uploaded_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists tms_own_documents_folder_idx on public.tms_own_documents (folder);

alter table public.tms_own_documents enable row level security;
drop policy if exists tms_own_documents_all on public.tms_own_documents;
create policy tms_own_documents_all on public.tms_own_documents for all to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));

do $$ begin
  alter publication supabase_realtime add table public.tms_own_documents;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
