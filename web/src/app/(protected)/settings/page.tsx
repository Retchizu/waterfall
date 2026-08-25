import { StatusSettings } from "@/components/status-settings";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
	const supabase = await createClient();
	const { data: statuses, error: statusesError } = await supabase.rpc("ensure_issue_statuses");
	const { data: issues, error: issuesError } = await supabase.from("issues").select("status_id");
	const issueCounts = (issues ?? []).reduce<Record<string, number>>((counts, issue) => {
		counts[issue.status_id] = (counts[issue.status_id] ?? 0) + 1;
		return counts;
	}, {});
	return <StatusSettings initialStatuses={statuses ?? []} issueCounts={issueCounts} loadError={statusesError?.message ?? issuesError?.message} />;
}
