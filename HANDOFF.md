# Cursor handoff — the Hours of Pee

## Current state

Local-first React 19 + TypeScript + Vite tracker, with an optional invitation-only Supabase mode.

- Existing dashboard, calendar, activities, experiences, reports, dictionaries, and integer-minute calculations are unchanged.
- Persistence goes through `LocalRepository` / `RemoteRepository`.
- Online mode uses Supabase Auth, Postgres, RLS, and Edge Functions. The service role key must never appear in `VITE_*` or browser code.
- Local-only mode remains the default when Supabase env vars are absent.

## Run

```bash
pnpm install
pnpm dev
```

## Constraints

- Do not add social login, billing, email marketing, or shared caseloads.
- Keep durations as integer minutes in `src/calculations.ts`.
- Client labels stay anonymous.
- Preserve the product name: **the Hours of Pee**.

## Remaining follow-up

- Apply SQL + deploy Edge Functions against a live Supabase project.
- Bootstrap the first admin profile in SQL.
- Turn Playwright `PLAYWRIGHT_REMOTE=1` tests on a seeded staging project.
- Recurrence series, anonymous client records, and requirement groups remain product features for later phases.
