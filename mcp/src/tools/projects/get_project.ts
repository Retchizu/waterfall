import { z } from "zod";
import { supabase } from "../../context";

const getProjectInputSchema = z.object({
	project_key: z.string().trim().min(1),
});

type GetProjectInput = z.infer<typeof getProjectInputSchema>;

export const getProjectTool = {
	description: "Get a Waterfall project by its project key.",
	inputSchema: getProjectInputSchema,
	annotations: { destructiveHint: false, readOnlyHint: true },

	handler: async ({ project_key }: GetProjectInput) => {
		const { data, error } = await supabase
			.from("projects")
			.select("*, issues(count)")
			.eq("key", project_key)
			.single();

		if (error) throw error;
		if (!data) throw new Error(`Project ${project_key} not found`);

		const { issues, ...project } = data;
		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						...project,
						issue_count: issues?.[0]?.count ?? 0,
					}),
				},
			],
		};
	},
};
