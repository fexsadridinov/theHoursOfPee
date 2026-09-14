-- Indexes, invitation revoke, deleted profile status, and relationship-table ownership.

alter table public.profiles drop constraint if exists profiles_status_check;
alter table public.profiles add constraint profiles_status_check
  check (status in ('active', 'suspended', 'deleted'));

alter table public.invitations
  add column if not exists revoked_at timestamptz;

alter table public.audit_logs drop constraint if exists audit_logs_event_check;
alter table public.audit_logs add constraint audit_logs_event_check check (event in (
  'invitation_created', 'invitation_accepted', 'invitation_revoked', 'invitation_replaced',
  'user_suspended', 'user_reactivated', 'user_deleted', 'data_export', 'data_import'
));

create index if not exists activities_user_date_idx on public.activities (user_id, date);
create index if not exists activities_user_experience_idx on public.activities (user_id, experience_id);
create index if not exists activities_user_type_idx on public.activities (user_id, activity_type_id);
create index if not exists activities_user_status_idx on public.activities (user_id, status);
create index if not exists invitations_email_idx on public.invitations (email);
create index if not exists invitations_token_hash_idx on public.invitations (token_hash);
create index if not exists invitations_expires_at_idx on public.invitations (expires_at);

drop policy if exists experience_supervisors_related on public.experience_supervisors;
drop policy if exists experience_supervisors_select on public.experience_supervisors;
drop policy if exists experience_supervisors_insert on public.experience_supervisors;
drop policy if exists experience_supervisors_update on public.experience_supervisors;
drop policy if exists experience_supervisors_delete on public.experience_supervisors;

create policy experience_supervisors_related on public.experience_supervisors
for all to authenticated
using (
  user_id = auth.uid() and public.is_active_user()
  and exists (select 1 from public.experiences e where e.user_id = auth.uid() and e.id = experience_id)
  and exists (select 1 from public.supervisors s where s.user_id = auth.uid() and s.id = supervisor_id)
)
with check (
  user_id = auth.uid() and public.is_active_user()
  and exists (select 1 from public.experiences e where e.user_id = auth.uid() and e.id = experience_id)
  and exists (select 1 from public.supervisors s where s.user_id = auth.uid() and s.id = supervisor_id)
);
