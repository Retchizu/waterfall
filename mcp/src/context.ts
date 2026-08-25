import { createClient } from "@supabase/supabase-js";

function requiredEnvironmentVariable(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing required environment variable: ${name}`);
	return value;
}

export const supabase = createClient(
	requiredEnvironmentVariable("SUPABASE_URL"),
	requiredEnvironmentVariable("SUPABASE_ANON_KEY"),
	{
		auth: { autoRefreshToken: false, persistSession: false },
		accessToken: async () =>
			requiredEnvironmentVariable("SUPABASE_ACCESS_TOKEN"),
	},
);
