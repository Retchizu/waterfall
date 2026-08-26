-- RLS controls which rows authenticated users can access, but table privileges
-- are still required before those policies (and security-invoker RPCs) can run.
grant select, insert, update, delete on table public.projects to authenticated;
grant select, insert, update, delete on table public.issues to authenticated;
grant select on table public.issue_statuses to authenticated;
