# Analytics

These definitions match the queries in `supabase/analytics.sql`. Run `supabase/events.sql` once in the Supabase SQL editor before the queries. The editor runs as the project owner and can see every row. The app cannot: a signed-in student can insert and read only their own events, and cannot update or delete them.

Sign-up is not an event. The denominator for "signed up" is `public.profiles` (one row per account, created by the new-user trigger).

## Limits that apply to every metric

- The sample is a course project. Treat percentages as descriptions of this group, not as a stable product rate.
- Put team account ids in `excluded_users` in every query. The placeholder uuid matches nobody, so until you replace it the team is included.
- Events exist only after `public.events` is deployed. Students who signed up before that day stay in the signed-up denominator and make conversion look lower.
- Props are counts, booleans, categories, preset ids, sizes, and durations. The logger drops titles, file names, emails, descriptions, and document text. It also drops a string longer than 40 characters, a string with a space or `@`, a path (`/` or `\`), a value that ends in a file extension, and a string of 8 or more digits.
- `entries_selected` is stored at most once per browser tab until a full reload. `answers_copied` is stored at most once every 5 seconds. A failed insert does not block the button that triggered it. The next selection or copy can try again.
- `sensitive_warning_*` and `verifier_added` are allowed names. Their product behavior arrives with the warning and verifier work. Until those rows exist, the backfire warning counts are zero.

## What the app records

After the matching action succeeds: `login`; `achievement_created` with `category`; `evidence_uploaded` with `file_type` (`pdf`, `png`, `jpeg`, or `other`) and `size_kb`; `entries_selected` with `count` and `preset`; `answers_copied` with `style`; `pdf_generated` with `entries`, `evidence_pages`, `size_kb`, and `duration_ms`; `pdf_downloaded`; `packet_saved`; `packet_loaded`; `import_completed` with `imported` and `skipped`; `backup_downloaded` with `kind` (`csv`, `json`, or `zip`).

`duration_ms` is the time from the start of that PDF build until the file is ready. Editing an entry, duplicating a packet, opening the PDF in a new tab, and downloading the import template are not events. Sign-up is not an event.

## (a) Funnel

Distinct users, in order: signed up, `achievement_created`, `evidence_uploaded`, `entries_selected`, `pdf_generated`, `pdf_downloaded`.

A person counts at a step when they have done that step at least once. They do not have to have done the previous step, so a later step can be more than 100% of the one before it. Someone who generated a PDF before the log existed will be missing from later steps.

`conversion_from_previous_pct` is this step's users divided by the previous step's users. It is empty on "signed up". `conversion_from_signed_up_pct` divides by the profile count. The first step is 100% of itself when anyone has a profile, and empty when nobody has signed up.

## (b) Activation rate

Users with at least one `pdf_generated`, divided by signed-up users.

This is the same percentage as `conversion_from_signed_up_pct` on the `pdf_generated` row of the funnel. People who never generate a PDF stay in the denominator. That is the point of the rate: registration alone is not activation.

## (c) Time to first value

For each signed-up user who has a `pdf_generated` event, minutes from `profiles.created_at` to their first such event. The query repeats the median and the maximum of those minutes on every row.

The median is only among people who reached a PDF. It is not the time for the whole signed-up cohort. People who never generate a PDF are omitted, not counted as "still waiting". A clock skew can make a value negative. An empty result means nobody in the cohort has generated a PDF since logging began.

## (d) Retention by relative week

Activated users are those with a `pdf_generated` or `pdf_downloaded` event. Activation time is the earliest of those events.

Relative week 0 is the first 7×24 hours after that timestamp, week 1 the next 7×24 hours, through week 3. These are not calendar weeks.

For each week, `users` is how many activated users have at least one `pdf_generated` in that window. `pct_of_activated` divides by all activated users, including people whose only export event was a download. Week 0 can therefore be under 100%. Weeks with no generation show 0%.

## (e) Second-application proxy

Two separate counts:

- `users_pdf_on_two_or_more_days`: `pdf_generated` on at least two different UTC dates.
- `users_packet_then_later_pdf`: at least one `packet_loaded` strictly earlier than a `pdf_generated`.

Either pattern can happen inside one application (a student exports, fixes an entry, and exports again, or reloads a packet and exports once). Use them as a proxy for returning to a saved application, not as a count of submitted applications.

## (f) Backfire checks

- `cancelled` and `confirmed` count `sensitive_warning_cancelled` and `sensitive_warning_confirmed` events. A higher cancelled count means people stopped an upload the warning questioned. It does not measure whether the file was actually sensitive.
- `pdfs_with_zero_evidence_pages` counts `pdf_generated` rows per user whose `evidence_pages` prop is 0. That is a generated packet with no evidence pages attached. It can be a student who was not ready, not necessarily a failure of the warning. No rows means every logged PDF included at least one evidence page, or that nobody has generated a PDF.
