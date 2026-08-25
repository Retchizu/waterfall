import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	supabase: {
		from: vi.fn(),
		rpc: vi.fn(),
	},
}));

vi.mock("../src/context", () => ({ supabase: mocks.supabase }));

import { createIssueTool } from "../src/tools/issues/create_issue";
import { deleteIssueTool } from "../src/tools/issues/delete_issue";
import { getIssueTool } from "../src/tools/issues/get_issue";
import { listIssuesTool } from "../src/tools/issues/list_issues";
import { updateIssueTool } from "../src/tools/issues/update_issue";
import { createProjectTool } from "../src/tools/projects/create_project";
import { deleteProjectTool } from "../src/tools/projects/delete_project";
import { getProjectTool } from "../src/tools/projects/get_project";
import { listProjectsTool } from "../src/tools/projects/list_projects";
import { updateProjectTool } from "../src/tools/projects/update_project";

describe("Waterfall MCP tools", () => {
	it("forwards an optional status ID when creating an issue", async () => {
		const single = vi.fn().mockResolvedValue({
			data: { id: "project-id", key: "APP" },
			error: null,
		});
		const eq = vi.fn().mockReturnValue({ single });
		mocks.supabase.from.mockReturnValue({
			select: vi.fn().mockReturnValue({ eq }),
		});
		mocks.supabase.rpc.mockResolvedValue({
			data: { id: "issue-id", number: 12 },
			error: null,
		});

		const result = await createIssueTool.handler({
			project_key: "APP",
			title: "Fix login",
			status_id: "6b3a0c1f-62a2-4e20-9356-eb92d8e9c6f8",
		});

		expect(mocks.supabase.rpc).toHaveBeenCalledWith("create_issue", {
			p_project_id: "project-id",
			p_name: "Fix login",
			p_description: null,
			p_status_id: "6b3a0c1f-62a2-4e20-9356-eb92d8e9c6f8",
			p_priority: 1,
		});
		expect(JSON.parse(result.content[0].text)).toMatchObject({
			identifier: "APP-12",
		});
	});

	it("labels read-only and destructive tools correctly", () => {
		for (const tool of [
			getIssueTool,
			listIssuesTool,
			getProjectTool,
			listProjectsTool,
		]) {
			expect(tool.annotations?.readOnlyHint).toBe(true);
			expect(tool.annotations?.destructiveHint).toBe(false);
		}

		for (const tool of [deleteIssueTool, deleteProjectTool]) {
			expect(tool.annotations?.destructiveHint).toBe(true);
			expect(tool.annotations?.readOnlyHint).toBe(false);
		}

		for (const tool of [
			createIssueTool,
			updateIssueTool,
			createProjectTool,
			updateProjectTool,
		]) {
			expect(tool.annotations?.readOnlyHint).toBe(false);
			expect(tool.annotations?.destructiveHint).toBe(false);
		}
	});
});
