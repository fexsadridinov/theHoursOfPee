-- Invitations deliver a one-time password. The invited person must choose their own password
-- before the workspace opens, so track that state on the profile.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

create index if not exists profiles_email_lower_idx on public.profiles (lower(email));

-- Clearing the flag (only possible after a successful password update) closes the invitation.
create or replace function public.mark_invitation_accepted()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.must_change_password and not new.must_change_password then
    update public.invitations
       set accepted_at = now()
     where lower(email) = lower(new.email)
       and accepted_at is null
       and revoked_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_invitation_accepted on public.profiles;
create trigger profiles_invitation_accepted after update on public.profiles
for each row execute function public.mark_invitation_accepted();

revoke all on function public.mark_invitation_accepted() from public, anon, authenticated;
