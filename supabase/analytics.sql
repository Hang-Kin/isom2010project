-- Evidence Vault funnel, activation, and retention (FEAT-7).
-- Run supabase/events.sql once before these queries.
-- Run each query on its own in the Supabase SQL editor. The editor uses the
-- project owner role, so it can see every row. Row level security still
-- limits the app to the signed-in user's own events.
--
-- excluded_users is repeated in every query so each one can run alone.
-- The zero uuid matches nobody. Replace it with team account ids from
-- Authentication > Users, and keep the same list in every query.
-- Add another uuid as its own line inside the array.
--
-- Sign-up is not an event. "Signed up" is one row in public.profiles,
-- created by the new-user trigger. Events start only when this log is deployed,
-- so people who signed up earlier can be in the denominator without events.

-- (a) Funnel. Distinct users, not "did the previous step".
-- conversion_from_previous_pct is null on the first step.
-- conversion_from_signed_up_pct on pdf_generated is the activation rate in (b).
with excluded_users as (
  select unnest(array[
    '00000000-0000-0000-0000-000000000000'::uuid
  ]) as user_id
),
signed_up as (
  select p.id as user_id
  from public.profiles p
  where not exists (
    select 1 from excluded_users x where x.user_id = p.id
  )
),
step_names as (
  select *
  from (values
    (1, 'signed_up'),
    (2, 'achievement_created'),
    (3, 'evidence_uploaded'),
    (4, 'entries_selected'),
    (5, 'pdf_generated'),
    (6, 'pdf_downloaded')
  ) as steps(step_order, step)
),
step_users as (
  select 1 as step_order, s.user_id
  from signed_up s
  union all
  select n.step_order, e.user_id
  from public.events e
  join step_names n on n.step = e.event_name
  join signed_up s on s.user_id = e.user_id
  where n.step_order > 1
),
counts as (
  select
    n.step_order,
    n.step,
    count(distinct u.user_id) as users
  from step_names n
  left join step_users u on u.step_order = n.step_order
  group by n.step_order, n.step
)
select
  c.step,
  c.users,
  round(100.0 * c.users / nullif(lag(c.users) over (order by c.step_order), 0), 1)
    as conversion_from_previous_pct,
  round(100.0 * c.users / nullif((select users from counts where step_order = 1), 0), 1)
    as conversion_from_signed_up_pct
from counts c
order by c.step_order;

-- (b) Activation rate.
-- Numerator: signed-up users with at least one pdf_generated.
-- Denominator: signed-up users (profiles), including people who never exported.
with excluded_users as (
  select unnest(array[
    '00000000-0000-0000-0000-000000000000'::uuid
  ]) as user_id
),
signed_up as (
  select p.id as user_id
  from public.profiles p
  where not exists (
    select 1 from excluded_users x where x.user_id = p.id
  )
),
activated as (
  select distinct e.user_id
  from public.events e
  join signed_up s on s.user_id = e.user_id
  where e.event_name = 'pdf_generated'
)
select
  (select count(*) from signed_up) as signed_up_users,
  (select count(*) from activated) as activated_users,
  round(
    100.0 * (select count(*) from activated) / nullif((select count(*) from signed_up), 0),
    1
  ) as activation_rate_pct;

-- (c) Time to first value, per user, with the cohort median and max repeated.
-- Minutes from profiles.created_at to that user's first pdf_generated.
-- People who never generate a PDF are left out, so this is not a cohort median.
-- Zero rows means nobody in the cohort has generated a PDF yet.
with excluded_users as (
  select unnest(array[
    '00000000-0000-0000-0000-000000000000'::uuid
  ]) as user_id
),
signed_up as (
  select p.id as user_id, p.created_at
  from public.profiles p
  where p.created_at is not null
    and not exists (
      select 1 from excluded_users x where x.user_id = p.id
    )
),
first_pdf as (
  select e.user_id, min(e.created_at) as first_pdf_at
  from public.events e
  join signed_up s on s.user_id = e.user_id
  where e.event_name = 'pdf_generated'
  group by e.user_id
),
minutes as (
  select
    s.user_id,
    extract(epoch from (f.first_pdf_at - s.created_at)) / 60.0 as minutes
  from first_pdf f
  join signed_up s on s.user_id = f.user_id
),
summary as (
  select
    percentile_cont(0.5) within group (order by minutes) as median_minutes,
    max(minutes) as max_minutes
  from minutes
)
select
  m.user_id,
  round(m.minutes::numeric, 1) as minutes_to_first_pdf,
  round(s.median_minutes::numeric, 1) as median_minutes,
  round(s.max_minutes::numeric, 1) as max_minutes
