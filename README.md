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
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_APP_URL` (the public site origin)
   - `VITE_INVITE_EXPIRATION_HOURS` (default 72)
3. Put **only** on the server / Edge Functions, never in `VITE_*`:
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `RESEND_API_KEY` and `INVITE_FROM_EMAIL` if you send invitation mail
   - `APP_URL`
4. Confirm Authentication → Providers: Email enabled, **public sign-ups disabled** (users are created by the invitation function).
5. Enable “Confirm email”.
6. Run `supabase/migrations/202609140001_multiuser_rls.sql` in the SQL editor (or `supabase db push`).
7. Deploy functions:

```bash
supabase functions deploy create-invite
supabase functions deploy register-with-invite
supabase functions deploy admin-user
supabase functions deploy delete-own-account
```

8. Bootstrap the first administrator after that person’s profile row exists:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

9. Deploy the Vite app over **HTTPS**. Staging and production should use separate Supabase projects.

### Invitations

Admins invite from **Admin**. The Edge Function stores a SHA-256 hash of a random token and emails the one-time link. Tokens are never logged and never returned to the browser.

### Row Level Security

Every application table is RLS-protected. Authenticated, **active** users can only read and write rows where `user_id = auth.uid()`. Suspended users fail `is_active_user()` and cannot read data. Admin user changes go through Edge Functions with the service role, not the browser.

Policy checklist lives in `supabase/tests/rls.sql`. Helper tests live in `src/security/rls.test.ts`.

### Backups

- Each person can download JSON/CSV, including a **redacted** client-label export, from Settings.
- Imports require confirmation and keep schema version checks.
- An admin system-wide backup should be taken from the Supabase dashboard (server-side), not from the browser.

### Account deletion

Account → **Delete my account** requires typing `DELETE`. An Edge Function deletes the Auth user; owned rows cascade.

## Privacy

Use anonymous client labels only. Do not enter names, addresses, medical record numbers, or other identifying details.

## Commands

```bash
pnpm dev
pnpm run build
pnpm test
pnpm run preview
```
