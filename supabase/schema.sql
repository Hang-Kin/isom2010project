-- Evidence Vault schema.
-- Paste this entire file into the Supabase SQL editor and run it.
-- Safe to run again: tables use IF NOT EXISTS, policies are dropped first.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  year_of_study text,
  major text,
  hobbies text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists year_of_study text;
alter table public.profiles add column if not exists major text;
alter table public.profiles add column if not exists hobbies text;
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.profiles drop column if exists full_name;
alter table public.profiles alter column username drop not null;

alter table public.profiles drop constraint if exists profiles_username_key;
alter table public.profiles
  add constraint profiles_username_key unique (username);

alter table public.profiles drop constraint if exists profiles_username_present_check;
alter table public.profiles
  add constraint profiles_username_present_check
  check (username is null or char_length(btrim(username)) > 0);

alter table public.profiles drop constraint if exists profiles_year_of_study_check;
alter table public.profiles
  add constraint profiles_year_of_study_check
  check (
    year_of_study is null
    or year_of_study in (
      'Year 1',
      'Year 2',
      'Year 3',
      'Year 4',
      'Postgraduate',
      'Other'
    )
  );

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null,
  category text not null,
  organizer text,
  role text,
  start_date date,
  end_date date,
  hours numeric,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.achievements add column if not exists user_id uuid default auth.uid();
alter table public.achievements add column if not exists title text;
alter table public.achievements add column if not exists category text;
alter table public.achievements add column if not exists organizer text;
alter table public.achievements add column if not exists role text;
alter table public.achievements add column if not exists start_date date;
alter table public.achievements add column if not exists end_date date;
alter table public.achievements add column if not exists hours numeric;
alter table public.achievements add column if not exists description text;
alter table public.achievements add column if not exists created_at timestamptz default now();
alter table public.achievements add column if not exists updated_at timestamptz default now();

alter table public.achievements drop constraint if exists achievements_category_check;
alter table public.achievements
  add constraint achievements_category_check
  check (category in ('award', 'activity', 'volunteering', 'scholarship', 'internship', 'other'));

alter table public.achievements drop constraint if exists achievements_date_order_check;
alter table public.achievements
  add constraint achievements_date_order_check
  check (start_date is null or end_date is null or end_date >= start_date);

alter table public.achievements drop constraint if exists achievements_hours_check;
alter table public.achievements
  add constraint achievements_hours_check
  check (hours is null or hours >= 0);

create table if not exists public.evidence_files (
  id uuid primary key default gen_random_uuid(),
  achievement_id uuid not null references public.achievements (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_name text not null,
  file_path text not null,
  file_type text not null,
  file_size integer,
  created_at timestamptz not null default now()
);

alter table public.evidence_files add column if not exists achievement_id uuid;
alter table public.evidence_files add column if not exists user_id uuid default auth.uid();
alter table public.evidence_files add column if not exists file_name text;
alter table public.evidence_files add column if not exists file_path text;
alter table public.evidence_files add column if not exists file_type text;
alter table public.evidence_files add column if not exists file_size integer;
alter table public.evidence_files add column if not exists created_at timestamptz default now();

create index if not exists achievements_user_created_idx
  on public.achievements (user_id, created_at desc);

create index if not exists evidence_files_achievement_idx
  on public.evidence_files (achievement_id);

create index if not exists evidence_files_user_idx
  on public.evidence_files (user_id);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.achievements enable row level security;
alter table public.evidence_files enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
  on public.profiles
  for delete
  to authenticated
  using (id = (select auth.uid()));

drop policy if exists "achievements_select_own" on public.achievements;
create policy "achievements_select_own"
  on public.achievements
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "achievements_insert_own" on public.achievements;
create policy "achievements_insert_own"
  on public.achievements
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "achievements_update_own" on public.achievements;
create policy "achievements_update_own"
  on public.achievements
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "achievements_delete_own" on public.achievements;
create policy "achievements_delete_own"
  on public.achievements
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "evidence_files_select_own" on public.evidence_files;
create policy "evidence_files_select_own"
  on public.evidence_files
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "evidence_files_insert_own" on public.evidence_files;
create policy "evidence_files_insert_own"
  on public.evidence_files
  for insert
  to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.achievements
      where achievements.id = evidence_files.achievement_id
        and achievements.user_id = (select auth.uid())
    )
  );

drop policy if exists "evidence_files_update_own" on public.evidence_files;
create policy "evidence_files_update_own"
  on public.evidence_files
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.achievements
      where achievements.id = evidence_files.achievement_id
        and achievements.user_id = (select auth.uid())
    )
  );

drop policy if exists "evidence_files_delete_own" on public.evidence_files;
create policy "evidence_files_delete_own"
  on public.evidence_files
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.profiles from anon;
revoke all on table public.achievements from anon;
revoke all on table public.evidence_files from anon;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.achievements to authenticated;
grant select, insert, update, delete on table public.evidence_files to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists achievements_set_updated_at on public.achievements;
create trigger achievements_set_updated_at
  before update on public.achievements
  for each row
  execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Private evidence bucket (5 MB; pdf, jpeg, png)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence',
  'evidence',
  false,
  5242880,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png'];

drop policy if exists "evidence_objects_select_own" on storage.objects;
create policy "evidence_objects_select_own"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "evidence_objects_insert_own" on storage.objects;
create policy "evidence_objects_insert_own"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "evidence_objects_update_own" on storage.objects;
create policy "evidence_objects_update_own"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "evidence_objects_delete_own" on storage.objects;
create policy "evidence_objects_delete_own"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'evidence'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------------
-- Saved packets (FEAT-2). Safe to run again.
-- Stores a name, settings, and ordered achievement ids. No file bytes or PDFs.
-- ---------------------------------------------------------------------------

create table if not exists public.packets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  settings jsonb not null default '{}'::jsonb,
  achievement_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists packets_user_updated_idx on public.packets (user_id, updated_at desc);
alter table public.packets enable row level security;

drop policy if exists "packets_select_own" on public.packets;
create policy "packets_select_own" on public.packets for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "packets_insert_own" on public.packets;
create policy "packets_insert_own" on public.packets for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "packets_update_own" on public.packets;
create policy "packets_update_own" on public.packets for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "packets_delete_own" on public.packets;
create policy "packets_delete_own" on public.packets for delete to authenticated using (user_id = (select auth.uid()));

revoke all on table public.packets from anon;
grant select, insert, update, delete on table public.packets to authenticated;

create or replace function public.packets_set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = pg_catalog.now(); return new; end; $$;
drop trigger if exists packets_set_updated_at on public.packets;
create trigger packets_set_updated_at before update on public.packets
  for each row execute function public.packets_set_updated_at();

-- ---------------------------------------------------------------------------
-- Optional verifier per achievement (FEAT-9). Safe to run again.
-- Existing achievements RLS policies already cover these columns.
-- ---------------------------------------------------------------------------

alter table public.achievements add column if not exists verifier_name text;
alter table public.achievements add column if not exists verifier_title text;
alter table public.achievements add column if not exists verifier_contact text;
alter table public.achievements add column if not exists verifier_in_pdf boolean not null default false;

alter table public.achievements drop constraint if exists achievements_verifier_lengths_check;
alter table public.achievements add constraint achievements_verifier_lengths_check check (
  coalesce(char_length(verifier_name),0) <= 80 and
  coalesce(char_length(verifier_title),0) <= 80 and
  coalesce(char_length(verifier_contact),0) <= 120);
