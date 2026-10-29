-- TOSS Copilot in TOSS Cloud: each person's chats (private to them) and a log of every action
-- Copilot carried out after the person confirmed it (who, what, the exact input, the result).

create table if not exists public.tms_copilot_threads (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default 'Untitled chat',
  messages jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tms_copilot_threads_user_idx on public.tms_copilot_threads (user_id, updated_at desc);

create table if not exists public.tms_copilot_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  thread_id uuid,
  action text not null,
  input jsonb not null default '{}',
  result jsonb,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists tms_copilot_actions_created_idx on public.tms_copilot_actions (created_at desc);

alter table public.tms_copilot_threads enable row level security;
drop policy if exists tms_copilot_threads_own on public.tms_copilot_threads;
create policy tms_copilot_threads_own on public.tms_copilot_threads for all to authenticated
  using (user_id = (select auth.uid()) and (select tms_private.is_member()))
  with check (user_id = (select auth.uid()) and (select tms_private.is_member()));

alter table public.tms_copilot_actions enable row level security;
drop policy if exists tms_copilot_actions_read on public.tms_copilot_actions;
create policy tms_copilot_actions_read on public.tms_copilot_actions for select to authenticated
  using (user_id = (select auth.uid()) or (select tms_private.is_owner()));
drop policy if exists tms_copilot_actions_add on public.tms_copilot_actions;
create policy tms_copilot_actions_add on public.tms_copilot_actions for insert to authenticated
  with check (user_id = (select auth.uid()) and (select tms_private.is_member()));

notify pgrst, 'reload schema';
