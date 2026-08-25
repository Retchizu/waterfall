begin;

select plan(20);

select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'issues', 'issues table exists');
select has_table('public', 'issue_statuses', 'issue_statuses table exists');
select has_column('public', 'issues', 'status_id', 'issues use custom statuses');
select col_is_pk('public', 'projects', 'id', 'projects have a primary key');
select has_index('public', 'issues', 'issues_project_id_idx', 'issues are indexed by project');
select has_index('public', 'issue_statuses', 'issue_statuses_one_complete_per_user_idx', 'a user has at most one complete status');
select rls_enabled('public', 'projects', 'project RLS is enabled');
select rls_enabled('public', 'issues', 'issue RLS is enabled');
select rls_enabled('public', 'issue_statuses', 'status RLS is enabled');
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
  3::bigint,
  'a new user receives the three default statuses'
);
select is(
  (select count(*) from public.ensure_issue_statuses()),
  3::bigint,
  'default statuses are not duplicated'
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

select * from finish();
rollback;
