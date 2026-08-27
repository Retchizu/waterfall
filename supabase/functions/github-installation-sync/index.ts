import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { App } from "npm:octokit@5.0.3";

type GitHubRepository = {
	full_name: string;
	id: number;
	name: string;
	owner: { login: string };
};

function json(status: number, body: Record<string, string | number>) {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

Deno.serve(async (request) => {
	if (request.method !== "POST") return json(405, { error: "Method not allowed" });
	const supabaseUrl = Deno.env.get("SUPABASE_URL");
	const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
	const appId = Deno.env.get("GITHUB_APP_ID");
	const privateKey = Deno.env.get("GITHUB_APP_PRIVATE_KEY")?.replaceAll("\\n", "\n");
	if (!supabaseUrl || !serviceRoleKey || !appId || !privateKey) return json(500, { error: "GitHub synchronization is not configured" });

	const authorization = request.headers.get("authorization");
	if (!authorization?.startsWith("Bearer ")) return json(401, { error: "Authentication required" });
	const token = authorization.slice("Bearer ".length);
	const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
	const { data: authData, error: authError } = await admin.auth.getUser(token);
	if (authError || !authData.user) return json(401, { error: "Authentication required" });

	let body: { installationId?: string };
	try { body = await request.json(); } catch { return json(400, { error: "Invalid JSON body" }); }
	if (!body.installationId) return json(400, { error: "Installation ID is required" });
	const { data: installation, error: installationError } = await admin
		.from("github_installations")
		.select("id, github_installation_id")
		.eq("github_installation_id", body.installationId)
		.eq("user_id", authData.user.id)
		.eq("status", "active")
		.maybeSingle();
	if (installationError) return json(500, { error: "Could not load installation" });
	if (!installation) return json(404, { error: "GitHub installation not found" });

	try {
		const app = new App({ appId, privateKey });
		const octokit = await app.getInstallationOctokit(Number(installation.github_installation_id));
		const repositories = await octokit.paginate("GET /installation/repositories", { per_page: 100 }) as GitHubRepository[];
		const rows = repositories.map((repository) => ({
			installation_id: installation.id,
			github_repository_id: String(repository.id),
			owner_login: repository.owner.login,
			name: repository.name,
			full_name: repository.full_name,
			is_active: true,
		}));
		if (rows.length) {
			const { error } = await admin.from("github_repositories").upsert(rows, { onConflict: "github_repository_id" });
			if (error) throw error;
		}
		const repositoryIds = rows.map((repository) => repository.github_repository_id);
		const disabled = admin.from("github_repositories").update({ is_active: false }).eq("installation_id", installation.id);
		const { error: disableError } = repositoryIds.length ? await disabled.not("github_repository_id", "in", `(${repositoryIds.join(",")})`) : await disabled;
		if (disableError) throw disableError;
		return json(200, { repositories: rows.length });
	} catch (error) {
		console.error("GitHub installation synchronization failed", { installationId: body.installationId, error: error instanceof Error ? error.message : "unknown error" });
		return json(502, { error: "Could not synchronize GitHub repositories" });
	}
});
