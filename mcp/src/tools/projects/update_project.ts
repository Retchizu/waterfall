import { z } from "zod";
import { supabase } from "../../context";

const updateProjectInputSchema = z
	.object({
		project_key: z.string().trim().min(1),
		name: z.string().trim().min(1).optional(),
		description: z.string().nullable().optional(),
	})
	.refine(
		({ name, description }) => name !== undefined || description !== undefined,
		{
			message: "Provide at least one field to update.",
		},
	);

type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const updateProjectTool = {
	description: "Update a Waterfall project's name or description.",
	inputSchema: updateProjectInputSchema,
	annotations: { destructiveHint: false, readOnlyHint: false },

	handler: async ({ project_key, name, description }: UpdateProjectInput) => {
		const { data: current, error: currentError } = await supabase
			.from("projects")
			.select("id, name, description")
			.eq("key", project_key)
			.single();

		if (currentError) throw currentError;
		if (!current) throw new Error(`Project ${project_key} not found`);

		const { data, error } = await supabase
			.from("projects")
			.update({
				name: name ?? current.name,
				description:
					description === undefined ? current.description : description,
			})
			.eq("id", current.id)
			.select()
			.single();

		if (error) throw error;

		return {
			content: [{ type: "text" as const, text: JSON.stringify(data) }],
		};
	},
};
