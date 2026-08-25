"use client";

import { Edit3, FolderKanban, Plus, Trash2, X } from "lucide-react";
import { type DragEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import type { Issue, IssueStatus, Project } from "@/lib/supabase/database.types";

type Priority = 0 | 1 | 2 | 3;
type IssueForm = { projectId: string; name: string; description: string; statusId: string; priority: Priority };
const priorities: { value: Priority; label: string }[] = [{ value: 0, label: "Low" }, { value: 1, label: "Medium" }, { value: 2, label: "High" }, { value: 3, label: "Urgent" }];
const priorityClass: Record<Priority, string> = { 0: "bg-slate-100 text-slate-600", 1: "bg-blue-50 text-blue-700", 2: "bg-amber-50 text-amber-700", 3: "bg-rose-50 text-rose-700" };
const emptyForm = (projectId = "", statusId = ""): IssueForm => ({ projectId, name: "", description: "", statusId, priority: 1 });
const toForm = (issue: Issue): IssueForm => ({ projectId: issue.project_id, name: issue.name, description: issue.description ?? "", statusId: issue.status_id, priority: Math.min(3, Math.max(0, issue.priority)) as Priority });

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

	// `router.refresh()` supplies a new server snapshot, but preserves this client
	// component's local state. Keep the board in step with status operations that
	// can move several issues at once (for example, deleting a status).
	useEffect(() => {
		setIssues(initialIssues);
	}, [initialIssues]);

	const projectsById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
	const statusById = useMemo(() => new Map(statuses.map((status) => [status.id, status])), [statuses]);
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
		<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium text-sky-600">Workspace</p><h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Issues</h1><p className="mt-2 text-slate-500">Track and resolve the work that keeps your projects moving.</p></div><div className="flex items-center gap-3"><span className="text-sm text-slate-500">{issues.length} {issues.length === 1 ? "issue" : "issues"}</span><Button disabled={!projects.length || !statuses.length} onClick={() => { setCreateForm(emptyForm(projects[0]?.id, statuses[0]?.id)); setMessage(null); setCreating(true); }} type="button"><Plus />Add issue</Button></div></div>
		{message && <p aria-live="polite" className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{message}</p>}
		{!projects.length ? <div className="mt-8 flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-14 text-center"><div><FolderKanban className="mx-auto size-8 text-slate-400" /><h2 className="mt-4 font-semibold text-slate-900">Create a project first</h2><p className="mt-1 text-sm text-slate-500">Issues must be linked to a project. Add one from Projects, then return here.</p></div></div> : <div className="mt-8 grid flex-1 gap-5" style={{ gridTemplateColumns: `repeat(${Math.max(statuses.length, 1)}, minmax(15rem, 1fr))` }}>{statuses.map((status) => { const items = issues.filter((issue) => issue.status_id === status.id); const isDropTarget = draggingIssueId !== null && !saving; return <div className={`rounded-2xl border bg-slate-50/70 p-4 transition-colors ${isDropTarget ? "border-sky-400 bg-sky-50/70" : "border-slate-200"}`} key={status.id} onDragOver={(event) => { if (isDropTarget) { event.preventDefault(); event.dataTransfer.dropEffect = "move"; } }} onDrop={(event) => { event.preventDefault(); if (draggingIssueId) void moveIssue(draggingIssueId, status.id); }}><div className="flex items-center justify-between gap-2"><h2 className="font-semibold text-slate-900">{status.name}{status.is_complete && <span className="ml-2 text-xs font-medium text-emerald-700">Complete</span>}</h2><span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-500">{items.length}</span></div><div className="mt-4 grid min-h-24 gap-3">{items.length ? items.map((issue) => <IssueCard draggable={!saving} issue={issue} key={issue.id} project={projectsById.get(issue.project_id)} status={statusById.get(issue.status_id)} onDelete={() => { setDeleting(issue); setMessage(null); }} onDragEnd={() => setDraggingIssueId(null)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggingIssueId(issue.id); }} onEdit={() => { setEditing(issue); setEditForm(toForm(issue)); setMessage(null); }} />) : <p className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-4 py-8 text-center text-sm text-slate-400">Drop an issue here</p>}</div></div>; })}</div>}
		{creating && <IssueDialog form={createForm} setForm={setCreateForm} projects={projects} statuses={statuses} saving={saving} title="Add issue" onClose={() => setCreating(false)} onSubmit={submitCreate} />}
		{editing && <IssueDialog form={editForm} setForm={setEditForm} projects={projects} statuses={statuses} saving={saving} title="Save changes" onClose={() => setEditing(null)} onSubmit={submitEdit} />}
		{deleting && <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-lg font-semibold text-slate-950">Delete issue?</h2><p className="mt-2 text-sm text-slate-600">This permanently deletes “{deleting.name}”.</p><div className="mt-6 flex justify-end gap-2"><Button disabled={saving} onClick={() => setDeleting(null)} type="button" variant="outline">Cancel</Button><Button disabled={saving} onClick={confirmDelete} type="button" variant="destructive">{saving ? "Deleting…" : "Delete"}</Button></div></div></div>}
	</section>;
}