from minutes m
cross join summary s
order by m.minutes, m.user_id;

-- (d) Retention by relative week, weeks 0 through 3.
-- Activated users have a pdf_generated or pdf_downloaded event.
-- Their activation time is the first of those events.
-- A week is 7 * 24 hours after that timestamp, not a calendar week.
-- The numerator is users with at least one pdf_generated in that week.
-- The denominator is every activated user, so week 0 can be under 100%
-- when activation was a download and no PDF was generated in that week.
with excluded_users as (
  select unnest(array[
    '00000000-0000-0000-0000-000000000000'::uuid
  ]) as user_id
),
activated as (
  select e.user_id, min(e.created_at) as activated_at
  from public.events e
  where e.event_name in ('pdf_generated', 'pdf_downloaded')
    and not exists (
      select 1 from excluded_users x where x.user_id = e.user_id
    )
  group by e.user_id
),
weeks as (
  select generate_series(0, 3) as rel_week
),
hits as (
  select distinct
    a.user_id,
    floor(extract(epoch from (e.created_at - a.activated_at)) / 604800)::integer as rel_week
  from activated a
  join public.events e
    on e.user_id = a.user_id
   and e.event_name = 'pdf_generated'
)
select
  w.rel_week,
  count(distinct h.user_id) as users,
  (select count(*) from activated) as activated_users,
  round(
    100.0 * count(distinct h.user_id) / nullif((select count(*) from activated), 0),
    1
  ) as pct_of_activated
from weeks w
left join hits h on h.rel_week = w.rel_week and h.rel_week between 0 and 3
group by w.rel_week
order by w.rel_week;

-- (e) Second-application proxy. Two counts, not proof of a second application.
-- users_pdf_on_two_or_more_days: pdf_generated on at least two different UTC dates.
-- users_packet_then_later_pdf: a packet_loaded strictly before a later pdf_generated.
with excluded_users as (
  select unnest(array[
    '00000000-0000-0000-0000-000000000000'::uuid
  ]) as user_id
),
pdf_days as (
  select e.user_id, count(distinct (e.created_at at time zone 'utc')::date) as days
  from public.events e
  where e.event_name = 'pdf_generated'
    and not exists (
      select 1 from excluded_users x where x.user_id = e.user_id
    )
  group by e.user_id
),
packet_then_pdf as (
  select distinct generated.user_id
  from public.events generated
  where generated.event_name = 'pdf_generated'
    and not exists (
      select 1 from excluded_users x where x.user_id = generated.user_id
    )
    and exists (
      select 1
      from public.events loaded
      where loaded.user_id = generated.user_id
        and loaded.event_name = 'packet_loaded'
        and loaded.created_at < generated.created_at
    )
)
select
  (select count(*) from pdf_days where days >= 2) as users_pdf_on_two_or_more_days,
  (select count(*) from packet_then_pdf) as users_packet_then_later_pdf;

-- (f1) Backfire: sensitive-document warning outcomes.
-- Counts of events, not distinct users. Both stay zero until that warning ships.
with excluded_users as (
  select unnest(array[
    '00000000-0000-0000-0000-000000000000'::uuid
  ]) as user_id
)
select
  count(*) filter (where e.event_name = 'sensitive_warning_cancelled') as cancelled,
  count(*) filter (where e.event_name = 'sensitive_warning_confirmed') as confirmed
from public.events e
where e.event_name in ('sensitive_warning_cancelled', 'sensitive_warning_confirmed')
  and not exists (
    select 1 from excluded_users x where x.user_id = e.user_id
  );

-- (f2) Backfire: generated PDFs whose evidence_pages prop is 0, per user.
-- props->>'evidence_pages' is text. A stored JSON number 0 compares equal to '0'.
-- Zero rows means no generated PDF was missing evidence pages.
with excluded_users as (
  select unnest(array[
    '00000000-0000-0000-0000-000000000000'::uuid
  ]) as user_id
)
select
  e.user_id,
  count(*) as pdfs_with_zero_evidence_pages
from public.events e
where e.event_name = 'pdf_generated'
  and e.props->>'evidence_pages' = '0'
  and not exists (
    select 1 from excluded_users x where x.user_id = e.user_id
  )
group by e.user_id
order by pdfs_with_zero_evidence_pages desc, e.user_id;
