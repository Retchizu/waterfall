import { z } from "zod";
import { supabase } from "../../context";

const deleteProjectInputSchema = z.object({
	project_key: z.string().trim().min(1),
});

type DeleteProjectInput = z.infer<typeof deleteProjectInputSchema>;

export const deleteProjectTool = {
	description: "Delete a Waterfall project and its issues.",
	inputSchema: deleteProjectInputSchema,
	annotations: { destructiveHint: true, readOnlyHint: false },

	handler: async ({ project_key }: DeleteProjectInput) => {
		const { data: project, error: projectError } = await supabase
			.from("projects")
			.select("id, key")
			.eq("key", project_key)
			.single();

		if (projectError) throw projectError;
		if (!project) throw new Error(`Project ${project_key} not found`);

		const { error } = await supabase
			.from("projects")
			.delete()
			.eq("id", project.id);
		if (error) throw error;

		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({ deleted: true, project_key }),
				},
			],
		};
	},
};