function IssueCard({ issue, project, status, draggable, onEdit, onDelete, onDragStart, onDragEnd }: { issue: Issue; project?: Project; status?: IssueStatus; draggable: boolean; onEdit: () => void; onDelete: () => void; onDragStart: (event: DragEvent<HTMLElement>) => void; onDragEnd: () => void }) { const priority = Math.min(3, Math.max(0, issue.priority)) as Priority; return <article className="cursor-grab rounded-xl border border-slate-200 bg-white p-4 shadow-sm active:cursor-grabbing" draggable={draggable} onDragEnd={onDragEnd} onDragStart={onDragStart}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold tracking-wide text-sky-700">{project ? `${project.key}-${issue.number}` : `#${issue.number}`}</p><h3 className="mt-1 font-medium text-slate-950">{issue.name}</h3></div><div className="flex gap-1"><Button aria-label={`Edit ${issue.name}`} onClick={onEdit} size="icon-xs" type="button" variant="ghost"><Edit3 /></Button><Button aria-label={`Delete ${issue.name}`} onClick={onDelete} size="icon-xs" type="button" variant="ghost"><Trash2 className="text-rose-600" /></Button></div></div>{issue.description && <p className="mt-2 line-clamp-3 text-sm leading-5 text-slate-500">{issue.description}</p>}<div className="mt-4 flex flex-wrap gap-2"><span className={`rounded-md px-2 py-1 text-xs font-medium ${status?.is_complete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{status?.name ?? "Unknown status"}</span><span className={`rounded-md px-2 py-1 text-xs font-medium ${priorityClass[priority]}`}>{priorities[priority].label}</span>{project && <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-medium text-violet-700">{project.name}</span>}</div></article>; }

function IssueDialog({ title, form, setForm, projects, statuses, saving, onClose, onSubmit }: { title: string; form: IssueForm; setForm: (form: IssueForm) => void; projects: Project[]; statuses: IssueStatus[]; saving: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) { const field = (key: keyof IssueForm, value: string) => setForm({ ...form, [key]: key === "priority" ? Number(value) as Priority : value }); return <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog"><form className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onSubmit={onSubmit}><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-950">{title === "Add issue" ? "Add issue" : "Update issue"}</h2><p className="mt-1 text-sm text-slate-600">Keep the details clear and assign the issue to a project.</p></div><Button aria-label="Close issue form" disabled={saving} onClick={onClose} size="icon-sm" type="button" variant="ghost"><X /></Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium text-slate-700">Project<select className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm" onChange={(event) => field("projectId", event.target.value)} value={form.projectId}>{projects.map((project) => <option key={project.id} value={project.id}>{project.key} — {project.name}</option>)}</select></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">Status<select className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm" onChange={(event) => field("statusId", event.target.value)} value={form.statusId}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.name}{status.is_complete ? " (Complete)" : ""}</option>)}</select></label></div><label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-700">Title<Input autoFocus onChange={(event) => field("name", event.target.value)} placeholder="Describe the work" required value={form.name} /></label><label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-400">(optional)</span><textarea className="min-h-24 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" onChange={(event) => field("description", event.target.value)} placeholder="Add useful context" value={form.description} /></label><label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-700">Priority<select className="h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-sm" onChange={(event) => field("priority", event.target.value)} value={form.priority}>{priorities.map((priority) => <option key={priority.value} value={priority.value}>{priority.label}</option>)}</select></label><div className="mt-6 flex justify-end gap-2"><Button disabled={saving} onClick={onClose} type="button" variant="outline">Cancel</Button><Button disabled={saving} type="submit">{saving ? "Saving…" : title}</Button></div></form></div>; }
