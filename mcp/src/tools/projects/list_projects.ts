import { supabase } from "../../context";

export const listProjectsTool = {
	description: "List the current user's Waterfall projects.",
	inputSchema: {},
	annotations: { destructiveHint: false, readOnlyHint: true },

	handler: async () => {
		const { data, error } = await supabase
			.from("projects")
			.select("*, issues(count)")
			.order("updated_at", { ascending: false });

		if (error) throw error;

		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify(
						(data ?? []).map(({ issues, ...project }) => ({
							...project,
							issue_count: issues?.[0]?.count ?? 0,
						})),
					),
				},
			],
		};
	},
};
