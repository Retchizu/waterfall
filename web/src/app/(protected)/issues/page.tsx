import { IssuesWorkspace } from "@/components/issues-workspace";
import { createClient } from "@/lib/supabase/server";

export default async function IssuesPage() {
	const supabase = await createClient();
	const { data: statuses, error: statusesError } = await supabase.rpc("ensure_issue_statuses");
	const [{ data: projects, error: projectsError }, { data: issues, error: issuesError }] = await Promise.all([
		supabase.from("projects").select("*").order("name"),
		supabase.from("issues").select("*").order("updated_at", { ascending: false }),
	]);
	return <IssuesWorkspace initialIssues={issues ?? []} projects={projects ?? []} statuses={statuses ?? []} loadError={projectsError?.message ?? issuesError?.message ?? statusesError?.message} />;
}
