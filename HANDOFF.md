# Cursor handoff — the Hours of Pee

## Current state

Local-first React 19 + TypeScript + Vite tracker, with an optional invitation-only Supabase mode.

- Screens are Overview, Calendar, Hours, Reports, and Settings. An entry is a date, decimal hours, an activity type (direct or indirect), an optional supervisor, and a note.
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
- People enter and read hours; `src/calculations.ts` converts to integer minutes for storage.
- Every workspace, including a fresh online account, must have at least one activity type or nothing can be logged.
- There is no client field, activity status, start time, term, tag, or experience. Do not reintroduce them without asking.
- Preserve the product name: **the Hours of Pee**.

## Remaining follow-up

- Turn Playwright `PLAYWRIGHT_REMOTE=1` tests on a seeded staging project.
- The unused `experiences`, `activity_tags`, `terms`, `tags`, `demographics`, `organization_types`, and `training_levels` tables plus the legacy `activities` columns can be dropped once nobody needs the old rows.
