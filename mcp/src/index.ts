import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import {
	ensureAuthenticatedSession,
	initializeAuthenticatedSession,
} from "./context";
import { createIssueTool } from "./tools/issues/create_issue";
import { deleteIssueTool } from "./tools/issues/delete_issue";
import { getIssueTool } from "./tools/issues/get_issue";
import { listIssuesTool } from "./tools/issues/list_issues";
import { updateIssueTool } from "./tools/issues/update_issue";
import { createProjectTool } from "./tools/projects/create_project";
import { deleteProjectTool } from "./tools/projects/delete_project";
import { getProjectTool } from "./tools/projects/get_project";
import { listProjectsTool } from "./tools/projects/list_projects";
import { updateProjectTool } from "./tools/projects/update_project";

function createServer(): McpServer {
	const server = new McpServer({ name: "waterfall", version: "1.0.0" });

	server.registerTool("create_issue", createIssueTool, async (args) => {
		await ensureAuthenticatedSession();
		return createIssueTool.handler(args);
	});
	server.registerTool("delete_issue", deleteIssueTool, async (args) => {
		await ensureAuthenticatedSession();
		return deleteIssueTool.handler(args);
	});
	server.registerTool("list_issues", listIssuesTool, async (args) => {
		await ensureAuthenticatedSession();
		return listIssuesTool.handler(args);
	});
	server.registerTool("get_issue", getIssueTool, async (args) => {
		await ensureAuthenticatedSession();
		return getIssueTool.handler(args);
	});
	server.registerTool("update_issue", updateIssueTool, async (args) => {
		await ensureAuthenticatedSession();
		return updateIssueTool.handler(args);
	});
	server.registerTool("create_project", createProjectTool, async (args) => {
		await ensureAuthenticatedSession();
		return createProjectTool.handler(args);
	});
	server.registerTool("delete_project", deleteProjectTool, async (args) => {
		await ensureAuthenticatedSession();
		return deleteProjectTool.handler(args);
	});
	server.registerTool("get_project", getProjectTool, async (args) => {
		await ensureAuthenticatedSession();
		return getProjectTool.handler(args);
	});
	server.registerTool("list_projects", listProjectsTool, async () => {
		await ensureAuthenticatedSession();
		return listProjectsTool.handler();
	});
	server.registerTool("update_project", updateProjectTool, async (args) => {
		await ensureAuthenticatedSession();
		return updateProjectTool.handler(args);
	});

	return server;
}

async function main(): Promise<void> {
	await initializeAuthenticatedSession();
	await serveStdio(createServer);
	console.error("Waterfall MCP server running on stdio");
}

void main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
