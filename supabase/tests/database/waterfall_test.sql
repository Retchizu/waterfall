begin;

select plan(39);

select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'issues', 'issues table exists');
select has_table('public', 'issue_statuses', 'issue_statuses table exists');
select has_column('public', 'issues', 'status_id', 'issues use custom statuses');
select col_is_pk('public', 'projects', 'id', 'projects have a primary key');
select has_index('public', 'issues', 'issues_project_id_idx', 'issues are indexed by project');
select has_column('public', 'issue_statuses', 'group', 'statuses have a fixed group');
select has_table('public', 'github_installations', 'GitHub installations table exists');
select has_table('public', 'github_repositories', 'GitHub repositories table exists');
select has_table('public', 'github_issue_branches', 'GitHub branch links table exists');
select has_table('public', 'github_webhook_deliveries', 'GitHub webhook deliveries table exists');
select has_table('public', 'issue_automation_runs', 'automation audit runs table exists');
-- pgTAP bundled with the Supabase test runner has no `rls_enabled()` helper.
-- Assert PostgreSQL's catalog flag directly so this remains compatible with it.
select ok(
  (select relrowsecurity from pg_class where oid = 'public.projects'::regclass),
  'project RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.issues'::regclass),
  'issue RLS is enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.issue_statuses'::regclass),
  'status RLS is enabled'
);
select policies_are('public', 'projects', array['Users can manage their own projects'], 'projects expose only the owner policy');
select policies_are(
  'public',
  'issues',
  array['Users can create issues in their projects', 'Users can delete issues in their projects', 'Users can update issues in their projects', 'Users can view issues in their projects'],
  'issues expose only owner-scoped policies'
);
select policies_are('public', 'issue_statuses', array['Users can view their own issue statuses'], 'statuses expose only the owner policy');

insert into auth.users (id, aud, role, email)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'other@example.com');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*) from public.ensure_issue_statuses()),
  4::bigint,
  'a new user receives the four default statuses'
);
select is(
  (select count(*) from public.ensure_issue_statuses()),
  4::bigint,
  'default statuses are not duplicated'
);
select is(
  (select array_agg("group" order by "group") from public.ensure_issue_statuses()),
  array['backlog', 'cancelled', 'completed', 'started']::text[],
  'default statuses cover every fixed group'
);

insert into public.projects (user_id, name, key)
values ('11111111-1111-1111-1111-111111111111', 'Owner project', 'OWNER');

select is(
  (select number from public.create_issue((select id from public.projects where key = 'OWNER'), 'First issue')),
  1,
  'the first issue receives number one'
);
select is(
  (select number from public.create_issue((select id from public.projects where key = 'OWNER'), 'Second issue')),
  2,
  'issue numbers increment within a project'
);
select ok(
  (select completed_at is null from public.create_issue((select id from public.projects where key = 'OWNER'), 'Third issue')),
  'an issue in the default incomplete status is not completed'
);
select ok(
  (select completed_at is not null from public.create_issue((select id from public.projects where key = 'OWNER'), 'Completed issue', null, (select id from public.issue_statuses where user_id = auth.uid() and "group" = 'completed'), 1)),
  'an issue in a completed status receives a completion date'
);
select ok(
  (select completed_at is null from public.create_issue((select id from public.projects where key = 'OWNER'), 'Cancelled issue', null, (select id from public.issue_statuses where user_id = auth.uid() and "group" = 'cancelled'), 1)),
  'an issue in a cancelled status has no completion date'
);
update public.issues
set status_id = (select id from public.issue_statuses where user_id = auth.uid() and "group" = 'started')
where name = 'Completed issue';
select ok(
  (select completed_at is null from public.issues where name = 'Completed issue'),
  'moving an issue out of completed clears its completion date'
);
select public.create_issue(
  (select id from public.projects where key = 'OWNER'),
  'Delete completed status',
  null,
  (select id from public.issue_statuses where user_id = auth.uid() and "group" = 'completed'),
  1
);
select public.delete_issue_status(
  (select id from public.issue_statuses where user_id = auth.uid() and "group" = 'completed'),
  (select id from public.issue_statuses where user_id = auth.uid() and "group" = 'started')
);
select ok(
  not exists (select 1 from public.issue_statuses where user_id = auth.uid() and "group" = 'completed'),
  'a completed status can be deleted after status grouping'
);
select ok(
  (select completed_at is null from public.issues where name = 'Delete completed status'),
  'deleting a completed status applies the replacement completion semantics'
);

