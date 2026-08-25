import { z } from "zod";
import { supabase } from "../../context";

const inputSchema = {
	project_key: z.string(),
	title: z.string().min(1),
	description: z.string().optional(),
	status_id: z.string().uuid().optional(),
	priority: z.number().int().min(0).max(3).optional(),
};

const createIssueInputSchema = z.object(inputSchema);

type CreateIssueInput = z.infer<z.ZodObject<typeof inputSchema>>;

export const createIssueTool = {
	description: "Create an issue in a Waterfall project.",
	inputSchema: createIssueInputSchema,
	annotations: { destructiveHint: false, readOnlyHint: false },

	handler: async ({
		project_key,
		title,
		description,
		status_id,
		priority,
	}: CreateIssueInput) => {
		const { data: project, error: projectError } = await supabase
			.from("projects")
			.select("id, key")
			.eq("key", project_key)
			.single();

		if (!project || projectError) {
			throw new Error(`Project ${project_key} not found`);
		}

		const { data, error } = await supabase.rpc("create_issue", {
			p_project_id: project.id,
			p_name: title,
			p_description: description ?? null,
			p_status_id: status_id ?? null,
			p_priority: priority ?? 1,
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
