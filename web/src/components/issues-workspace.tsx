"use client";

import { Columns3, Edit3, Filter, FolderKanban, LayoutList, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { type DragEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownDescription } from "@/components/markdown-description";
import { createClient } from "@/lib/supabase/client";
import type { Issue, IssueStatus, Project } from "@/lib/supabase/database.types";

type Priority = 0 | 1 | 2 | 3;
type IssueForm = { projectId: string; name: string; description: string; statusId: string; priority: Priority };
type ViewMode = "list" | "board";
type GroupBy = "none" | "status" | "priority";
type SortBy = "updated" | "priority" | "number" | "completed-desc" | "completed-asc";
type ListPreferences = { view: ViewMode; statusIds: string[]; priorities: Priority[]; projectIds: string[]; groupBy: GroupBy; sortBy: SortBy; showCompleted: boolean };
const priorities: { value: Priority; label: string }[] = [{ value: 0, label: "Low" }, { value: 1, label: "Medium" }, { value: 2, label: "High" }, { value: 3, label: "Urgent" }];
const priorityClass: Record<Priority, string> = { 0: "bg-slate-100 text-slate-600", 1: "bg-blue-50 text-blue-700", 2: "bg-amber-50 text-amber-700", 3: "bg-rose-50 text-rose-700" };
const listPreferencesKey = "waterfall:issues-list-preferences";
const defaultListPreferences: ListPreferences = { view: "list", statusIds: [], priorities: [], projectIds: [], groupBy: "none", sortBy: "updated", showCompleted: true };
const emptyForm = (projectId = "", statusId = ""): IssueForm => ({ projectId, name: "", description: "", statusId, priority: 1 });
const toForm = (issue: Issue): IssueForm => ({ projectId: issue.project_id, name: issue.name, description: issue.description ?? "", statusId: issue.status_id, priority: Math.min(3, Math.max(0, issue.priority)) as Priority });

function isPriority(value: unknown): value is Priority { return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 3; }
function readListPreferences(): ListPreferences {
	try {
		const saved: unknown = JSON.parse(window.sessionStorage.getItem(listPreferencesKey) ?? "null");
		if (!saved || typeof saved !== "object") return defaultListPreferences;
		const value = saved as Partial<ListPreferences>;
		return {
			view: value.view === "board" ? "board" : "list",
			statusIds: Array.isArray(value.statusIds) ? value.statusIds.filter((id): id is string => typeof id === "string") : [],
			priorities: Array.isArray(value.priorities) ? value.priorities.filter(isPriority) : [],
			projectIds: Array.isArray(value.projectIds) ? value.projectIds.filter((id): id is string => typeof id === "string") : [],
			groupBy: value.groupBy === "status" || value.groupBy === "priority" ? value.groupBy : "none",
			sortBy: value.sortBy === "priority" || value.sortBy === "number" || value.sortBy === "completed-desc" || value.sortBy === "completed-asc" ? value.sortBy : "updated",
			showCompleted: typeof value.showCompleted === "boolean" ? value.showCompleted : true,
		};
	} catch { return defaultListPreferences; }
}

export function IssuesWorkspace({ initialIssues, projects, statuses, loadError }: { initialIssues: Issue[]; projects: Project[]; statuses: IssueStatus[]; loadError?: string }) {
	const router = useRouter();
	const [issues, setIssues] = useState(initialIssues);
	const [createForm, setCreateForm] = useState(() => emptyForm(projects[0]?.id, statuses[0]?.id));
	const [editForm, setEditForm] = useState<IssueForm>(emptyForm);
	const [creating, setCreating] = useState(false);
	const [editing, setEditing] = useState<Issue | null>(null);
	const [deleting, setDeleting] = useState<Issue | null>(null);
	const [draggingIssueId, setDraggingIssueId] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(loadError ?? null);
	const [saving, setSaving] = useState(false);
	const [listPreferences, setListPreferences] = useState<ListPreferences>(defaultListPreferences);
	const [preferencesReady, setPreferencesReady] = useState(false);

	// `router.refresh()` supplies a new server snapshot, but preserves this client
	// component's local state. Keep the board in step with status operations that
	// can move several issues at once (for example, deleting a status).
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- This state is a mutable copy of the refreshed server snapshot.
		setIssues(initialIssues);
	}, [initialIssues]);
	useEffect(() => {
		// eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage is available only after client hydration.
		setListPreferences(readListPreferences());
		setPreferencesReady(true);
	}, []);
	useEffect(() => {
		if (preferencesReady) window.sessionStorage.setItem(listPreferencesKey, JSON.stringify(listPreferences));
	}, [listPreferences, preferencesReady]);

	const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
	const statusById = useMemo(() => new Map(statuses.map((status) => [status.id, status])), [statuses]);
	const listIssues = useMemo(() => {
		const matches = issues.filter((issue) => {
			const priority = Math.min(3, Math.max(0, issue.priority)) as Priority;
			const status = statusById.get(issue.status_id);
			return (!listPreferences.statusIds.length || listPreferences.statusIds.includes(issue.status_id))
				&& (!listPreferences.priorities.length || listPreferences.priorities.includes(priority))
				&& (!listPreferences.projectIds.length || listPreferences.projectIds.includes(issue.project_id))
				&& (listPreferences.showCompleted || status?.group !== "completed");
		});
		return matches.sort((left, right) => {
			if (listPreferences.sortBy === "priority") return right.priority - left.priority || right.updated_at.localeCompare(left.updated_at);
			if (listPreferences.sortBy === "number") return right.number - left.number || right.updated_at.localeCompare(left.updated_at);
			if (listPreferences.sortBy === "completed-desc" || listPreferences.sortBy === "completed-asc") {
				if (!left.completed_at) return right.completed_at ? 1 : right.updated_at.localeCompare(left.updated_at);
				if (!right.completed_at) return -1;
				return listPreferences.sortBy === "completed-desc" ? right.completed_at.localeCompare(left.completed_at) : left.completed_at.localeCompare(right.completed_at);
			}
			return right.updated_at.localeCompare(left.updated_at);
		});
	}, [issues, listPreferences, statusById]);
	const hasListFilters = listPreferences.statusIds.length > 0 || listPreferences.priorities.length > 0 || listPreferences.projectIds.length > 0;
	const shownIssueCount = listPreferences.view === "list" ? listIssues.length : issues.length;
	function toggleSelection<Key extends string | number>(key: "statusIds" | "priorities" | "projectIds", value: Key) {
		setListPreferences((current) => {
			const selected = current[key] as Key[];
			return { ...current, [key]: selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value] } as ListPreferences;
		});
	}
	const validate = (form: IssueForm) => !form.projectId ? "Choose a project." : !form.statusId ? "Choose a status." : !form.name.trim() ? "Enter an issue title." : null;

	async function save(form: IssueForm, issue?: Issue) {
		const errorMessage = validate(form); if (errorMessage) throw new Error(errorMessage);
		const args = { p_project_id: form.projectId, p_name: form.name.trim(), p_description: form.description.trim() || null, p_status_id: form.statusId, p_priority: form.priority };
		const result = issue ? await createClient().rpc("update_issue", { ...args, p_issue_id: issue.id }) : await createClient().rpc("create_issue", args);
		if (result.error || !result.data) throw result.error ?? new Error("Could not save the issue.");
		return result.data;
	}
	async function submitCreate(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSaving(true); setMessage(null); try { const issue = await save(createForm); setIssues((current) => [issue, ...current]); setCreating(false); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create the issue."); } finally { setSaving(false); } }
	async function submitEdit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!editing) return; setSaving(true); setMessage(null); try { const issue = await save(editForm, editing); setIssues((current) => current.map((item) => item.id === issue.id ? issue : item)); setEditing(null); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not update the issue."); } finally { setSaving(false); } }
	async function confirmDelete() { if (!deleting) return; setSaving(true); setMessage(null); try { const { error } = await createClient().from("issues").delete().eq("id", deleting.id); if (error) throw error; setIssues((current) => current.filter((item) => item.id !== deleting.id)); setDeleting(null); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not delete the issue."); } finally { setSaving(false); } }
	async function moveIssue(issueId: string, statusId: string) {
		const issue = issues.find((item) => item.id === issueId);
		if (!issue || issue.status_id === statusId || saving) return;
		const previousIssues = issues;
		setDraggingIssueId(null); setSaving(true); setMessage(null);
		setIssues((current) => current.map((item) => item.id === issueId ? { ...item, status_id: statusId } : item));
		try { const updatedIssue = await save({ ...toForm(issue), statusId }, issue); setIssues((current) => current.map((item) => item.id === updatedIssue.id ? updatedIssue : item)); router.refresh(); }
		catch (error) { setIssues(previousIssues); setMessage(error instanceof Error ? error.message : "Could not move the issue."); }
		finally { setSaving(false); }
	}

	return <section className="flex min-h-[calc(100vh-3.5rem)] w-full flex-col p-6 sm:p-8 lg:p-10">
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-sky-600">Workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Issues</h1><p className="mt-2 text-slate-500">Track and resolve the work that keeps your projects moving.</p></div><div className="flex items-center gap-3"><span className="text-sm text-slate-500">{shownIssueCount} {shownIssueCount === 1 ? "issue" : "issues"}</span><Button disabled={!projects.length || !statuses.length} onClick={() => { setCreateForm(emptyForm(projects[0]?.id, statuses[0]?.id)); setMessage(null); setCreating(true); }} type="button"><Plus />Add issue</Button></div></div>
		{message && <p aria-live="polite" className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{message}</p>}
		{!projects.length ? <div className="mt-8 flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-14 text-center"><div><FolderKanban className="mx-auto size-8 text-slate-400" /><h2 className="mt-4 font-semibold text-slate-900">Create a project first</h2><p className="mt-1 text-sm text-slate-500">Issues must be linked to a project. Add one from Projects, then return here.</p></div></div> : <><IssueViewToolbar preferences={listPreferences} projects={projects} statuses={statuses} hasFilters={hasListFilters} onChange={setListPreferences} onResetFilters={() => setListPreferences((current) => ({ ...current, statusIds: [], priorities: [], projectIds: [] }))} onResetAll={() => setListPreferences(defaultListPreferences)} onToggle={toggleSelection} />{listPreferences.view === "list" ? <IssuesList issues={listIssues} groupBy={listPreferences.groupBy} projectsById={projectsById} statuses={statuses} statusById={statusById} onDelete={(issue) => { setDeleting(issue); setMessage(null); }} onEdit={(issue) => { setEditing(issue); setEditForm(toForm(issue)); setMessage(null); }} /> : <div className="mt-8 grid flex-1 gap-5" style={{ gridTemplateColumns: `repeat(${Math.max(statuses.length, 1)}, minmax(15rem, 1fr))` }}>{statuses.map((status) => { const items = issues.filter((issue) => issue.status_id === status.id); const isDropTarget = draggingIssueId !== null && !saving; return <div className={`rounded-2xl border bg-slate-50/70 p-4 transition-colors ${isDropTarget ? "border-sky-400 bg-sky-50/70" : status.group === "cancelled" ? "border-slate-300 bg-slate-100/70" : "border-slate-200"}`} key={status.id} onDragOver={(event) => { if (isDropTarget) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={(event) => { event.preventDefault(); if (draggingIssueId) void moveIssue(draggingIssueId, status.id); }}><div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-slate-900">{status.name}{status.group === "completed" && <span className="ml-2 text-xs font-medium text-emerald-700">Completed</span>}{status.group === "cancelled" && <span className="ml-2 text-xs font-medium text-slate-500">Cancelled</span>}</h2><span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{items.length}</span></div><div className="mt-4 grid min-h-24 gap-3">{items.length ? items.map((issue) => <IssueCard draggable={!saving} issue={issue} key={issue.id} project={projectsById.get(issue.project_id)} status={statusById.get(issue.status_id)} onDelete={() => { setDeleting(issue); setMessage(null); }} onDragEnd={() => setDraggingIssueId(null)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggingIssueId(issue.id); }} onEdit={() => { setEditing(issue); setEditForm(toForm(issue)); setMessage(null); }} />) : <p className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center text-sm text-slate-400">Drop an issue here</p>}</div></div>; })}</div>}</>}
		{creating && <IssueDialog form={createForm} setForm={setCreateForm} projects={projects} statuses={statuses} saving={saving} title="Add issue" onClose={() => setCreating(false)} onSubmit={submitCreate} />}
		{editing && <IssueDialog form={editForm} setForm={setEditForm} projects={projects} statuses={statuses} saving={saving} title="Save changes" onClose={() => setEditing(null)} onSubmit={submitEdit} />}
		{deleting && <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold text-slate-950">Delete issue?</h2><p className="mt-2 text-sm text-slate-600">This permanently deletes “{deleting.name}”.</p><div className="mt-6 flex justify-end gap-2"><Button disabled={saving} onClick={() => setDeleting(null)} type="button" variant="outline">Cancel</Button><Button disabled={saving} onClick={confirmDelete} type="button" variant="destructive">{saving ? "Deleting…" : "Delete"}</Button></div></div></div>}
	</section>;
}

function IssueViewToolbar({ preferences, projects, statuses, hasFilters, onChange, onResetFilters, onResetAll, onToggle }: { preferences: ListPreferences; projects: Project[]; statuses: IssueStatus[]; hasFilters: boolean; onChange: (preferences: ListPreferences | ((current: ListPreferences) => ListPreferences)) => void; onResetFilters: () => void; onResetAll: () => void; onToggle: <Key extends string | number>(key: "statusIds" | "priorities" | "projectIds", value: Key) => void }) {
	return <div className="mt-8 flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex rounded-lg bg-slate-100 p-1"><Button aria-pressed={preferences.view === "list"} className="aria-pressed:bg-white aria-pressed:shadow-sm" onClick={() => onChange((current) => ({ ...current, view: "list" }))} size="sm" type="button" variant="ghost"><LayoutList />List</Button><Button aria-pressed={preferences.view === "board"} className="aria-pressed:bg-white aria-pressed:shadow-sm" onClick={() => onChange((current) => ({ ...current, view: "board" }))} size="sm" type="button" variant="ghost"><Columns3 />Board</Button></div><details className="relative"><summary className="flex h-7 cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[0.8rem] font-medium text-slate-700 hover:bg-slate-50"><Filter className="size-3.5" />Filter{hasFilters && <span className="size-1.5 rounded-full bg-sky-500" />}</summary><div className="absolute left-0 z-20 mt-2 grid w-72 gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"><FilterSection label="Status">{statuses.map((status) => <CheckOption checked={preferences.statusIds.includes(status.id)} key={status.id} label={status.name} onChange={() => onToggle("statusIds", status.id)} />)}</FilterSection><FilterSection label="Priority">{priorities.map((priority) => <CheckOption checked={preferences.priorities.includes(priority.value)} key={priority.value} label={priority.label} onChange={() => onToggle("priorities", priority.value)} />)}</FilterSection><FilterSection label="Project">{projects.map((project) => <CheckOption checked={preferences.projectIds.includes(project.id)} key={project.id} label={`${project.key} — ${project.name}`} onChange={() => onToggle("projectIds", project.id)} />)}</FilterSection>{hasFilters && <Button onClick={onResetFilters} size="sm" type="button" variant="ghost">Clear filters</Button>}</div></details><label className="flex h-7 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[0.8rem] font-medium text-slate-700"><span className="sr-only">Group issues by</span>Group by<select className="bg-transparent outline-none" onChange={(event) => onChange((current) => ({ ...current, groupBy: event.target.value as GroupBy }))} value={preferences.groupBy}><option value="none">None</option><option value="status">Status</option><option value="priority">Priority</option></select></label><details className="relative"><summary className="flex h-7 cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-[0.8rem] font-medium text-slate-700 hover:bg-slate-50"><SlidersHorizontal className="size-3.5" />Options</summary><div className="absolute right-0 z-20 mt-2 grid w-60 gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"><label className="grid gap-1.5 text-sm font-medium text-slate-700">Sort by<select className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm" onChange={(event) => onChange((current) => ({ ...current, sortBy: event.target.value as SortBy }))} value={preferences.sortBy}><option value="updated">Recently updated</option><option value="priority">Priority</option><option value="number">Issue number</option><option value="completed-desc">Completed date (newest)</option><option value="completed-asc">Completed date (oldest)</option></select></label><CheckOption checked={preferences.showCompleted} label="Show completed issues" onChange={() => onChange((current) => ({ ...current, showCompleted: !current.showCompleted }))} /><Button onClick={onResetAll} size="sm" type="button" variant="ghost">Reset list options</Button></div></details></div>;
}

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) { return <fieldset className="grid gap-1.5"><legend className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</legend>{children}</fieldset>; }
function CheckOption({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) { return <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input checked={checked} className="size-3.5 accent-sky-600" onChange={onChange} type="checkbox" />{label}</label>; }

function IssuesList({ issues, groupBy, projectsById, statuses, statusById, onEdit, onDelete }: { issues: Issue[]; groupBy: GroupBy; projectsById: Map<string, Project>; statuses: IssueStatus[]; statusById: Map<string, IssueStatus>; onEdit: (issue: Issue) => void; onDelete: (issue: Issue) => void }) {
	const groups = groupBy === "status" ? statuses.map((status) => ({ key: status.id, label: status.name, issues: issues.filter((issue) => issue.status_id === status.id) })).filter((group) => group.issues.length) : groupBy === "priority" ? [...priorities].reverse().map((priority) => ({ key: String(priority.value), label: priority.label, issues: issues.filter((issue) => issue.priority === priority.value) })).filter((group) => group.issues.length) : [{ key: "all", label: "", issues }];
	return <div className="mt-6 grid gap-5">{issues.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-14 text-center"><h2 className="font-semibold text-slate-900">No matching issues</h2><p className="mt-1 text-sm text-slate-500">Adjust or clear your filters to see more work.</p></div> : groups.map((group) => <section key={group.key}>{groupBy !== "none" && <div className="mb-2 flex items-center gap-2"><h2 className="font-semibold text-slate-900">{group.label}</h2><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{group.issues.length}</span></div>}<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{group.issues.map((issue) => <IssueListRow issue={issue} key={issue.id} project={projectsById.get(issue.project_id)} status={statusById.get(issue.status_id)} onDelete={() => onDelete(issue)} onEdit={() => onEdit(issue)} />)}</div></section>)}</div>;
}

function IssueListRow({ issue, project, status, onEdit, onDelete }: { issue: Issue; project?: Project; status?: IssueStatus; onEdit: () => void; onDelete: () => void }) { const priority = Math.min(3, Math.max(0, issue.priority)) as Priority; const statusClass = status?.group === "completed" ? "bg-emerald-100 text-emerald-700" : status?.group === "cancelled" ? "bg-slate-200 text-slate-600 line-through" : "bg-slate-100 text-slate-700"; return <article className="flex flex-col gap-3 border-b border-slate-100 p-4 last:border-b-0 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><span className="text-xs font-bold tracking-wide text-sky-700">{project ? `${project.key}-${issue.number}` : `#${issue.number}`}</span><h3 className="font-medium text-slate-950">{issue.name}</h3></div>{issue.description && <MarkdownDescription className="mt-1" compact>{issue.description}</MarkdownDescription>}</div><div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className={`rounded-md px-2 py-1 text-xs font-medium ${statusClass}`}>{status?.name ?? "Unknown status"}</span><span className={`rounded-md px-2 py-1 text-xs font-medium ${priorityClass[priority]}`}>{priorities[priority].label}</span>{project && <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700">{project.name}</span>}<Button aria-label={`Edit ${issue.name}`} onClick={onEdit} size="icon-xs" type="button" variant="ghost"><Edit3 /></Button><Button aria-label={`Delete ${issue.name}`} onClick={onDelete} size="icon-xs" type="button" variant="ghost"><Trash2 className="text-rose-600" /></Button></div></article>; }

function IssueCard({ issue, project, status, draggable, onEdit, onDelete, onDragStart, onDragEnd }: { issue: Issue; project?: Project; status?: IssueStatus; draggable: boolean; onEdit: () => void; onDelete: () => void; onDragStart: (event: DragEvent<HTMLElement>) => void; onDragEnd: () => void }) { const priority = Math.min(3, Math.max(0, issue.priority)) as Priority; const statusClass = status?.group === "completed" ? "bg-emerald-100 text-emerald-700" : status?.group === "cancelled" ? "bg-slate-200 text-slate-600 line-through" : "bg-slate-100 text-slate-700"; return <article className="cursor-grab rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:cursor-grabbing" draggable={draggable} onDragEnd={onDragEnd} onDragStart={onDragStart}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-wide text-sky-700">{project ? `${project.key}-${issue.number}` : `#${issue.number}`}</p><h3 className="mt-1 font-medium text-slate-950">{issue.name}</h3></div><div className="flex gap-1"><Button aria-label={`Edit ${issue.name}`} onClick={onEdit} size="icon-xs" type="button" variant="ghost"><Edit3 /></Button><Button aria-label={`Delete ${issue.name}`} onClick={onDelete} size="icon-xs" type="button" variant="ghost"><Trash2 className="text-rose-600" /></Button></div></div>{issue.description && <MarkdownDescription className="mt-2" compact>{issue.description}</MarkdownDescription>}<div className="mt-4 flex flex-wrap gap-2"><span className={`rounded-md px-2 py-1 text-xs font-medium ${statusClass}`}>{status?.name ?? "Unknown status"}</span><span className={`rounded-md px-2 py-1 text-xs font-medium ${priorityClass[priority]}`}>{priorities[priority].label}</span>{project && <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700">{project.name}</span>}</div></article>; }

function IssueDialog({ title, form, setForm, projects, statuses, saving, onClose, onSubmit }: { title: string; form: IssueForm; setForm: (form: IssueForm) => void; projects: Project[]; statuses: IssueStatus[]; saving: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { const field = (key: keyof IssueForm, value: string) => setForm({ ...form, [key]: key === "priority" ? Number(value) as Priority : value }); return <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog"><form className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onSubmit={onSubmit}><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-950">{title === "Add issue" ? "Add issue" : "Update issue"}</h2><p className="mt-1 text-sm text-slate-600">Keep the details clear and assign the issue to a project.</p></div><Button aria-label="Close issue form" disabled={saving} onClick={onClose} size="icon-sm" type="button" variant="ghost"><X /></Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium text-slate-700">Project<select className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm" onChange={(event) => field("projectId", event.target.value)} value={form.projectId}>{projects.map((project) => <option key={project.id} value={project.id}>{project.key} — {project.name}</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">Status<select className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm" onChange={(event) => field("statusId", event.target.value)} value={form.statusId}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.name} ({status.group})</option>)}</select></label></div><label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-700">Title<Input autoFocus onChange={(event) => field("name", event.target.value)} placeholder="Describe the work" required value={form.name} /></label><label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-400">(optional, Markdown supported)</span><textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" onChange={(event) => field("description", event.target.value)} placeholder="Add useful context" value={form.description} /></label><label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-700">Priority<select className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm" onChange={(event) => field("priority", event.target.value)} value={form.priority}>{priorities.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select></label><div className="mt-6 flex justify-end gap-2"><Button disabled={saving} onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving…" : title}</Button></div></form></div>; }
