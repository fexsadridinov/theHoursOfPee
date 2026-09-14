-- Placements are jobs/sites. Hours belong to one placement so people can
-- separate two jobs and export a report for each.

create table if not exists public.placements (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  site text not null default '',
  supervisor_id text,
  start_date text,
  end_date text,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (user_id, id)
);

alter table public.activities add column if not exists placement_id text;

insert into public.placements (user_id, id, name, site, supervisor_id, start_date, end_date, active)
select
  e.user_id,
  e.id,
  e.name,
  coalesce(nullif(e.organization, ''), e.setting, ''),
  (
    select es.supervisor_id
    from public.experience_supervisors es
    where es.user_id = e.user_id and es.experience_id = e.id
    limit 1
  ),
  e.start_date,
  e.end_date,
  e.active
from public.experiences e
on conflict (user_id, id) do nothing;

update public.activities
   set placement_id = experience_id
 where placement_id is null
   and experience_id is not null
   and experience_id <> '';

-- Known older type ids become the fixed catalog slugs.
update public.activities set activity_type_id = 'direct-individual' where activity_type_id = 'type-direct';
update public.activities set activity_type_id = 'indirect-records' where activity_type_id = 'type-indirect';
update public.activities set activity_type_id = 'indirect-supervision' where activity_type_id in ('type-supervision', 'type-indirect-supervision');

alter table public.placements enable row level security;

drop policy if exists placements_select on public.placements;
drop policy if exists placements_insert on public.placements;
drop policy if exists placements_update on public.placements;
drop policy if exists placements_delete on public.placements;

create policy placements_select on public.placements
  for select to authenticated
  using (user_id = auth.uid() and public.is_active_user());

create policy placements_insert on public.placements
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user());

create policy placements_update on public.placements
  for update to authenticated
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid() and public.is_active_user());

create policy placements_delete on public.placements
  for delete to authenticated
  using (user_id = auth.uid() and public.is_active_user());

grant select, insert, update, delete on public.placements to authenticated;

create index if not exists placements_user_idx on public.placements (user_id);
create index if not exists activities_user_placement_idx on public.activities (user_id, placement_id);
