# Waterfall MCP server

## Local setup

1. Copy `.env.example` to `.env` and provide a Supabase URL, anon key, and an authenticated user's access token.
2. Start the server from the repository root:

   ```sh
   pnpm mcp:dev
   ```

The server uses stdio, so it must be launched by an MCP client rather than opened in a browser.

## Client configuration

Copy the `waterfall` entry from `mcp.json.example` into your MCP client's configuration, replacing `cwd` with this repository's absolute path. The command loads `mcp/.env` before starting the TypeScript server.

## Validation

```sh
pnpm mcp:test
pnpm exec tsc -p mcp/tsconfig.json
pnpm mcp:check
```
