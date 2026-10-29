-- Pending: reminders the team turned off (an expiring / missing document they don't need to be
-- told about), with the reason, who did it, and optionally until when. TMS tables only.
--
-- key identifies the reminder, e.g. "driver:<id>:medical_card:<document id>" — it includes the
-- document, so a renewed document gets its own reminders again.

create table if not exists public.tms_reminder_mutes (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  company_id uuid references public.tms_companies(id) on delete cascade,
  label text not null,               -- what the reminder said, kept for the "Turned off" list
  reason text not null check (length(trim(reason)) > 0),
  until date,                        -- null = off for good
  created_by uuid default auth.uid(),
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists tms_reminder_mutes_company_idx on public.tms_reminder_mutes (company_id);

alter table public.tms_reminder_mutes enable row level security;
drop policy if exists tms_reminder_mutes_all on public.tms_reminder_mutes;
create policy tms_reminder_mutes_all on public.tms_reminder_mutes for all to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));

do $$ begin
  alter publication supabase_realtime add table public.tms_reminder_mutes;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
