import {
	createSupabaseClient,
	refreshSessionIfNeeded,
	restoreAuthenticatedSession,
} from "./auth-session";

export const supabase = createSupabaseClient();

export async function initializeAuthenticatedSession(): Promise<void> {
	await restoreAuthenticatedSession(supabase);
}

export async function ensureAuthenticatedSession(): Promise<void> {
	await refreshSessionIfNeeded(supabase);
}
