import { GitHubConnectionSettings } from "@/components/github-connection-settings";
import { StatusSettings } from "@/components/status-settings";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
	const supabase = await createClient();
	const { data: statuses, error: statusesError } = await supabase.rpc("ensure_issue_statuses");
	const { data: automations, error: automationsError } = await supabase.from("issue_status_automations").select("*");
	const { data: installations, error: installationsError } = await supabase.from("github_installations").select("*").order("created_at", { ascending: false });
	const { data: repositories, error: repositoriesError } = await supabase.from("github_repositories").select("*").order("full_name");
	const { data: issues, error: issuesError } = await supabase.from("issues").select("status_id");
	const issueCounts = (issues ?? []).reduce<Record<string, number>>((counts, issue) => {
		counts[issue.status_id] = (counts[issue.status_id] ?? 0) + 1;
		return counts;
	}, {});
	const loadError = statusesError?.message ?? automationsError?.message ?? installationsError?.message ?? repositoriesError?.message ?? issuesError?.message;
	return <><GitHubConnectionSettings installations={installations ?? []} installUrl={process.env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL} repositories={repositories ?? []} /><StatusSettings initialAutomations={automations ?? []} initialStatuses={statuses ?? []} issueCounts={issueCounts} loadError={loadError} /></>;
}
