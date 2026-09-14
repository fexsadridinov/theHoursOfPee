# the Hours of Pee

A private activity and experience-hours tracker. It stores durations as integer minutes.

It can run in two modes:

- **Local-only** (default when no Supabase env vars are set): data stays in this browser under `the-hours-of-pee:v1`.
- **Invitation-only online**: each signed-in person has a private Supabase account. There is no shared caseload and no social login, billing, or marketing.

## Local development

```bash
pnpm install
pnpm dev
```

Leave `VITE_SUPABASE_URL` unset to keep local-only mode.

```bash
pnpm test        # unit tests, including invitation/RLS/migration helpers
pnpm run lint    # TypeScript check
pnpm run build   # type-check and production build
pnpm test:e2e    # Playwright (optional; install Playwright browsers first)
```

## Online mode (Supabase)

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY` (anon / publishable key only)
   - `VITE_APP_URL` (optional; the running origin is used when empty)
   - `VITE_INVITE_EXPIRATION_HOURS` (default 72)
3. Put **only** on the server / Edge Functions, never in `VITE_*`:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY` and `INVITE_FROM_EMAIL` if you send invitation mail
   - `APP_URL` (public site origin used in invitation emails)
4. Authentication → Providers: Email enabled, **public sign-ups disabled**.
5. Enable **Confirm email**.
6. Site URL and Redirect URLs must include:
   - `http://localhost:5173/**`
   - `https://<preview-project>.vercel.app/**`
   - `https://<production-domain>/**`
   - Callback paths: `/auth/callback`, `/auth/confirm`, `/auth/reset-password`
7. Confirmation and recovery email templates should use `{{ .RedirectTo }}` or `{{ .ConfirmationURL }}` (no secrets in the URL).
8. Apply repository migrations (`supabase/migrations/`) with `supabase db push` or the connected MCP `apply_migration` tool.
9. Deploy functions:

```bash
supabase functions deploy create-invite
supabase functions deploy register-with-invite
supabase functions deploy admin-user
supabase functions deploy delete-own-account
```

Set Edge Function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, and optionally `RESEND_API_KEY`, `INVITE_FROM_EMAIL`, `INVITE_EXPIRATION_HOURS`.

10. Bootstrap the first administrator after that person’s profile row exists:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

If invitation email is not configured, creating an invite records the hashed token but **does not pretend an email was sent** and does not display the token in the browser.

### Auth routes

- `/login` email and password
- `/invite` invitation acceptance
- `/register` invitation-only registration
- `/auth/callback` and `/auth/confirm` exchange the auth code and redirect to a safe internal path
- `/auth/reset-password` (and `/reset-password`) complete recovery
- `/account` profile, password, export, deletion
- `/admin` invitations and user status (admins only)

### Row Level Security

Every application table is RLS-protected. Authenticated, **active** users can only read and write rows where `user_id = auth.uid()`. Suspended users fail `is_active_user()` and cannot read data. Admin user changes go through Edge Functions with the service role, not the browser.

Policy checklist lives in `supabase/tests/rls.sql`. Helper tests live in `src/security/rls.test.ts`.

### Local-to-cloud migration

After first remote login, if this browser still has local data and the remote workspace is empty, the app offers upload, keep local, or cancel. Upload skips existing ids and never overwrites remote rows.

### Backups

- Each person can download JSON/CSV, including a **redacted** client-label export, from Settings.
- Imports require confirmation and keep schema version checks.
- An admin system-wide backup should be taken from the Supabase dashboard (server-side), not from the browser.

### Account deletion

Account → **Delete my account** requires typing `DELETE`. An Edge Function deletes the Auth user; owned rows cascade.

## Vercel

This is a Vite SPA. `vercel.json` rewrites all routes to `index.html`.

Vercel environment variables (Development, Preview, and Production):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_APP_URL` (production/preview origin; leave unset to use the current origin)
- `VITE_INVITE_EXPIRATION_HOURS`

Do **not** add `SUPABASE_SERVICE_ROLE_KEY` to Vercel frontend env.

Prefer Git-connected deployments so pushes to the GitHub branch deploy automatically.

## Privacy

Use anonymous client labels only. Do not enter names, addresses, medical record numbers, or other identifying details.

## Current product notes

The shipped UI includes dashboard, month calendar, activity list, experiences, dictionaries, reports, and local/remote persistence. Database stubs exist for recurrence series, first-class client records, requirement groups, and saved report presets; those screens are not a separate product area yet. Client labels on activities remain anonymous strings.

## Commands

```bash
pnpm dev
pnpm run build
pnpm test
pnpm run preview
```
