-- Classify every custom status into a fixed workflow group.
alter table public.issue_statuses add column "group" text;

with ranked_statuses as (
  select
    id,
    case
      when is_complete then 'completed'
      when row_number() over (partition by user_id, is_complete order by position) = 1 then 'backlog'
      else 'started'
    end as status_group
  from public.issue_statuses
)
update public.issue_statuses as status
set "group" = ranked_statuses.status_group
from ranked_statuses
where status.id = ranked_statuses.id;

alter table public.issue_statuses alter column "group" set not null;
alter table public.issue_statuses
  add constraint issue_statuses_group_check
  check ("group" in ('backlog', 'started', 'completed', 'cancelled'));

-- Positions are now scoped to a group rather than the complete workflow.
alter table public.issue_statuses drop constraint issue_statuses_user_id_position_key;
update public.issue_statuses set position = position + 1000;
with ranked_statuses as (
  select id, row_number() over (partition by user_id, "group" order by position) - 1 as next_position
  from public.issue_statuses
)
update public.issue_statuses as status
set position = ranked_statuses.next_position
from ranked_statuses
where status.id = ranked_statuses.id;
alter table public.issue_statuses
  add constraint issue_statuses_user_group_position_key unique (user_id, "group", position);

-- Existing workflows gain a terminal cancellation status.
insert into public.issue_statuses (user_id, name, "group", position)
select status.user_id, 'Cancelled', 'cancelled', 0
from public.issue_statuses as status
group by status.user_id
having not bool_or(status."group" = 'cancelled');

drop index public.issue_statuses_one_complete_per_user_idx;
alter table public.issue_statuses drop column is_complete;

create or replace function public.apply_issue_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  status_group text;
  status_owner_id uuid;
  project_owner_id uuid;
begin
  select user_id into project_owner_id from public.projects where id = new.project_id;
  select user_id, "group" into status_owner_id, status_group
  from public.issue_statuses where id = new.status_id;

  if project_owner_id is null or status_owner_id is null or status_owner_id <> project_owner_id then
    raise exception 'Status is not available for this project';
  end if;

  if status_group = 'completed' then
    if tg_op = 'UPDATE' then
      new.completed_at := coalesce(old.completed_at, new.completed_at, now());
    else
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.ensure_issue_statuses()
returns setof public.issue_statuses
language plpgsql
security definer
set search_path = ''
as $$
declare current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.issue_statuses where user_id = current_user_id) then
    insert into public.issue_statuses (user_id, name, "group", position)
    values
      (current_user_id, 'Backlog', 'backlog', 0),
      (current_user_id, 'Started', 'started', 0),
      (current_user_id, 'Completed', 'completed', 0),
      (current_user_id, 'Cancelled', 'cancelled', 0);
  end if;
  return query
    select * from public.issue_statuses
    where user_id = current_user_id
    order by case "group" when 'backlog' then 0 when 'started' then 1 when 'completed' then 2 else 3 end, position;
end;
$$;

drop function public.add_issue_status(text);
create function public.add_issue_status(p_name text, p_group text)
returns public.issue_statuses
language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); created_status public.issue_statuses;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_group not in ('backlog', 'started', 'completed', 'cancelled') then raise exception 'Status group is invalid'; end if;
  perform public.ensure_issue_statuses();
  insert into public.issue_statuses (user_id, name, "group", position)
  values (current_user_id, trim(p_name), p_group, (select coalesce(max(position), -1) + 1 from public.issue_statuses where user_id = current_user_id and "group" = p_group))
  returning * into created_status;
  return created_status;
end;
$$;

