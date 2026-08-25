import { z } from "zod";
import { supabase } from "../../context";

const getIssueInputSchema = z.object({
	project_key: z.string().min(1).max(3),
	issue_number: z.number().int().positive(),
});

type GetIssueInput = z.infer<typeof getIssueInputSchema>;

export const getIssueTool = {
	description: "Get a single Waterfall issue by project key and issue number.",
	inputSchema: getIssueInputSchema,
	annotations: { destructiveHint: false, readOnlyHint: true },

	handler: async ({ project_key, issue_number }: GetIssueInput) => {
		const { data, error } = await supabase
			.from("issues")
			.select(
				"*, projects!inner(key,name), issue_statuses!inner(name, is_complete, position)",
			)
			.eq("projects.key", project_key)
			.eq("number", issue_number)
			.single();

		if (error) throw error;
		if (!data)
			throw new Error(`Issue ${project_key}-${issue_number} not found`);

		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(data),
				},
			],
		};
	},
};
