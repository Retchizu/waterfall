import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
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

	server.registerTool("create_issue", createIssueTool, createIssueTool.handler);
	server.registerTool("delete_issue", deleteIssueTool, deleteIssueTool.handler);
	server.registerTool("list_issues", listIssuesTool, listIssuesTool.handler);
	server.registerTool("get_issue", getIssueTool, getIssueTool.handler);
	server.registerTool("update_issue", updateIssueTool, updateIssueTool.handler);
	server.registerTool(
		"create_project",
		createProjectTool,
		createProjectTool.handler,
	);
	server.registerTool(
		"delete_project",
		deleteProjectTool,
		deleteProjectTool.handler,
	);
	server.registerTool("get_project", getProjectTool, getProjectTool.handler);
	server.registerTool(
		"list_projects",
		listProjectsTool,
		listProjectsTool.handler,
	);
	server.registerTool(
		"update_project",
		updateProjectTool,
		updateProjectTool.handler,
	);

	return server;
}

void serveStdio(createServer);
console.error("Waterfall MCP server running on stdio");
