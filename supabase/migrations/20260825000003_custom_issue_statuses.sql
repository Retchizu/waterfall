-- Replace the fixed issue workflow with user-owned, ordered statuses.
create table public.issue_statuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  position integer not null check (position >= 0),
  is_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, position)
);

create unique index issue_statuses_one_complete_per_user_idx
  on public.issue_statuses (user_id) where is_complete;

create trigger set_issue_statuses_updated_at
before update on public.issue_statuses
for each row execute function public.set_updated_at();

alter table public.issue_statuses enable row level security;

create policy "Users can view their own issue statuses"
on public.issue_statuses for select to authenticated
using ((select auth.uid()) = user_id);

-- Give every existing workspace its familiar starting workflow.
insert into public.issue_statuses (user_id, name, position, is_complete)
select workspace.user_id, seed.name, seed.position, seed.is_complete
from (select distinct user_id from public.projects) as workspace
cross join (values
  ('Backlog', 0, false),
  ('In progress', 1, false),
  ('Done', 2, true)
) as seed(name, position, is_complete)
on conflict (user_id, position) do nothing;

alter table public.issues add column status_id uuid;

update public.issues as issue
set status_id = status.id
from public.projects as project, public.issue_statuses as status
where project.id = issue.project_id
  and status.user_id = project.user_id
  and status.position = case issue.status
    when 'backlog' then 0
    when 'in_progress' then 1
    when 'done' then 2
  end;

alter table public.issues alter column status_id set not null;
alter table public.issues
  add constraint issues_status_id_fkey
  foreign key (status_id) references public.issue_statuses (id) on delete restrict;
create index issues_status_id_idx on public.issues (status_id);

alter table public.issues drop constraint if exists issues_completed_at_matches_status_check;
alter table public.issues drop column status;

-- Keep status ownership and completion dates correct even for direct table writes.
create or replace function public.apply_issue_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  status_is_complete boolean;
  status_owner_id uuid;
  project_owner_id uuid;
begin
  select user_id into project_owner_id from public.projects where id = new.project_id;
  select user_id, is_complete into status_owner_id, status_is_complete
  from public.issue_statuses where id = new.status_id;

  if project_owner_id is null or status_owner_id is null or status_owner_id <> project_owner_id then
    raise exception 'Status is not available for this project';
  end if;

  if status_is_complete then
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

create trigger apply_issue_status_before_write
before insert or update of project_id, status_id on public.issues
for each row execute function public.apply_issue_status();

-- Creating a project is not required before a user can set up their workflow.
create or replace function public.ensure_issue_statuses()
returns setof public.issue_statuses
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.issue_statuses where user_id = current_user_id) then
    insert into public.issue_statuses (user_id, name, position, is_complete)
    values
      (current_user_id, 'Backlog', 0, false),
      (current_user_id, 'In progress', 1, false),
      (current_user_id, 'Done', 2, true);
  end if;
  return query select * from public.issue_statuses where user_id = current_user_id order by position;
end;
$$;

create or replace function public.add_issue_status(p_name text)
returns public.issue_statuses
language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); created_status public.issue_statuses;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  perform public.ensure_issue_statuses();
  insert into public.issue_statuses (user_id, name, position)
  values (current_user_id, trim(p_name), (select coalesce(max(position), -1) + 1 from public.issue_statuses where user_id = current_user_id))
  returning * into created_status;
  return created_status;
end;
$$;

create or replace function public.rename_issue_status(p_status_id uuid, p_name text)
returns public.issue_statuses
language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); renamed_status public.issue_statuses;
begin
  update public.issue_statuses set name = trim(p_name)
  where id = p_status_id and user_id = current_user_id returning * into renamed_status;
  if not found then raise exception 'Status not found'; end if;
  return renamed_status;
end;
$$;

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
     or exists (select 1 from unnest(p_status_ids) as requested(status_id) left join public.issue_statuses status on status.id = requested.status_id and status.user_id = current_user_id where status.id is null) then
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

create or replace function public.set_complete_issue_status(p_status_id uuid)
returns public.issue_statuses
language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); completed_status public.issue_statuses;
begin
  if not exists (select 1 from public.issue_statuses where id = p_status_id and user_id = current_user_id) then
    raise exception 'Status not found';
  end if;
  update public.issue_statuses set is_complete = false where user_id = current_user_id and is_complete;
  update public.issue_statuses set is_complete = true where id = p_status_id returning * into completed_status;
  update public.issues set completed_at = coalesce(completed_at, now()) where status_id = p_status_id;
  update public.issues set completed_at = null
  where status_id in (select id from public.issue_statuses where user_id = current_user_id and not is_complete)
    and completed_at is not null;
  return completed_status;
