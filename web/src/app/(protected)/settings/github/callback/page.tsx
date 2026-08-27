import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export default async function GitHubInstallCallback({ searchParams }: { searchParams: Promise<{ installation_id?: string; setup_action?: string }> }) {
	const { installation_id: installationId, setup_action: setupAction } = await searchParams;
	if (!installationId) redirect("/settings?github=missing-installation-id");

	const supabase = await createClient();
	const { error } = await supabase.rpc("register_github_installation", { p_github_installation_id: installationId });
	if (error) redirect(`/settings?github=error`);
	const { error: syncError } = await supabase.functions.invoke("github-installation-sync", { body: { installationId } });
	redirect(`/settings?github=${syncError ? "sync-pending" : setupAction === "update" ? "updated" : "connected"}`);
}
