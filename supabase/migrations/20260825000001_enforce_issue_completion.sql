-- Keep the issue completion timestamp consistent with its workflow status.
-- The guard makes this safe when the schema has already been provisioned.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'issues_completed_at_matches_status_check'
      and conrelid = 'public.issues'::regclass
  ) then
    alter table public.issues
      add constraint issues_completed_at_matches_status_check
      check ((status = 'done') = (completed_at is not null));
  end if;
end;
$$;