set local role postgres;
insert into public.projects (user_id, name, key)
values ('22222222-2222-2222-2222-222222222222', 'Other project', 'OTHER');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

select is(
  (select count(*) from public.projects where key = 'OTHER'),
  0::bigint,
  'users cannot read another user''s projects'
);
select is(
  (select count(*) from public.issue_statuses where user_id = '22222222-2222-2222-2222-222222222222'::uuid),
  0::bigint,
  'users cannot read another user''s statuses'
);

select public.add_issue_status('Code Review', 'started');
select public.add_issue_status('Released', 'completed');
select is(
  (select enabled from public.set_issue_status_automation(
    (select id from public.issue_statuses where user_id = auth.uid() and name = 'Code Review'),
    'pull_request_opened', true
  )),
  true,
  'a started status can receive the opened PR automation'
);

set local role postgres;
insert into public.github_installations (user_id, provider, github_installation_id, github_account_login, github_account_type)
values ('11111111-1111-1111-1111-111111111111', 'github_app', '9001', 'owner', 'User');
insert into public.github_repositories (installation_id, github_repository_id, owner_login, name, full_name)
values ((select id from public.github_installations where github_installation_id = '9001'), '7001', 'owner', 'repo', 'owner/repo');

select public.process_github_webhook(
  'delivery-create', 'create',
  jsonb_build_object('repository', jsonb_build_object('id', '7001'), 'ref_type', 'branch', 'ref', 'feat/OWNER-1-auth-page')
);
select is(
  (select count(*) from public.github_issue_branches where branch_name = 'feat/OWNER-1-auth-page'),
  1::bigint,
  'a branch-created delivery stores one issue link'
);

select public.process_github_webhook(
  'delivery-opened', 'pull_request',
  jsonb_build_object('action', 'opened', 'repository', jsonb_build_object('id', '7001'), 'pull_request', jsonb_build_object('head', jsonb_build_object('ref', 'feat/OWNER-1-auth-page')))
);
select is(
  (select status_id from public.issues where project_id = (select id from public.projects where key = 'OWNER') and number = 1),
  (select id from public.issue_statuses where user_id = '11111111-1111-1111-1111-111111111111'::uuid and name = 'Code Review'),
  'an opened pull request moves a linked issue to its configured status'
);
select is(
  (select count(*) from public.issue_automation_runs where trigger = 'pull_request_opened' and outcome = 'applied'),
  1::bigint,
  'an opened pull request creates an applied audit run'
);

select public.set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select public.set_issue_status_automation(
  (select id from public.issue_statuses where user_id = auth.uid() and name = 'Released'),
  'pull_request_merged', true
);
set local role postgres;
select public.process_github_webhook(
  'delivery-merged', 'pull_request',
  jsonb_build_object('action', 'closed', 'repository', jsonb_build_object('id', '7001'), 'pull_request', jsonb_build_object('merged', true, 'head', jsonb_build_object('ref', 'feat/OWNER-1-auth-page')))
);
select is(
  (select status_id from public.issues where project_id = (select id from public.projects where key = 'OWNER') and number = 1),
  (select id from public.issue_statuses where user_id = '11111111-1111-1111-1111-111111111111'::uuid and name = 'Released'),
  'a merged pull request moves a linked issue to its configured completed status'
);
select ok(
  (select completed_at is not null from public.issues where project_id = (select id from public.projects where key = 'OWNER') and number = 1),
  'the existing issue-status trigger records completion for a merged pull request'
);
select public.process_github_webhook(
  'delivery-merged', 'pull_request',
  jsonb_build_object('action', 'closed', 'repository', jsonb_build_object('id', '7001'), 'pull_request', jsonb_build_object('merged', true, 'head', jsonb_build_object('ref', 'feat/OWNER-1-auth-page')))
);
select is(
  (select count(*) from public.issue_automation_runs where trigger = 'pull_request_merged'),
  1::bigint,
  'a duplicate GitHub delivery does not run an automation twice'
);
update public.github_repositories set is_active = false where github_repository_id = '7001';
select public.process_github_webhook(
  'delivery-disabled-repository', 'create',
  jsonb_build_object('repository', jsonb_build_object('id', '7001'), 'ref_type', 'branch', 'ref', 'feat/OWNER-2-auth-page')
);
select is(
  (select outcome from public.github_webhook_deliveries where github_delivery_id = 'delivery-disabled-repository'),
  'ignored',
  'a delivery from a disabled repository is ignored'
);

select * from finish();
rollback;
