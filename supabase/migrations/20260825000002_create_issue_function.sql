-- Allocate a project-scoped issue number and create the issue in one transaction.
create or replace function public.create_issue(
  p_project_id uuid,
  p_name text,
  p_description text default null,
  p_status text default 'backlog',
  p_priority integer default 1
)
returns public.issues
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_number integer;
  new_issue public.issues;
begin
  update public.projects
  set issue_counter = issue_counter + 1
  where id = p_project_id
  returning issue_counter into next_number;

  if not found then
    raise exception 'Project not found or not accessible';
  end if;

  insert into public.issues (project_id, number, name, description, status, priority, completed_at)
  values (
    p_project_id,
    next_number,
    p_name,
    nullif(trim(p_description), ''),
    p_status,
    p_priority,
    case when p_status = 'done' then now() else null end
  )
  returning * into new_issue;

  return new_issue;
end;
$$;

revoke all on function public.create_issue(uuid, text, text, text, integer) from public;
grant execute on function public.create_issue(uuid, text, text, text, integer) to authenticated;

create or replace function public.update_issue(
  p_issue_id uuid,
  p_project_id uuid,
  p_name text,
  p_description text default null,
  p_status text default 'backlog',
  p_priority integer default 1
)
returns public.issues
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_issue public.issues;
  target_number integer;
  updated_issue public.issues;
begin
  select * into current_issue from public.issues where id = p_issue_id for update;
  if not found then raise exception 'Issue not found or not accessible'; end if;
  if current_issue.project_id <> p_project_id then
    update public.projects set issue_counter = issue_counter + 1 where id = p_project_id
    returning issue_counter into target_number;
    if not found then raise exception 'Target project not found or not accessible'; end if;
  else
    target_number := current_issue.number;
  end if;
  update public.issues set
    project_id = p_project_id, number = target_number, name = p_name,
    description = nullif(trim(p_description), ''), status = p_status, priority = p_priority,
    completed_at = case when p_status = 'done' then coalesce(current_issue.completed_at, now()) else null end
  where id = p_issue_id returning * into updated_issue;
  return updated_issue;
end;
$$;

revoke all on function public.update_issue(uuid, uuid, text, text, text, integer) from public;
grant execute on function public.update_issue(uuid, uuid, text, text, text, integer) to authenticated;
