import { z } from "zod";
import { supabase } from "../../context";

const createProjectInputSchema = z.object({
	name: z.string().trim().min(1),
	key: z
		.string()
		.trim()
		.regex(/^[A-Z][A-Z0-9_]{1,9}$/),
	description: z.string().nullable().optional(),
});

type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const createProjectTool = {
	description: "Create a Waterfall project.",
	inputSchema: createProjectInputSchema,
	annotations: { destructiveHint: false, readOnlyHint: false },

	handler: async ({ name, key, description }: CreateProjectInput) => {
		const { data: userData, error: userError } = await supabase.auth.getUser();
		if (userError) throw userError;
		if (!userData.user) throw new Error("Authentication required");

		const { data, error } = await supabase
			.from("projects")
			.insert({
				user_id: userData.user.id,
				name,
				key,
				description: description ?? null,
			})
			.select()
			.single();

		if (error) throw error;

		return {
			content: [{ type: "text" as const, text: JSON.stringify(data) }],
		};
	},
};
