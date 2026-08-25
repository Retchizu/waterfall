import { z } from "zod";
import { supabase } from "../../context";

const updateIssueSchema = z
	.object({
		project_key: z.string().trim().min(1),
		issue_number: z.number().int().positive(),
		title: z.string().min(1).optional(),
		description: z.string().nullable().optional(),
		status_id: z.string().uuid().optional(),
		priority: z.number().int().min(0).max(3).optional(),
	})
	.refine(
		({ title, description, status_id, priority }) =>
			title !== undefined ||
			description !== undefined ||
			status_id !== undefined ||
			priority !== undefined,
		{ message: "Provide at least one field to update." },
	);

type UpdateIssueInput = z.infer<typeof updateIssueSchema>;

export const updateIssueTool = {
	description:
		"Update a Waterfall issue identified by its project key and issue number.",
	inputSchema: updateIssueSchema,
	annotations: { destructiveHint: false, readOnlyHint: false },

	handler: async ({
		project_key,
		issue_number,
		title,
		description,
		status_id,
		priority,
	}: UpdateIssueInput) => {
		const { data: issue, error: issueError } = await supabase
			.from("issues")
			.select("*, projects!inner(id, key)")
			.eq("projects.key", project_key)
			.eq("number", issue_number)
			.single();

		if (issueError) throw issueError;
		if (!issue)
			throw new Error(`Issue ${project_key}-${issue_number} not found`);

		const { data, error } = await supabase.rpc("update_issue", {
			p_issue_id: issue.id,
			p_project_id: issue.project_id,
			p_name: title ?? issue.name,
			p_description:
				description === undefined ? issue.description : description,
			p_status_id: status_id ?? issue.status_id,
			p_priority: priority ?? issue.priority,
		});

		if (error) throw error;

		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						...data,
						identifier: `${project_key}-${data.number}`,
					}),
				},
			],
		};
	},
};
