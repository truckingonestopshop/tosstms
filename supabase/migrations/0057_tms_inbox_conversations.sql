-- Inbox, part 2 (like GoHighLevel's Conversations): each conversation can be assigned to a team
-- member, closed and reopened, starred; the team leaves internal notes in the thread; quick
-- replies (snippets) for texts and emails; live calls (ringing → on the call → ended).

-- one row per conversation (the customer's phone in E.164, or their email)
create table if not exists public.tms_conversations (
  contact      text primary key,
  -- for the app's live lists (rows are found by id)
  id           uuid not null default gen_random_uuid() unique,
  company_id   uuid references public.tms_companies (id) on delete set null,
  assignee_id  uuid,
  status       text not null default 'open' check (status in ('open', 'closed')),
  starred      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists tms_conversations_assignee_idx on public.tms_conversations (assignee_id);

drop trigger if exists tms_conversations_updated on public.tms_conversations;
create trigger tms_conversations_updated before update on public.tms_conversations
  for each row execute function tms_private.touch_updated_at();

alter table public.tms_conversations enable row level security;
drop policy if exists tms_conversations_all on public.tms_conversations;
create policy tms_conversations_all on public.tms_conversations for all to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));

-- quick replies
create table if not exists public.tms_snippets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.tms_snippets enable row level security;
drop policy if exists tms_snippets_all on public.tms_snippets;
create policy tms_snippets_all on public.tms_snippets for all to authenticated
  using ((select tms_private.is_member())) with check ((select tms_private.is_member()));

-- internal notes live in the thread (never sent to the customer)
alter table public.tms_comms drop constraint if exists tms_comms_channel_check;
alter table public.tms_comms add constraint tms_comms_channel_check check (channel in ('call', 'sms', 'email', 'note'));
-- members write notes themselves
drop policy if exists tms_comms_note_insert on public.tms_comms;
create policy tms_comms_note_insert on public.tms_comms for insert to authenticated
  with check ((select tms_private.is_member()) and channel = 'note');
drop policy if exists tms_comms_note_delete on public.tms_comms;
create policy tms_comms_note_delete on public.tms_comms for delete to authenticated
  using ((select tms_private.is_member()) and channel = 'note' and member_id = (select auth.uid()));

-- a call is live from Kixie's start / answered webhook until its end-call webhook
alter table public.tms_comms add column if not exists ended_at timestamptz;
update public.tms_comms set ended_at = coalesce(ended_at, occurred_at) where channel = 'call' and ended_at is null;

-- a reply from the customer reopens a closed conversation
create or replace function tms_private.comms_conversation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.channel = 'note' then
    return new;
  end if;
  insert into public.tms_conversations (contact, company_id)
    values (new.contact, new.company_id)
    on conflict (contact) do update
      set company_id = coalesce(public.tms_conversations.company_id, excluded.company_id),
          status = case when new.direction = 'inbound' then 'open' else public.tms_conversations.status end;
  return new;
end;
$$;
revoke all on function tms_private.comms_conversation() from public, anon, authenticated;

drop trigger if exists tms_comms_conversation on public.tms_comms;
create trigger tms_comms_conversation after insert on public.tms_comms
  for each row execute function tms_private.comms_conversation();

insert into public.tms_conversations (contact, company_id)
  select distinct on (contact) contact, company_id from public.tms_comms where channel <> 'note'
  order by contact, (company_id is null), occurred_at desc
  on conflict (contact) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.tms_conversations;
exception when duplicate_object then null;
end $$;
do $$
begin
  alter publication supabase_realtime add table public.tms_snippets;
exception when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
