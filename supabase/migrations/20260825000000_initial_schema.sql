-- Waterfall's initial application schema.
-- Each project belongs to one authenticated user; issues inherit access through
-- their parent project.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  key text not null unique check (key ~ '^[A-Z][A-Z0-9_]{1,9}$'),
  issue_counter integer not null default 0 check (issue_counter >= 0),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  number integer not null check (number > 0),
  name text not null check (char_length(trim(name)) > 0),
  description text,
  status text not null default 'backlog'
    check (status in ('backlog', 'in_progress', 'done')),
  priority integer not null default 0 check (priority >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (project_id, number)
);

create index issues_project_id_idx on public.issues (project_id);
create index projects_user_id_idx on public.projects (user_id);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_projects_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger set_issues_updated_at
before update on public.issues
for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.issues enable row level security;

create policy "Users can manage their own projects"
on public.projects
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can view issues in their projects"
on public.issues
for select
to authenticated
using (
  exists (
    select 1 from public.projects
    where projects.id = issues.project_id
      and projects.user_id = (select auth.uid())
  )
);

create policy "Users can create issues in their projects"
on public.issues
for insert
to authenticated
with check (
  exists (
    select 1 from public.projects
    where projects.id = issues.project_id
      and projects.user_id = (select auth.uid())
  )
);

create policy "Users can update issues in their projects"
on public.issues
for update
to authenticated
using (
  exists (
    select 1 from public.projects
    where projects.id = issues.project_id
      and projects.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.projects
    where projects.id = issues.project_id
      and projects.user_id = (select auth.uid())
  )
);

create policy "Users can delete issues in their projects"
on public.issues
for delete
to authenticated
using (
  exists (
    select 1 from public.projects
    where projects.id = issues.project_id
      and projects.user_id = (select auth.uid())
  )
);
