# Waterfall MCP server

## Local setup

1. Copy `.env.example` to `.env` and provide a Supabase URL and publishable (anon) key.
2. Sign in once from an interactive terminal. This stores the Supabase session and refresh token in `mcp/.auth.json`, which is ignored by Git:

   ```sh
   pnpm mcp:login
   ```

3. Start the server from the repository root:

   ```sh
   pnpm mcp:dev
   ```

The server uses stdio, so it must be launched by an MCP client rather than opened in a browser. It refreshes its stored session automatically when it is close to expiry. If the refresh token is revoked or expires, run `pnpm mcp:login` again.

Use `list_statuses` before creating or updating an issue to obtain the workspace's custom status IDs, labels, groups, and order.

## Client configuration

Copy the `waterfall` entry from `mcp.json.example` into your MCP client's configuration, replacing `cwd` with this repository's absolute path. The command loads `mcp/.env` before starting the TypeScript server.

## Validation

```sh
pnpm mcp:test
pnpm exec tsc -p mcp/tsconfig.json
pnpm mcp:check
```
