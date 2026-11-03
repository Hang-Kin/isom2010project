# Evidence Vault

Students store awards and activities once, attach evidence, and export a PDF plus copy-ready answers for scholarship applications.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3001.

Copy `.env.example` to `.env.local` and set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Use the Supabase anon / publishable key. Do not put a `service_role` key in the app or in git. `.env.local` stays untracked.

Before the first signup, open the Supabase SQL editor and run `supabase/schema.sql`. The script is safe to run again.

In Supabase Authentication, keep Email enabled and turn **Confirm email** off so a new account can sign in immediately.

Manual checks for the finished app are listed at the bottom of this file once the features are in place.
