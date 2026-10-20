-- Team member profiles: position, contact, working hours, languages, email signature
-- and a photo. Everyone edits their own profile; owners can edit anyone's; only owners
-- change roles. Photos live in their own bucket, each person writes only their folder.
-- TMS objects only; TOSS Leads' public.profiles is not touched.

alter table public.tms_members
  add column if not exists position        text,
  add column if not exists phone           text,
  add column if not exists phone_ext       text,
  add column if not exists mobile          text,
  add column if not exists timezone        text,
  add column if not exists work_hours      text,
  add column if not exists languages       text[] not null default '{}',
  add column if not exists bio             text,
  add column if not exists email_signature text,
  add column if not exists avatar_path     text,
  add column if not exists updated_at      timestamptz not null default now();

alter table public.tms_members drop constraint if exists tms_members_full_name_len;
alter table public.tms_members add constraint tms_members_full_name_len check (char_length(full_name) <= 120);

drop trigger if exists tms_members_touch on public.tms_members;
create trigger tms_members_touch before update on public.tms_members
  for each row execute function tms_private.touch_updated_at();

-- A member may edit their own profile, but not their role, email or account link.
create or replace function tms_private.member_profile_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not tms_private.is_owner() and (
       new.role is distinct from old.role
    or new.email is distinct from old.email
    or new.user_id is distinct from old.user_id
    or new.created_at is distinct from old.created_at) then
    raise exception 'Only owners can change roles' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists tms_members_profile_guard on public.tms_members;
create trigger tms_members_profile_guard before update on public.tms_members
  for each row execute function tms_private.member_profile_guard();

drop policy if exists tms_members_self_update on public.tms_members;
create policy tms_members_self_update on public.tms_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Profile photos: public links (shown in the app), writes limited to the member's own
-- folder (owners may manage anyone's).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tms-avatars', 'tms-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tms avatars insert" on storage.objects;
drop policy if exists "tms avatars update" on storage.objects;
drop policy if exists "tms avatars delete" on storage.objects;
create policy "tms avatars insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'tms-avatars' and (select tms_private.is_member())
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select tms_private.is_owner())));
create policy "tms avatars update" on storage.objects for update to authenticated using (
  bucket_id = 'tms-avatars' and (select tms_private.is_member())
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select tms_private.is_owner())));
create policy "tms avatars delete" on storage.objects for delete to authenticated using (
  bucket_id = 'tms-avatars' and (select tms_private.is_member())
  and ((storage.foldername(name))[1] = (select auth.uid())::text or (select tms_private.is_owner())));

-- Name / photo changes show up on every dispatcher's screen.
do $$ begin
  alter publication supabase_realtime add table public.tms_members;
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
