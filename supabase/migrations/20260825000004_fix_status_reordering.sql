-- Qualify the status IDs expanded from the reorder array.
create or replace function public.reorder_issue_statuses(p_status_ids uuid[])
returns setof public.issue_statuses
language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); expected_count integer;
begin
  perform public.ensure_issue_statuses();
  select count(*) into expected_count from public.issue_statuses where user_id = current_user_id;
  if coalesce(array_length(p_status_ids, 1), 0) <> expected_count
     or (select count(distinct requested.status_id) from unnest(p_status_ids) as requested(status_id)) <> expected_count
     or exists (
       select 1
       from unnest(p_status_ids) as requested(status_id)
       left join public.issue_statuses status on status.id = requested.status_id and status.user_id = current_user_id
       where status.id is null
     ) then
    raise exception 'Status order is invalid';
  end if;
  update public.issue_statuses status
  set position = ordered.position + 1000
  from unnest(p_status_ids) with ordinality as ordered(id, position)
  where status.id = ordered.id and status.user_id = current_user_id;
  update public.issue_statuses set position = position - 1000 where user_id = current_user_id;
  return query select * from public.issue_statuses where user_id = current_user_id order by position;
end;
$$;
