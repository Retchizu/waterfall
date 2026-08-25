import { ProjectsWorkspace } from "@/components/projects-workspace";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectsPage() {
	const supabase = await createClient();
	const [{ data: projects, error }, { data: issues }] = await Promise.all([
		supabase.from("projects").select("*").order("updated_at", { ascending: false }),
		supabase.from("issues").select("project_id"),
	]);
	const issueCounts = (issues ?? []).reduce<Record<string, number>>((counts, issue) => {
		counts[issue.project_id] = (counts[issue.project_id] ?? 0) + 1;
		return counts;
	}, {});

	return <ProjectsWorkspace initialProjects={projects ?? []} issueCounts={issueCounts} loadError={error?.message} />;
}
