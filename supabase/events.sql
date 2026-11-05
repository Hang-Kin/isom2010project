-- Evidence Vault usage events (FEAT-7).
-- Paste this file into the Supabase SQL editor and run it once.
-- Safe to run again: the table uses IF NOT EXISTS, and policies are dropped first.
-- Re-running does not change the event-name check on a table that already exists.
-- FEAT-11 replaces that check when its four names are added.
-- Do not put a service_role key in this file. The SQL editor runs as the project owner.

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  event_name text not null check (event_name in (
    'login','achievement_created','evidence_uploaded','entries_selected','answers_copied',
    'pdf_generated','pdf_downloaded','packet_saved','packet_loaded','import_completed',
    'backup_downloaded','sensitive_warning_shown','sensitive_warning_confirmed',
    'sensitive_warning_cancelled','verifier_added')),
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists events_user_time_idx on public.events (user_id, created_at);
create index if not exists events_name_time_idx on public.events (event_name, created_at);

alter table public.events enable row level security;
drop policy if exists "events_insert_own" on public.events;
create policy "events_insert_own" on public.events for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "events_select_own" on public.events;
create policy "events_select_own" on public.events for select to authenticated using (user_id = (select auth.uid()));

revoke all on table public.events from anon;
grant select, insert on table public.events to authenticated;
-- No update or delete grants: the log is append-only for users.
