begin;

select plan(24);

select has_table('public', 'projects', 'projects table exists');
select has_table('public', 'issues', 'issues table exists');
select has_table('public', 'issue_statuses', 'issue_statuses table exists');
select has_column('public', 'issues', 'status_id', 'issues use custom statuses');
select col_is_pk('public', 'projects', 'id', 'projects have a primary key');
select has_index('public', 'issues', 'issues_project_id_idx', 'issues are indexed by project');
select has_column('public', 'issue_statuses', 'group', 'statuses have a fixed group');
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
