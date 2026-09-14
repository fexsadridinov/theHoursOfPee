-- the Hours of Pee — multi-user ownership, invitations, and RLS
-- Apply with: supabase db push   or the SQL editor in the Supabase dashboard.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null check (role in ('admin', 'member')) default 'member',
  status text not null check (status in ('active', 'suspended')) default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users (id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id),
  event text not null check (event in (
    'invitation_created', 'invitation_accepted', 'user_suspended', 'user_reactivated',
    'user_deleted', 'data_export', 'data_import'
  )),
  target_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null default 0
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  schema_version integer not null default 2,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.prevent_privilege_escalation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then
    return new;
  end if;
  if new.role is distinct from old.role or new.status is distinct from old.status or new.id is distinct from old.id then
    raise exception 'Members cannot change role, status, or id';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_no_escalation on public.profiles;
create trigger profiles_no_escalation before update on public.profiles
for each row execute function public.prevent_privilege_escalation();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role, status)
  values (new.id, coalesce(new.email, ''), '', 'member', 'active')
  on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.owned_table(
  table_name text
) returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', table_name);
end;
$$;

-- Owned application tables. Composite primary key lets two users keep the same local ids.
create table if not exists public.experiences (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  organization text not null default '',
  setting text not null default '',
  organization_type_id text,
  training_level_id text,
  term_id text,
  target_minutes integer not null check (target_minutes > 0),
  start_date text,
  end_date text,
  active boolean not null default true,
  primary key (user_id, id)
);

create table if not exists public.activity_types (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  short_name text not null,
  domain_id text,
  color text not null,
  default_duration integer not null check (default_duration > 0),
  category text not null check (category in ('direct', 'indirect', 'supervision')),
  active boolean not null default true,
  primary key (user_id, id)
);

create table if not exists public.supervisors (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  active boolean not null default true,
  primary key (user_id, id)
);

create table if not exists public.domains (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  active boolean not null default true,
  primary key (user_id, id)
);

create table if not exists public.organization_types (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  active boolean not null default true,
  primary key (user_id, id)
);

create table if not exists public.training_levels (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  active boolean not null default true,
  primary key (user_id, id)
);

create table if not exists public.terms (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  active boolean not null default true,
  primary key (user_id, id)
);

create table if not exists public.tags (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  active boolean not null default true,
  primary key (user_id, id)
);

create table if not exists public.demographics (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  kind text not null,
  active boolean not null default true,
  primary key (user_id, id)
);

create table if not exists public.activities (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  date text not null,
  start_time text not null default '',
  duration_minutes integer not null check (duration_minutes > 0),
  activity_type_id text not null,
  experience_id text not null,
  supervisor_id text,
  term_id text,
  setting text not null default '',
  client text not null default '',
  status text not null,
  notes text not null default '',
  created_at timestamptz,
  updated_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.activity_tags (
  user_id uuid not null references auth.users (id) on delete cascade,
  activity_id text not null,
  tag_id text not null,
  primary key (user_id, activity_id, tag_id)
);

create table if not exists public.experience_supervisors (
  user_id uuid not null references auth.users (id) on delete cascade,
  experience_id text not null,
  supervisor_id text not null,
  primary key (user_id, experience_id, supervisor_id)
);

create table if not exists public.clients (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  label text not null,
  primary key (user_id, id)
);

create table if not exists public.recurrence_series (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null default '{}'::jsonb,
  primary key (user_id, id)
);

create table if not exists public.requirements (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null default '{}'::jsonb,
  primary key (user_id, id)
);

create table if not exists public.saved_filters (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null default '{}'::jsonb,
  primary key (user_id, id)
);

create table if not exists public.saved_report_presets (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  payload jsonb not null default '{}'::jsonb,
  primary key (user_id, id)
);

do $$
declare
  owned text;
begin
  foreach owned in array array[
    'experiences', 'activity_types', 'supervisors', 'domains', 'organization_types', 'training_levels',
    'terms', 'tags', 'demographics', 'activities', 'experience_supervisors', 'clients',
    'recurrence_series', 'requirements', 'saved_filters', 'saved_report_presets', 'user_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', owned);
    execute format('drop policy if exists %I_select on public.%I', owned, owned);
    execute format('drop policy if exists %I_insert on public.%I', owned, owned);
    execute format('drop policy if exists %I_update on public.%I', owned, owned);
    execute format('drop policy if exists %I_delete on public.%I', owned, owned);
    execute format(
      'create policy %I_select on public.%I for select to authenticated using (user_id = auth.uid() and public.is_active_user())',
      owned, owned
    );
    execute format(
      'create policy %I_insert on public.%I for insert to authenticated with check (user_id = auth.uid() and public.is_active_user())',
      owned, owned
    );
    execute format(
      'create policy %I_update on public.%I for update to authenticated using (user_id = auth.uid() and public.is_active_user()) with check (user_id = auth.uid() and public.is_active_user())',
      owned, owned
    );
    execute format(
      'create policy %I_delete on public.%I for delete to authenticated using (user_id = auth.uid() and public.is_active_user())',
      owned, owned
    );
  end loop;
end;
$$;

alter table public.activity_tags enable row level security;
drop policy if exists activity_tags_related on public.activity_tags;
create policy activity_tags_related on public.activity_tags
for all to authenticated
using (
  user_id = auth.uid() and public.is_active_user()
  and exists (select 1 from public.activities a where a.user_id = auth.uid() and a.id = activity_id)
  and exists (select 1 from public.tags t where t.user_id = auth.uid() and t.id = tag_id)
)
with check (
  user_id = auth.uid() and public.is_active_user()
  and exists (select 1 from public.activities a where a.user_id = auth.uid() and a.id = activity_id)
  and exists (select 1 from public.tags t where t.user_id = auth.uid() and t.id = tag_id)
);

alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limits enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists invitations_admin_read on public.invitations;
create policy invitations_admin_read on public.invitations for select to authenticated
using (public.is_admin());

drop policy if exists audit_select_own on public.audit_logs;
create policy audit_select_own on public.audit_logs for select to authenticated
using (actor_id = auth.uid() or public.is_admin());

drop policy if exists audit_insert_own on public.audit_logs;
create policy audit_insert_own on public.audit_logs for insert to authenticated
with check (actor_id = auth.uid() and event in ('data_export', 'data_import'));

-- rate_limits and invitation writes are service-role / edge-function only (no authenticated policies).
revoke all on public.rate_limits from anon, authenticated;
grant select, insert, update, delete on public.rate_limits to service_role;
