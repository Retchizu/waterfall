import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
	createClient,
	type Session,
	type SupabaseClient,
} from "@supabase/supabase-js";

const sessionFilePath = path.resolve(process.cwd(), "mcp", ".auth.json");
const refreshLeewayMilliseconds = 60_000;

function requiredEnvironmentVariable(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
}

export function createSupabaseClient(): SupabaseClient {
	return createClient(
		requiredEnvironmentVariable("SUPABASE_URL"),
		requiredEnvironmentVariable("SUPABASE_ANON_KEY"),
		{ auth: { autoRefreshToken: false, persistSession: false } },
	);
}

export async function saveSession(session: Session): Promise<void> {
	await mkdir(path.dirname(sessionFilePath), { recursive: true });
	await writeFile(sessionFilePath, `${JSON.stringify(session, null, 2)}\n`, {
		encoding: "utf8",
		mode: 0o600,
	});
	// Windows does not use POSIX permissions, but chmod protects this file on Unix.
	await chmod(sessionFilePath, 0o600).catch(() => undefined);
}

async function loadSession(): Promise<Session> {
	try {
		const value: unknown = JSON.parse(await readFile(sessionFilePath, "utf8"));
		if (
			typeof value === "object" &&
			value !== null &&
			"access_token" in value &&
			typeof value.access_token === "string" &&
			"refresh_token" in value &&
			typeof value.refresh_token === "string"
		) {
			return value as Session;
		}
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error(
				"No Waterfall MCP session found. Run `pnpm mcp:login` first.",
			);
		}
		throw error;
	}

	throw new Error(
		"The Waterfall MCP session file is invalid. Run `pnpm mcp:login` again.",
	);
}

export async function restoreAuthenticatedSession(
	supabase: SupabaseClient,
): Promise<void> {
	const session = await loadSession();
	const { data, error } = await supabase.auth.setSession({
		access_token: session.access_token,
		refresh_token: session.refresh_token,
	});
	if (error || !data.session) {
		throw error ?? new Error("Could not restore the Waterfall MCP session.");
	}
	await saveSession(data.session);
}

export async function refreshSessionIfNeeded(
	supabase: SupabaseClient,
): Promise<void> {
	const { data, error } = await supabase.auth.getSession();
	if (error || !data.session) {
		throw (
			error ??
			new Error(
				"Your Waterfall MCP session has ended. Run `pnpm mcp:login` again.",
			)
		);
	}

	const expiresAt = data.session.expires_at ?? 0;
	if (expiresAt * 1000 - Date.now() > refreshLeewayMilliseconds) return;

	const { data: refreshed, error: refreshError } =
		await supabase.auth.refreshSession();
	if (refreshError || !refreshed.session) {
		throw (
			refreshError ??
			new Error(
				"Your Waterfall MCP session has ended. Run `pnpm mcp:login` again.",
			)
		);
	}
	await saveSession(refreshed.session);
}
