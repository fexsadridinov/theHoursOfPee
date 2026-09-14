-- Tighten helper function grants. RLS still uses is_active_user/is_admin as SECURITY DEFINER.

alter function public.set_updated_at() set search_path = public;
alter function public.owned_table(text) set search_path = public;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.prevent_privilege_escalation() from public, anon, authenticated;
revoke all on function public.owned_table(text) from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

revoke all on function public.is_active_user() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.is_admin() to authenticated;
