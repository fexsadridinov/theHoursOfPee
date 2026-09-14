-- RLS expectations for the Hours of Pee
-- Run against a seeded project after the migration, with two test users A and B.
--
-- user A cannot read user B’s records
-- user A cannot update user B’s records
-- user A cannot delete user B’s records
-- users cannot forge user_id on insert
-- members cannot perform admin actions
-- suspended users cannot access records
--
-- Example (psql / supabase db test):
--
-- set request.jwt.claim.sub = '<user-a-id>';
-- select count(*) from activities; -- only A's rows
-- insert into activities (user_id, id, date, duration_minutes, activity_type_id, experience_id, status)
--   values ('<user-b-id>', 'stolen', '2026-09-14', 60, 't', 'e', 'confirmed'); -- fails with check
-- update activities set notes = 'x' where user_id = '<user-b-id>'; -- 0 rows
-- delete from activities where user_id = '<user-b-id>'; -- 0 rows

select tablename
from pg_tables
where schemaname = 'public'
  and tablename in (
    'experiences', 'activity_types', 'supervisors', 'domains', 'organization_types', 'training_levels',
    'terms', 'tags', 'demographics', 'activities', 'activity_tags', 'experience_supervisors', 'clients',
    'recurrence_series', 'requirements', 'saved_filters', 'saved_report_presets', 'user_settings',
    'profiles', 'invitations', 'audit_logs'
  );
