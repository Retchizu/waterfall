-- `is_complete` was replaced by the status group. Refresh the deletion RPC so
-- status CRUD no longer reads the removed column.
create or replace function public.delete_issue_status(
  p_status_id uuid,
  p_replacement_status_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  issue_count integer;
begin
  if not exists (
    select 1
    from public.issue_statuses
    where id = p_status_id and user_id = current_user_id
  ) then
    raise exception 'Status not found';
  end if;

  if (select count(*) from public.issue_statuses where user_id = current_user_id) <= 1 then
    raise exception 'At least one status is required';
  end if;

  select count(*) into issue_count
  from public.issues
  where status_id = p_status_id;

  if issue_count > 0 then
    if p_replacement_status_id is null
       or p_replacement_status_id = p_status_id
       or not exists (
         select 1
         from public.issue_statuses
         where id = p_replacement_status_id and user_id = current_user_id
       ) then
      raise exception 'Choose a replacement status';
    end if;

    -- The issue-status trigger applies the replacement group's completion
    -- semantics, including clearing completed_at for non-completed groups.
    update public.issues
    set status_id = p_replacement_status_id
    where status_id = p_status_id;
  end if;

  delete from public.issue_statuses where id = p_status_id;
end;
$$;
