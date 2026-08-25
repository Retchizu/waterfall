import { ProjectsWorkspace } from "@/components/projects-workspace";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectsPage() {
	const supabase = await createClient();
	const { data: projects, error } = await supabase
		.from("projects")
		.select("*")
		.order("updated_at", { ascending: false });

	return <ProjectsWorkspace initialProjects={projects ?? []} loadError={error?.message} />;
}
