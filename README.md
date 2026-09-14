# the Hours of Pee

A private hours tracker. You log hours against a date and an activity type; nothing else is required.

An entry is only ever a date, a number of hours, an activity type (direct or indirect), an optional supervisor, and a note. Hours are entered and displayed as decimal hours (`1.5`) and stored as integer minutes so quarter hours stay exact.

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
   - `SMTP_USERNAME`, `SMTP_PASSWORD`, `INVITE_FROM_EMAIL` (mailbox that sends invitations)
   - `SMTP_HOST` and `SMTP_PORT` (optional; default `smtp.gmail.com` and `465`)
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

Set Edge Function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `INVITE_FROM_EMAIL`, and optionally `SMTP_HOST`, `SMTP_PORT`, `INVITE_EXPIRATION_HOURS`.

```bash
supabase secrets set \
  INVITE_FROM_EMAIL='you@gmail.com' \
  SMTP_USERNAME='you@gmail.com' \
  SMTP_PASSWORD='<16-character Google app password>' \
  APP_URL='https://<production-domain>'
```

Gmail needs an **app password** (Google Account → Security → 2-Step Verification → App passwords); a normal account password is rejected by `smtp.gmail.com`.

10. Bootstrap the first administrator after that person’s profile row exists:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

### Invitations

An admin enters an email address on `/admin`. The `create-invite` function then:

1. Refuses up front, changing nothing, when the mail secrets are missing. It never pretends an email was sent.
2. Creates (or resets) the account with a random **one-time password**, marks `profiles.must_change_password`, and stores only a SHA-256 hash of that password in `invitations`.
3. Emails the sign-in link and the one-time password from `INVITE_FROM_EMAIL`. The password is never returned to the browser or written to logs.
4. Revokes the invitation and suspends the account if the email fails to send, so no account is left with a password nobody knows.

On first sign-in the person is held on `/set-password` until they choose their own password. Clearing `must_change_password` marks the invitation accepted through a database trigger. **Revoke** stops a one-time password from working; **Resend** and **Reset password** issue a new one and invalidate the old.

### Auth routes

- `/login` email and password
- `/set-password` forced first-password choice after a one-time password sign-in
- `/invite` and `/register` legacy token-link acceptance (kept working; invitations now arrive as one-time passwords)
- `/auth/callback` and `/auth/confirm` exchange the auth code and redirect to a safe internal path
- `/auth/reset-password` (and `/reset-password`) complete recovery
- `/account` profile, password, export, deletion
- `/admin` invitations and user status (admins only)

`/account` and `/admin` render inside the same navigation shell as the workspace, so the sidebar and the “Dashboard” breadcrumb are available from every signed-in page.

### Row Level Security

Every application table is RLS-protected. Authenticated, **active** users can only read and write rows where `user_id = auth.uid()`. Suspended users fail `is_active_user()` and cannot read data. Admin user changes go through Edge Functions with the service role, not the browser.

Policy checklist lives in `supabase/tests/rls.sql`. Helper tests live in `src/security/rls.test.ts`.

### Local-to-cloud migration

After first remote login, if this browser still has local data and the remote workspace is empty, the app offers upload, keep local, or cancel. Upload skips existing ids and never overwrites remote rows.

### Backups

- Each person can download JSON or CSV from Settings. Both carry decimal hours.
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

There is no client field. Keep notes free of names, addresses, medical record numbers, or other identifying details.

## Current product notes

The shipped UI is Overview, month Calendar, Placement, Reports, and Settings, over local or online persistence. Hours are either **Direct** or **Indirect**, then one of a fixed activity list. Jobs and sites live on the Placement page, which is also the only place to add supervisors.

Experiences, custom activity types, activity statuses, start times, terms, tags, and client labels were removed. Older experience rows are copied into `placements` — see `supabase/migrations/202609150005_placements.sql`. Backups from earlier versions still import: the migration in `src/dictionaries.ts` keeps the date, hours, activity, placement, supervisor, and notes.

## Commands

```bash
pnpm dev
pnpm run build
pnpm test
pnpm run preview
```
