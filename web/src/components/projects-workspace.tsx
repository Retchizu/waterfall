"use client";

import { Edit3, FolderKanban, Plus, Trash2, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MarkdownDescription } from "@/components/markdown-description";
import type { Project } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/client";

type ProjectForm = { name: string; key: string; description: string };
const emptyForm: ProjectForm = { name: "", key: "", description: "" };

function toProjectForm(project: Project): ProjectForm {
	return {
		name: project.name,
		key: project.key,
		description: project.description ?? "",
	};
}

function validate(form: ProjectForm) {
	if (!form.name.trim()) return "Enter a project name.";
	if (!/^[A-Z]{3}$/.test(form.key)) {
		return "Project key must be exactly three letters.";
	}
	return null;
}

function formatDate(value: string) {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

type ProjectsWorkspaceProps = {
	initialProjects: Project[];
	issueCounts: Record<string, number>;
	loadError?: string;
};

export function ProjectsWorkspace({
	initialProjects,
	issueCounts,
	loadError,
}: ProjectsWorkspaceProps) {
	const router = useRouter();
	const [projects, setProjects] = useState(initialProjects);
	const [createForm, setCreateForm] = useState(emptyForm);
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editForm, setEditForm] = useState(emptyForm);
	const [deleteProject, setDeleteProject] = useState<Project | null>(null);
	const [deleteName, setDeleteName] = useState("");
	const [message, setMessage] = useState<string | null>(loadError ?? null);
	const [isSaving, setIsSaving] = useState(false);

	const updateForm = (
		setForm: (form: ProjectForm) => void,
		form: ProjectForm,
		field: keyof ProjectForm,
		value: string,
	) => {
		setForm({
			...form,
			[field]: field === "key" ? value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) : value,
		});
	};

	const createProject = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const error = validate(createForm);
		if (error) return setMessage(error);

		setIsSaving(true);
		setMessage(null);
		try {
			const supabase = createClient();
			const { data: auth, error: authError } = await supabase.auth.getUser();
			if (authError || !auth.user) throw new Error("Your session has ended. Please log in again.");
			const { data, error: insertError } = await supabase
				.from("projects")
				.insert({
					user_id: auth.user.id,
					name: createForm.name.trim(),
					key: createForm.key,
					description: createForm.description.trim() || null,
				})
				.select()
				.single();
			if (insertError) throw insertError;
			setProjects((current) => [data, ...current]);
			setCreateForm(emptyForm);
			setIsCreateOpen(false);
			router.refresh();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Could not create the project.");
		} finally {
			setIsSaving(false);
		}
	};

	const saveEdit = async (event: FormEvent<HTMLFormElement>, project: Project) => {
		event.preventDefault();
		const error = validate(editForm);
		if (error) return setMessage(error);

		setIsSaving(true);
		setMessage(null);
		try {
			const supabase = createClient();
			const { data, error: updateError } = await supabase
				.from("projects")
				.update({
					name: editForm.name.trim(),
					key: editForm.key,
					description: editForm.description.trim() || null,
				})
				.eq("id", project.id)
				.select()
				.single();
			if (updateError) throw updateError;
			setProjects((current) => current.map((item) => (item.id === data.id ? data : item)));
			setEditingId(null);
			router.refresh();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Could not update the project.");
		} finally {
			setIsSaving(false);
		}
	};

	const confirmDelete = async () => {
		if (!deleteProject || deleteName !== deleteProject.name) return;
		setIsSaving(true);
		setMessage(null);
		try {
			const supabase = createClient();
			const { error } = await supabase.from("projects").delete().eq("id", deleteProject.id);
			if (error) throw error;
			setProjects((current) => current.filter((item) => item.id !== deleteProject.id));
			setDeleteProject(null);
			setDeleteName("");
			router.refresh();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Could not delete the project.");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<section className="flex min-h-[calc(100vh-3.5rem)] w-full flex-col p-6 sm:p-8 lg:p-10">
			<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
				<div>
					<p className="text-sm font-medium text-sky-600">Workspace</p>
					<h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">Projects</h1>
					<p className="mt-2 text-slate-500">Organize the work your team is moving forward.</p>
				</div>
				<div className="flex items-center gap-3">
					<span className="text-sm text-slate-500">{projects.length} {projects.length === 1 ? "project" : "projects"}</span>
					<Button onClick={() => { setIsCreateOpen(true); setMessage(null); }} type="button"><Plus />Add project</Button>
				</div>
			</div>

			{message && <p aria-live="polite" className="mt-6 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{message}</p>}

			<div className="mt-8 flex-1">
				{projects.length === 0 ? <div className="flex min-h-80 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-6 py-14 text-center"><div><FolderKanban className="mx-auto size-8 text-slate-400" /><h2 className="mt-4 font-semibold text-slate-900">No projects yet</h2><p className="mt-1 text-sm text-slate-500">Create your first project to begin organizing work.</p><Button className="mt-5" onClick={() => { setIsCreateOpen(true); setMessage(null); }} type="button"><Plus />Add your first project</Button></div></div> : <div className="grid gap-4 xl:grid-cols-2">{projects.map((project) => (
					<article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={project.id}>
						{editingId === project.id ? <form onSubmit={(event) => saveEdit(event, project)}>
							<div className="grid gap-4 md:grid-cols-[1fr_9rem]"><label className="grid gap-1.5 text-sm font-medium text-slate-700">Name<Input value={editForm.name} onChange={(event) => updateForm(setEditForm, editForm, "name", event.target.value)} required /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">Key<Input value={editForm.key} onChange={(event) => updateForm(setEditForm, editForm, "key", event.target.value)} maxLength={3} required /></label></div>
							<label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-400">(optional, Markdown supported)</span><textarea className="min-h-20 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-3 focus:ring-sky-100" value={editForm.description} onChange={(event) => updateForm(setEditForm, editForm, "description", event.target.value)} /></label>
							<div className="mt-4 flex justify-end gap-2"><Button disabled={isSaving} onClick={() => setEditingId(null)} type="button" variant="outline">Cancel</Button><Button disabled={isSaving} type="submit">{isSaving ? "Saving…" : "Save changes"}</Button></div>
						</form> : <>
							<div className="flex flex-col gap-4 sm:flex-row sm:justify-between"><div><div className="flex items-center gap-2"><span className="rounded-md bg-sky-50 px-2 py-1 text-xs font-bold tracking-wide text-sky-700">{project.key}</span><h2 className="font-semibold text-slate-950">{project.name}</h2></div>{project.description ? <MarkdownDescription className="mt-3 max-w-2xl">{project.description}</MarkdownDescription> : <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">No description provided.</p>}</div><div className="flex shrink-0 items-start gap-2"><Button aria-label={`Update ${project.name}`} onClick={() => { setEditingId(project.id); setEditForm(toProjectForm(project)); setMessage(null); }} size="sm" variant="outline"><Edit3 />Update</Button><Button aria-label={`Delete ${project.name}`} onClick={() => { setDeleteProject(project); setDeleteName(""); setMessage(null); }} size="sm" variant="destructive"><Trash2 />Delete</Button></div></div>
							<div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><span>{issueCounts[project.id] ?? 0} {(issueCounts[project.id] ?? 0) === 1 ? "issue" : "issues"}</span><span>Created {formatDate(project.created_at)}</span><span>Updated {formatDate(project.updated_at)}</span></div>
						</>}
					</article>
				))}</div>}
			</div>

			{isCreateOpen && <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-labelledby="add-project-title"><form className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onSubmit={createProject}><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-950" id="add-project-title">Add project</h2><p className="mt-1 text-sm text-slate-600">Give the project a name and a short key.</p></div><Button aria-label="Close add project" disabled={isSaving} onClick={() => setIsCreateOpen(false)} size="icon-sm" type="button" variant="ghost"><X /></Button></div>{message && <p aria-live="polite" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{message}</p>}<div className="mt-5 grid gap-4 sm:grid-cols-[1fr_9rem]"><label className="grid gap-1.5 text-sm font-medium text-slate-700">Name<Input autoFocus value={createForm.name} onChange={(event) => updateForm(setCreateForm, createForm, "name", event.target.value)} placeholder="Website refresh" required /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">Key<Input value={createForm.key} onChange={(event) => updateForm(setCreateForm, createForm, "key", event.target.value)} placeholder="WEB" maxLength={3} required /></label></div><label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-700">Description <span className="font-normal text-slate-400">(optional, Markdown supported)</span><textarea className="min-h-20 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-3 focus:ring-sky-100" value={createForm.description} onChange={(event) => updateForm(setCreateForm, createForm, "description", event.target.value)} placeholder="What is this project for?" /></label><div className="mt-6 flex justify-end gap-2"><Button disabled={isSaving} onClick={() => setIsCreateOpen(false)} type="button" variant="outline">Cancel</Button><Button disabled={isSaving} type="submit">{isSaving ? "Adding…" : "Add project"}</Button></div></form></div>}

			{deleteProject && <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog"><div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-slate-950">Delete {deleteProject.name}?</h2><p className="mt-2 text-sm leading-6 text-slate-600">This permanently deletes the project and all of its issues. Type the project name to confirm.</p></div><Button aria-label="Close deletion confirmation" onClick={() => setDeleteProject(null)} size="icon-sm" type="button" variant="ghost"><X /></Button></div><label className="mt-5 grid gap-1.5 text-sm font-medium text-slate-700">Project name<Input value={deleteName} onChange={(event) => setDeleteName(event.target.value)} /></label><div className="mt-6 flex justify-end gap-2"><Button disabled={isSaving} onClick={() => setDeleteProject(null)} type="button" variant="outline">Cancel</Button><Button disabled={isSaving || deleteName !== deleteProject.name} onClick={confirmDelete} type="button" variant="destructive">{isSaving ? "Deleting…" : "Delete project"}</Button></div></div></div>}
		</section>
	);
}
