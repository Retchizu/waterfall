import { supabase } from "../../context";

export const listStatusesTool = {
	description:
		"List the custom issue statuses available in the current Waterfall workspace. Use a returned status ID when creating or updating an issue.",
	inputSchema: {},
	annotations: { destructiveHint: false, readOnlyHint: true },

	handler: async () => {
		const { data, error } = await supabase.rpc("ensure_issue_statuses");
		if (error) throw error;

		return {
			content: [
				{
					type: "text" as const,
					text: JSON.stringify({ statuses: data ?? [] }),
				},
			],
		};
	},
};
