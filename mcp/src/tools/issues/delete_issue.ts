import { z } from "zod";
import { supabase } from "../../context";

const deleteIssueInputSchema = z.object({
	project_key: z.string().trim().min(1),
	issue_number: z.number().int().positive(),
});

type DeleteIssueInput = z.infer<typeof deleteIssueInputSchema>;

export const deleteIssueTool = {
	description:
		"Delete a Waterfall issue identified by its project key and issue number.",
	inputSchema: deleteIssueInputSchema,
	annotations: { destructiveHint: true, readOnlyHint: false },

	handler: async ({ project_key, issue_number }: DeleteIssueInput) => {
		const { data: issue, error: issueError } = await supabase
			.from("issues")
			.select("id, number, projects!inner(key)")
			.eq("projects.key", project_key)
			.eq("number", issue_number)
			.single();

		if (issueError) throw issueError;
		if (!issue)
			throw new Error(`Issue ${project_key}-${issue_number} not found`);

		const { error } = await supabase.from("issues").delete().eq("id", issue.id);
		if (error) throw error;

		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						deleted: true,
						identifier: `${project_key}-${issue.number}`,
					}),
				},
			],
		};
	},
};
