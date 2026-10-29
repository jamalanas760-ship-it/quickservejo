-- Remove inherited project-default grants, including TRUNCATE which bypasses RLS.
revoke all on public.workspace_password_policies from public, anon, authenticated;
grant select, insert, update on public.workspace_password_policies to authenticated;
