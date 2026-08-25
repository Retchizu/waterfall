import { z } from "zod";
import { supabase } from "../../context";

const listIssuesInputSchema = z.object({
	project_key: z.string().min(1).optional(),
	status_id: z.uuid().optional(),
	priority: z.number().int().min(0).max(3).optional(),
	search: z.string().min(1).optional(),
	limit: z.number().int().min(1).max(100).default(50),
	offset: z.number().int().min(0).default(0),
});

type ListIssuesInput = z.infer<typeof listIssuesInputSchema>;

export const listIssuesTool = {
	description:
		"List Waterfall issues with optional project, status, priority, search, and pagination filters.",
	inputSchema: listIssuesInputSchema,
	annotations: { destructiveHint: false, readOnlyHint: true },

	handler: async ({
		project_key,
		status_id,
		priority,
		search,
		limit,
		offset,
	}: ListIssuesInput) => {
		let query = supabase
			.from("issues")
			.select(
				"*, projects!inner(key, name), issue_statuses!inner(name, is_complete, position)",
				{ count: "exact" },
			)
			.order("updated_at", { ascending: false })
			.range(offset, offset + limit - 1);

		if (project_key) query = query.eq("projects.key", project_key);
		if (status_id) query = query.eq("status_id", status_id);
		if (priority !== undefined) query = query.eq("priority", priority);
		if (search) query = query.ilike("name", `%${search}%`);

		const { data, error, count } = await query;
		if (error) throw error;

		const issues = (data ?? []).map((issue) => ({
			...issue,
			identifier: `${issue.projects.key}-${issue.number}`,
		}));

		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({
						issues,
						count: count ?? issues.length,
						limit,
						offset,
					}),
				},
			],
		};
	},
};