drop function public.rename_issue_status(uuid, text);
create function public.rename_issue_status(p_status_id uuid, p_name text, p_group text)
returns public.issue_statuses
language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); renamed_status public.issue_statuses; previous_group text;
begin
  if p_group not in ('backlog', 'started', 'completed', 'cancelled') then raise exception 'Status group is invalid'; end if;
  select "group" into previous_group from public.issue_statuses where id = p_status_id and user_id = current_user_id for update;
  if not found then raise exception 'Status not found'; end if;
  if previous_group <> p_group then
    update public.issue_statuses set position = position + 1000 where user_id = current_user_id and "group" = p_group;
    update public.issue_statuses set name = trim(p_name), "group" = p_group, position = 0 where id = p_status_id returning * into renamed_status;
    update public.issue_statuses set position = position + 1000 where user_id = current_user_id and "group" = previous_group;
    with ranked_statuses as (select id, row_number() over (order by position) - 1 as next_position from public.issue_statuses where user_id = current_user_id and "group" = previous_group)
    update public.issue_statuses as status set position = ranked_statuses.next_position from ranked_statuses where status.id = ranked_statuses.id;
    with ranked_statuses as (select id, row_number() over (order by position) - 1 as next_position from public.issue_statuses where user_id = current_user_id and "group" = p_group)
    update public.issue_statuses as status set position = ranked_statuses.next_position from ranked_statuses where status.id = ranked_statuses.id;
    update public.issues set status_id = status_id where status_id = p_status_id;
  else
    update public.issue_statuses set name = trim(p_name) where id = p_status_id returning * into renamed_status;
  end if;
  return renamed_status;
end;
$$;

drop function public.reorder_issue_statuses(uuid[]);
create function public.reorder_issue_statuses(p_group text, p_status_ids uuid[])
returns setof public.issue_statuses
language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); expected_count integer;
begin
  if p_group not in ('backlog', 'started', 'completed', 'cancelled') then raise exception 'Status group is invalid'; end if;
  perform public.ensure_issue_statuses();
  select count(*) into expected_count from public.issue_statuses where user_id = current_user_id and "group" = p_group;
  if coalesce(array_length(p_status_ids, 1), 0) <> expected_count
     or (select count(distinct requested.status_id) from unnest(p_status_ids) as requested(status_id)) <> expected_count
     or exists (select 1 from unnest(p_status_ids) as requested(status_id) left join public.issue_statuses status on status.id = requested.status_id and status.user_id = current_user_id and status."group" = p_group where status.id is null) then
    raise exception 'Status order is invalid';
  end if;
  update public.issue_statuses status set position = ordered.position + 1000 from unnest(p_status_ids) with ordinality as ordered(id, position) where status.id = ordered.id and status.user_id = current_user_id;
  update public.issue_statuses set position = position - 1000 where user_id = current_user_id and "group" = p_group;
  return query select * from public.issue_statuses where user_id = current_user_id and "group" = p_group order by position;
end;
$$;

drop function public.set_complete_issue_status(uuid);

create or replace function public.create_issue(
  p_project_id uuid, p_name text, p_description text default null,
  p_status_id uuid default null, p_priority integer default 1
) returns public.issues language plpgsql security invoker set search_path = '' as $$
declare next_number integer; new_issue public.issues; selected_status_id uuid;
begin
  update public.projects set issue_counter = issue_counter + 1 where id = p_project_id returning issue_counter into next_number;
  if not found then raise exception 'Project not found or not accessible'; end if;
  selected_status_id := coalesce(p_status_id, (select id from public.issue_statuses where user_id = auth.uid() order by case "group" when 'backlog' then 0 when 'started' then 1 when 'completed' then 2 else 3 end, position limit 1));
  if selected_status_id is null then raise exception 'Create a status before creating an issue'; end if;
  insert into public.issues (project_id, number, name, description, status_id, priority)
  values (p_project_id, next_number, p_name, nullif(trim(p_description), ''), selected_status_id, p_priority)
  returning * into new_issue;
  return new_issue;
end;
$$;

revoke all on function public.add_issue_status(text, text) from public;
revoke all on function public.rename_issue_status(uuid, text, text) from public;
revoke all on function public.reorder_issue_statuses(text, uuid[]) from public;
grant execute on function public.add_issue_status(text, text), public.rename_issue_status(uuid, text, text), public.reorder_issue_statuses(text, uuid[]) to authenticated;
