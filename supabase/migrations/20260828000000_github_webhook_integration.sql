-- GitHub App connections, branch links, delivery diagnostics, and workflow
-- automations. Webhook processing is performed by the server-only RPC at the
-- bottom of this migration so each delivery is applied atomically.

create table public.github_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('github_app', 'github_oauth')),
  github_installation_id text unique,
  github_account_id text,
  github_account_login text,
  github_account_type text check (github_account_type in ('User', 'Organization')),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (provider = 'github_app' and github_installation_id is not null)
    or provider = 'github_oauth'
  )
);

create table public.github_repositories (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null references public.github_installations (id) on delete cascade,
  github_repository_id text not null unique,
  owner_login text not null,
  name text not null,
  full_name text not null,
  is_active boolean not null default true,
  last_successful_delivery_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (installation_id, full_name)
);

create table public.github_issue_branches (
  id uuid primary key default gen_random_uuid(),
  repository_id uuid not null references public.github_repositories (id) on delete cascade,
  issue_id uuid not null references public.issues (id) on delete cascade,
  branch_name text not null check (char_length(branch_name) > 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source text not null check (source in ('branch_created', 'pull_request')),
  is_deleted boolean not null default false,
  unique (repository_id, branch_name)
);

create table public.issue_status_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status_id uuid not null unique references public.issue_statuses (id) on delete restrict,
  trigger text not null check (trigger in ('pull_request_opened', 'pull_request_merged')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index issue_status_automations_one_enabled_trigger_per_user_idx
  on public.issue_status_automations (user_id, trigger)
  where enabled;

create table public.github_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  github_delivery_id text not null unique,
  event_name text not null,
  action text,
  repository_id uuid references public.github_repositories (id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  outcome text not null check (outcome in ('processed', 'ignored', 'failed', 'duplicate')),
  reason text,
  error text
);

create table public.issue_automation_runs (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues (id) on delete cascade,
  delivery_id uuid not null references public.github_webhook_deliveries (id) on delete cascade,
  trigger text not null check (trigger in ('pull_request_opened', 'pull_request_merged')),
  from_status_id uuid references public.issue_statuses (id) on delete set null,
  to_status_id uuid references public.issue_statuses (id) on delete set null,
  outcome text not null check (outcome in ('applied', 'skipped', 'failed')),
  reason text,
  created_at timestamptz not null default now(),
  unique (issue_id, delivery_id, trigger)
);

create index github_installations_user_id_idx on public.github_installations (user_id);
create index github_repositories_installation_id_idx on public.github_repositories (installation_id);
create index github_issue_branches_issue_id_idx on public.github_issue_branches (issue_id);
create index github_webhook_deliveries_repository_id_received_at_idx on public.github_webhook_deliveries (repository_id, received_at desc);
create index issue_automation_runs_issue_id_created_at_idx on public.issue_automation_runs (issue_id, created_at desc);

create trigger set_github_installations_updated_at
before update on public.github_installations
for each row execute function public.set_updated_at();

create trigger set_github_repositories_updated_at
before update on public.github_repositories
for each row execute function public.set_updated_at();

create trigger set_issue_status_automations_updated_at
before update on public.issue_status_automations
for each row execute function public.set_updated_at();

-- A merged-PR automation may only ever target a completed status, including
-- when a status is later edited into another workflow group.
create or replace function public.enforce_github_automation_status_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new."group" <> 'completed'
     and exists (
       select 1 from public.issue_status_automations
       where status_id = new.id
         and trigger = 'pull_request_merged'
         and enabled
     ) then
    raise exception 'A merged pull-request automation must target a completed status';
  end if;
  return new;
end;
$$;

create trigger enforce_github_automation_status_group_before_update
before update of "group" on public.issue_statuses
for each row execute function public.enforce_github_automation_status_group();

alter table public.github_installations enable row level security;
alter table public.github_repositories enable row level security;
alter table public.github_issue_branches enable row level security;
alter table public.issue_status_automations enable row level security;
alter table public.github_webhook_deliveries enable row level security;
alter table public.issue_automation_runs enable row level security;

create policy "Users can view their own GitHub installations"
on public.github_installations for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can view repositories from their GitHub installations"
on public.github_repositories for select to authenticated
using (exists (
  select 1 from public.github_installations installation
  where installation.id = github_repositories.installation_id
    and installation.user_id = (select auth.uid())
));

create policy "Users can view branch links from their GitHub installations"
on public.github_issue_branches for select to authenticated
using (exists (
  select 1
  from public.github_repositories repository
  join public.github_installations installation on installation.id = repository.installation_id
  where repository.id = github_issue_branches.repository_id
    and installation.user_id = (select auth.uid())
));

create policy "Users can view their own status automations"
on public.issue_status_automations for select to authenticated
using ((select auth.uid()) = user_id);

-- Webhook payloads deliberately have no browser policy. They are available to
-- the service role only, preventing an inbound GitHub payload from becoming a
-- user-readable data store.
create policy "Users can view automation runs for their own issues"
on public.issue_automation_runs for select to authenticated
using (exists (
  select 1
  from public.issues issue
  join public.projects project on project.id = issue.project_id
  where issue.id = issue_automation_runs.issue_id
    and project.user_id = (select auth.uid())
));

grant select on public.github_installations, public.github_repositories,
  public.github_issue_branches, public.issue_status_automations,
  public.issue_automation_runs to authenticated;
grant select, insert, update, delete on public.github_installations,
  public.github_repositories to service_role;

-- Called from the signed-in GitHub App setup callback. Repository details are
-- subsequently synchronized from installation webhook events.
create or replace function public.register_github_installation(p_github_installation_id text)
returns public.github_installations
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  installation public.github_installations;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if nullif(trim(p_github_installation_id), '') is null then
    raise exception 'GitHub installation ID is required';
  end if;

  select * into installation
  from public.github_installations
  where github_installation_id = trim(p_github_installation_id)
  for update;

  if found and installation.user_id <> current_user_id then
    raise exception 'This GitHub App installation belongs to another workspace';
  end if;

  if found then
    update public.github_installations
    set status = 'active'
    where id = installation.id
    returning * into installation;
  else
    insert into public.github_installations (user_id, provider, github_installation_id)
    values (current_user_id, 'github_app', trim(p_github_installation_id))
    returning * into installation;
  end if;
  return installation;
end;
$$;

-- Enabling a trigger replaces the prior enabled target for this workspace.
-- This makes the UI action deterministic even when two settings tabs race.
create or replace function public.set_issue_status_automation(
  p_status_id uuid,
  p_trigger text,
  p_enabled boolean default true
)
returns public.issue_status_automations
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_group text;
  automation public.issue_status_automations;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if p_trigger not in ('pull_request_opened', 'pull_request_merged') then
    raise exception 'Automation trigger is invalid';
  end if;

  select "group" into target_group
  from public.issue_statuses
  where id = p_status_id and user_id = current_user_id
  for update;
  if not found then raise exception 'Status not found'; end if;
  if p_enabled and p_trigger = 'pull_request_merged' and target_group <> 'completed' then
    raise exception 'Merged pull-request automation requires a completed status';
  end if;

  if p_enabled then
    update public.issue_status_automations
    set enabled = false
    where user_id = current_user_id
      and trigger = p_trigger
      and enabled
      and status_id <> p_status_id;
  end if;

  insert into public.issue_status_automations (user_id, status_id, trigger, enabled)
  values (current_user_id, p_status_id, p_trigger, p_enabled)
  on conflict (status_id) do update
  set trigger = excluded.trigger, enabled = excluded.enabled, user_id = excluded.user_id
  returning * into automation;
  return automation;
end;
$$;

-- Keep the status deletion RPC compatible with its restrict foreign key.
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
    select 1 from public.issue_statuses
    where id = p_status_id and user_id = current_user_id
  ) then raise exception 'Status not found'; end if;
  if (select count(*) from public.issue_statuses where user_id = current_user_id) <= 1 then
    raise exception 'At least one status is required';
  end if;

  select count(*) into issue_count from public.issues where status_id = p_status_id;
  if issue_count > 0 then
    if p_replacement_status_id is null
       or p_replacement_status_id = p_status_id
       or not exists (
         select 1 from public.issue_statuses
         where id = p_replacement_status_id and user_id = current_user_id
       ) then raise exception 'Choose a replacement status'; end if;
    update public.issues set status_id = p_replacement_status_id where status_id = p_status_id;
  end if;

  update public.issue_status_automations
  set enabled = false
  where status_id = p_status_id;
  delete from public.issue_status_automations where status_id = p_status_id;
  delete from public.issue_statuses where id = p_status_id;
end;
$$;

-- Match exactly one delimited issue key and resolve it only inside the
-- installation owner's workspace. This is intentionally server-only.
create or replace function public.resolve_github_branch_issue(
  p_user_id uuid,
  p_branch_name text
)
returns table (issue_id uuid, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_count integer;
  project_key text;
  issue_number text;
begin
  select count(*), max(matches[1]), max(matches[2])
  into match_count, project_key, issue_number
  from regexp_matches(
    p_branch_name,
    '(?i)(?:^|[\\/._-])([A-Z][A-Z0-9]*)-([0-9]+)(?=$|[\\/._-])',
    'g'
  ) as matches;

  if match_count = 0 then
    return query select null::uuid, 'no delimited issue identifier in branch';
    return;
  end if;
  if match_count > 1 then
    return query select null::uuid, 'branch contains multiple issue identifiers';
    return;
  end if;

  select issue.id into issue_id
  from public.issues issue
  join public.projects project on project.id = issue.project_id
  where project.user_id = p_user_id
    and upper(project.key) = upper(project_key)
    and issue.number = issue_number::integer;

  if issue_id is null then
    return query select null::uuid, format('no accessible issue matches %s-%s', upper(project_key), issue_number);
  else
    reason := null;
    return next;
  end if;
end;
$$;

-- Process a verified GitHub payload. The Edge Function verifies its signature
-- against the raw body before calling this function.
create or replace function public.process_github_webhook(
  p_github_delivery_id text,
  p_event_name text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery public.github_webhook_deliveries;
  repository public.github_repositories;
  installation public.github_installations;
  branch_link public.github_issue_branches;
  resolved_issue_id uuid;
  resolution_reason text;
  issue_row public.issues;
  current_status_group text;
  automation public.issue_status_automations;
  branch_name text;
  event_action text := nullif(p_payload ->> 'action', '');
  automation_trigger text;
  run_outcome text;
  run_reason text;
begin
  if nullif(trim(p_github_delivery_id), '') is null then raise exception 'GitHub delivery ID is required'; end if;
  if nullif(trim(p_event_name), '') is null then raise exception 'GitHub event name is required'; end if;

  insert into public.github_webhook_deliveries (
    github_delivery_id, event_name, action, payload, outcome
  ) values (trim(p_github_delivery_id), trim(p_event_name), event_action, p_payload, 'ignored')
  on conflict (github_delivery_id) do nothing
  returning * into delivery;

  if delivery.id is null then
    return jsonb_build_object('outcome', 'duplicate');
  end if;

  begin
    if p_event_name = 'installation' then
      select * into installation
      from public.github_installations
      where github_installation_id = p_payload #>> '{installation,id}';
      if installation.id is null then
        update public.github_webhook_deliveries
        set processed_at = now(), outcome = 'ignored', reason = 'installation is not connected'
        where id = delivery.id;
        return jsonb_build_object('outcome', 'ignored', 'reason', 'installation is not connected');
      end if;
      update public.github_installations
      set github_account_id = p_payload #>> '{installation,account,id}',
          github_account_login = p_payload #>> '{installation,account,login}',
          github_account_type = p_payload #>> '{installation,account,type}',
          status = case event_action when 'suspend' then 'suspended' when 'deleted' then 'deleted' else 'active' end
      where id = installation.id;
      update public.github_webhook_deliveries
      set processed_at = now(), outcome = 'processed', reason = 'installation synchronized'
      where id = delivery.id;
      return jsonb_build_object('outcome', 'processed');
    end if;

    if p_event_name = 'installation_repositories' then
      select * into installation
      from public.github_installations
      where github_installation_id = p_payload #>> '{installation,id}'
        and status = 'active';
      if installation.id is null then
        update public.github_webhook_deliveries
        set processed_at = now(), outcome = 'ignored', reason = 'installation is not connected or is inactive'
        where id = delivery.id;
        return jsonb_build_object('outcome', 'ignored', 'reason', 'installation is not connected or is inactive');
      end if;

      insert into public.github_repositories (
        installation_id, github_repository_id, owner_login, name, full_name, is_active
      )
      select
        installation.id,
        repository_payload ->> 'id',
        repository_payload #>> '{owner,login}',
        repository_payload ->> 'name',
        repository_payload ->> 'full_name',
        true
      from jsonb_array_elements(coalesce(p_payload -> 'repositories_added', '[]'::jsonb)) as repository_payload
      on conflict (github_repository_id) do update
      set installation_id = excluded.installation_id,
          owner_login = excluded.owner_login,
          name = excluded.name,
          full_name = excluded.full_name,
          is_active = true;

      update public.github_repositories
      set is_active = false
      where installation_id = installation.id
        and github_repository_id in (
          select repository_payload ->> 'id'
          from jsonb_array_elements(coalesce(p_payload -> 'repositories_removed', '[]'::jsonb)) as repository_payload
        );
      update public.github_webhook_deliveries
      set processed_at = now(), outcome = 'processed', reason = 'installation repositories synchronized'
      where id = delivery.id;
      return jsonb_build_object('outcome', 'processed');
    end if;

    select * into repository
    from public.github_repositories
    where github_repository_id = p_payload #>> '{repository,id}'
      and is_active;
    if repository.id is not null then
      select * into installation
      from public.github_installations
      where id = repository.installation_id and status = 'active';
    end if;

    if repository.id is null or installation.id is null then
      update public.github_webhook_deliveries
      set processed_at = now(), outcome = 'ignored', reason = 'repository is not connected or is disabled'
      where id = delivery.id;
      return jsonb_build_object('outcome', 'ignored', 'reason', 'repository is not connected or is disabled');
    end if;

    update public.github_webhook_deliveries set repository_id = repository.id where id = delivery.id;

    if p_event_name = 'create' and event_action is null and p_payload ->> 'ref_type' = 'branch' then
      branch_name := p_payload ->> 'ref';
      select issue_id, reason into resolved_issue_id, resolution_reason
      from public.resolve_github_branch_issue(installation.user_id, branch_name);
      if resolved_issue_id is null then
        update public.github_webhook_deliveries
        set processed_at = now(), outcome = 'ignored', reason = resolution_reason
        where id = delivery.id;
        update public.github_repositories set last_successful_delivery_at = now() where id = repository.id;
        return jsonb_build_object('outcome', 'ignored', 'reason', resolution_reason);
      end if;

      insert into public.github_issue_branches (repository_id, issue_id, branch_name, source)
      values (repository.id, resolved_issue_id, branch_name, 'branch_created')
      on conflict (repository_id, branch_name) do update
      set last_seen_at = now(), is_deleted = false;
      update public.github_webhook_deliveries
      set processed_at = now(), outcome = 'processed', reason = 'branch linked to issue'
      where id = delivery.id;
      update public.github_repositories set last_successful_delivery_at = now() where id = repository.id;
      return jsonb_build_object('outcome', 'processed');
    end if;

    if p_event_name = 'pull_request'
       and (event_action = 'opened' or (event_action = 'closed' and coalesce((p_payload #>> '{pull_request,merged}')::boolean, false))) then
      branch_name := p_payload #>> '{pull_request,head,ref}';
      if nullif(branch_name, '') is null then
        update public.github_webhook_deliveries
        set processed_at = now(), outcome = 'ignored', reason = 'pull request has no head branch'
        where id = delivery.id;
        return jsonb_build_object('outcome', 'ignored', 'reason', 'pull request has no head branch');
      end if;

      select * into branch_link from public.github_issue_branches
      where repository_id = repository.id and branch_name = branch_name and not is_deleted;
      if found then
        resolved_issue_id := branch_link.issue_id;
      else
        select issue_id, reason into resolved_issue_id, resolution_reason
        from public.resolve_github_branch_issue(installation.user_id, branch_name);
        if resolved_issue_id is not null then
          insert into public.github_issue_branches (repository_id, issue_id, branch_name, source)
          values (repository.id, resolved_issue_id, branch_name, 'pull_request')
          on conflict (repository_id, branch_name) do update
          set last_seen_at = now(), is_deleted = false;
        end if;
      end if;

      if resolved_issue_id is null then
        update public.github_webhook_deliveries
        set processed_at = now(), outcome = 'ignored', reason = coalesce(resolution_reason, 'no linked issue')
        where id = delivery.id;
        update public.github_repositories set last_successful_delivery_at = now() where id = repository.id;
        return jsonb_build_object('outcome', 'ignored', 'reason', coalesce(resolution_reason, 'no linked issue'));
      end if;

      automation_trigger := case when event_action = 'opened' then 'pull_request_opened' else 'pull_request_merged' end;
      select * into automation from public.issue_status_automations
      where user_id = installation.user_id and trigger = automation_trigger and enabled;
      -- A composite record target must be the sole target of an INTO clause.
      -- Fetch and lock the issue first, then read its status group separately.
      select issue.* into issue_row
      from public.issues issue
      where issue.id = resolved_issue_id
      for update;
      select status."group" into current_status_group
      from public.issue_statuses status
      where status.id = issue_row.status_id;

      if automation.id is null then
        run_outcome := 'skipped'; run_reason := 'no automation is configured';
      elsif automation_trigger = 'pull_request_opened' and current_status_group in ('completed', 'cancelled') then
        run_outcome := 'skipped'; run_reason := format('issue is already %s', current_status_group);
      elsif automation_trigger = 'pull_request_merged' and current_status_group = 'cancelled' then
        run_outcome := 'skipped'; run_reason := 'issue is cancelled';
      elsif issue_row.status_id = automation.status_id then
        run_outcome := 'skipped'; run_reason := 'issue is already in the automation target status';
      elsif automation_trigger = 'pull_request_merged' and current_status_group = 'completed' then
        run_outcome := 'skipped'; run_reason := 'issue is already completed';
      else
        update public.issues set status_id = automation.status_id where id = issue_row.id;
        run_outcome := 'applied'; run_reason := null;
      end if;

      insert into public.issue_automation_runs (
        issue_id, delivery_id, trigger, from_status_id, to_status_id, outcome, reason
      ) values (
        issue_row.id, delivery.id, automation_trigger, issue_row.status_id,
        automation.status_id, run_outcome, run_reason
      );
      update public.github_webhook_deliveries
      set processed_at = now(), outcome = 'processed', reason = coalesce(run_reason, 'issue status updated')
      where id = delivery.id;
      update public.github_repositories set last_successful_delivery_at = now() where id = repository.id;
      return jsonb_build_object('outcome', 'processed', 'run_outcome', run_outcome);
    end if;

    update public.github_webhook_deliveries
    set processed_at = now(), outcome = 'ignored', reason = 'event/action is not handled'
    where id = delivery.id;
    update public.github_repositories set last_successful_delivery_at = now() where id = repository.id;
    return jsonb_build_object('outcome', 'ignored', 'reason', 'event/action is not handled');
  exception when others then
    update public.github_webhook_deliveries
    set processed_at = now(), outcome = 'failed', error = left(sqlerrm, 500)
    where id = delivery.id;
    return jsonb_build_object('outcome', 'failed', 'error', 'webhook processing failed');
  end;
end;
$$;

revoke all on function public.register_github_installation(text) from public;
revoke all on function public.set_issue_status_automation(uuid, text, boolean) from public;
revoke all on function public.resolve_github_branch_issue(uuid, text) from public;
revoke all on function public.process_github_webhook(text, text, jsonb) from public;
grant execute on function public.register_github_installation(text),
  public.set_issue_status_automation(uuid, text, boolean) to authenticated;
grant execute on function public.process_github_webhook(text, text, jsonb) to service_role;
