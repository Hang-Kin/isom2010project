# Evidence Vault

Students store awards and activities once, attach evidence, and export a PDF plus copy-ready answers for scholarship applications.

Email and password only. There is no Google sign-in.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3001.

`npm run build` and `npm run lint` should both pass.

## Environment variables

Copy `.env.example` to `.env.local`. Set these names there. Do not commit `.env.local`.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Use the Supabase anon / publishable key for `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do not add a `service_role` key anywhere in the app or in git.

The same two names are what Vercel needs. This repo does not deploy itself.

## Database

Before the first signup, open the Supabase SQL editor and run the whole file `supabase/schema.sql`. It is safe to run again.

That file creates:

- `profiles`, `achievements`, and `evidence_files`, with row level security so each student only reads and writes their own rows
- a signup trigger that inserts a blank profile
- an `updated_at` trigger on achievements
- a private Storage bucket named `evidence` (5 MB; PDF, JPEG, and PNG only) and storage policies limited to the signed-in user's folder

In Supabase Authentication, keep Email enabled and turn **Confirm email** off so a new account gets a session immediately.

## What the app does

1. Sign up or log in with email and password.
2. After signup, `/profile` asks for an optional username, year of study, major, and hobbies. Every field can be left blank. **Go to dashboard** does not require a profile. The same page is linked from **Profile** in the header later.
3. Achievements can be created, edited, searched, filtered, and deleted.
4. Each achievement accepts private evidence files.
5. Export selects entries, shows copy-ready answers in that order, and builds one PDF. The cover shows the application name, username, email, date, and a numbered index.

## Manual checks

Use fake names and fake certificates only. Create two accounts: A for the demo, B for the privacy check.

1. **Sign up, log out, log in.** Sign up, land on `/profile`, choose **Go to dashboard** with every field blank, log out, and log in again. Logged-out visits to `/dashboard`, `/dashboard/achievements`, `/dashboard/export`, and `/profile` redirect to `/login`. A logged-in visit to `/login` or `/signup` redirects to `/dashboard`.
2. **Profile.** Save a username, year of study, major, and hobbies. Leave them blank and save again. From a second account, save the same username and confirm the message says that username is already taken. An empty profile can still open `/dashboard`.
3. **Create an entry and refresh.** The achievement is still there. Edit it. An end date before the start date is rejected. Negative hours are rejected. Delete asks for confirmation, then removes the entry and its evidence records.
4. **Search and category filter.** Title and organizer search, and the category filter, hide non-matching cards. The empty list says to add a first award or activity.
5. **Upload a PDF and an image, then refresh.** Both files are still listed. Preview opens in a new tab. Delete removes a file.
6. **Reject a `.docx` and a file larger than 5 MB.** Each shows a clear error. Nothing else on the page breaks, and neither file is stored.
7. **Select and reorder.** On Export, select three entries, including one with no evidence. **Missing evidence** shows before you generate. Up and Down change the selected order. The copy-ready answers and the PDF index follow that same order. Removing an entry removes it from both.
8. **Date window and max items.** Set a from/to window and a max-items number. **Outside date window** and **Over max items** update. Those warnings do not block export. An end date before the start date in the window shows an error and disables Generate.
9. **Generate the PDF.** The cover shows the application name, username (or "Not set"), email, date, and a numbered index. Each selected entry has a page, then its PDF pages or fitted JPEG/PNG evidence. The page shows the file size in MB, a preview, Download, and Open in new tab.
10. **Copy an answer.** Edit a textarea, press Copy, and confirm the clipboard matches that edited text. Copy all copies the selected answers in order, separated by a blank line.
11. **Failure case.** If a selected file cannot be downloaded or embedded, Generate still finishes. That file is listed under **Not included** on the page and on the PDF cover. The other files are still in the PDF.
12. **Non-Latin text.** An entry title or description with characters Helvetica cannot draw is stored as typed. The PDF replaces those characters with `?` and the page warns that non-Latin text is not supported.
13. **Privacy.** Log in as account B. B does not see A's achievements. A's storage path is not readable from B's session.
14. **Another machine.** After the two env vars are set on Vercel, the core journey (sign up, save an entry, upload evidence, export) works on the deployed URL. A teammate can clone the repo, add `.env.local`, run `supabase/schema.sql`, and follow this list without extra setup.

## Hand-off

Lee still needs to:

- Run `supabase/schema.sql` in the Supabase SQL editor.
- Turn off **Confirm email** for the Email provider.
- Put `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` locally and in the existing Vercel project.
- Create the two fake test accounts and sample files after the SQL has been run.

No Google OAuth client is required.