end;
$$;

create or replace function public.delete_issue_status(p_status_id uuid, p_replacement_status_id uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare current_user_id uuid := auth.uid(); issue_count integer; status_is_complete boolean;
begin
  select is_complete into status_is_complete from public.issue_statuses where id = p_status_id and user_id = current_user_id;
  if not found then raise exception 'Status not found'; end if;
  if status_is_complete then raise exception 'Choose a different complete status before deleting this one'; end if;
  if (select count(*) from public.issue_statuses where user_id = current_user_id) <= 1 then raise exception 'At least one status is required'; end if;
  select count(*) into issue_count from public.issues where status_id = p_status_id;
  if issue_count > 0 then
    if p_replacement_status_id is null or p_replacement_status_id = p_status_id
       or not exists (select 1 from public.issue_statuses where id = p_replacement_status_id and user_id = current_user_id) then
      raise exception 'Choose a replacement status';
    end if;
    update public.issues set status_id = p_replacement_status_id where status_id = p_status_id;
  end if;
  delete from public.issue_statuses where id = p_status_id;
end;
$$;

drop function if exists public.create_issue(uuid, text, text, text, integer);
drop function if exists public.update_issue(uuid, uuid, text, text, text, integer);

create function public.create_issue(
  p_project_id uuid, p_name text, p_description text default null,
  p_status_id uuid default null, p_priority integer default 1
) returns public.issues language plpgsql security invoker set search_path = '' as $$
declare next_number integer; new_issue public.issues; selected_status_id uuid;
begin
  update public.projects set issue_counter = issue_counter + 1 where id = p_project_id returning issue_counter into next_number;
  if not found then raise exception 'Project not found or not accessible'; end if;
  selected_status_id := coalesce(p_status_id, (select id from public.issue_statuses where user_id = auth.uid() order by position limit 1));
  if selected_status_id is null then raise exception 'Create a status before creating an issue'; end if;
  insert into public.issues (project_id, number, name, description, status_id, priority)
  values (p_project_id, next_number, p_name, nullif(trim(p_description), ''), selected_status_id, p_priority)
  returning * into new_issue;
  return new_issue;
end;
$$;

create function public.update_issue(
  p_issue_id uuid, p_project_id uuid, p_name text, p_description text default null,
  p_status_id uuid default null, p_priority integer default 1
) returns public.issues language plpgsql security invoker set search_path = '' as $$
declare current_issue public.issues; target_number integer; updated_issue public.issues;
begin
  select * into current_issue from public.issues where id = p_issue_id for update;
  if not found then raise exception 'Issue not found or not accessible'; end if;
  if current_issue.project_id <> p_project_id then
    update public.projects set issue_counter = issue_counter + 1 where id = p_project_id returning issue_counter into target_number;
    if not found then raise exception 'Target project not found or not accessible'; end if;
  else target_number := current_issue.number; end if;
  update public.issues set project_id = p_project_id, number = target_number, name = p_name,
    description = nullif(trim(p_description), ''), status_id = coalesce(p_status_id, current_issue.status_id), priority = p_priority
  where id = p_issue_id returning * into updated_issue;
  return updated_issue;
end;
$$;

revoke all on function public.ensure_issue_statuses() from public;
revoke all on function public.add_issue_status(text) from public;
revoke all on function public.rename_issue_status(uuid, text) from public;
revoke all on function public.reorder_issue_statuses(uuid[]) from public;
revoke all on function public.set_complete_issue_status(uuid) from public;
revoke all on function public.delete_issue_status(uuid, uuid) from public;
revoke all on function public.create_issue(uuid, text, text, uuid, integer) from public;
revoke all on function public.update_issue(uuid, uuid, text, text, uuid, integer) from public;
grant execute on function public.ensure_issue_statuses(), public.add_issue_status(text), public.rename_issue_status(uuid, text), public.reorder_issue_statuses(uuid[]), public.set_complete_issue_status(uuid), public.delete_issue_status(uuid, uuid), public.create_issue(uuid, text, text, uuid, integer), public.update_issue(uuid, uuid, text, text, uuid, integer) to authenticated;
