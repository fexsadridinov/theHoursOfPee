-- Activities became hours-only entries: date, duration, activity type, supervisor, notes.
-- The old experience/status columns are no longer written, so they must stop being required.
-- Data already in them is left untouched.

alter table public.activities alter column experience_id drop not null;
alter table public.activities alter column status drop not null;
alter table public.activity_types alter column short_name drop not null;
alter table public.activity_types alter column domain_id drop not null;
