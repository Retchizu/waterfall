# Waterfall

Waterfall is a lightweight, multi-user project and issue tracker built with Next.js, Supabase, and an MCP server. It supports custom issue workflows, Markdown descriptions, priorities, and AI-assisted project management through MCP-compatible clients.

## Features

- User authentication with Supabase Auth
- Projects with short, unique keys such as `APP`
- Issues with descriptions, priorities, custom statuses, and completion timestamps
- Search, filtering, and pagination for issues
- Row-level security so users only access their own data
- MCP tools for reading and managing projects and issues from an AI client

## Stack

- Next.js 16 and React 19
- Supabase Auth, Postgres, and Row Level Security
- TypeScript
- Tailwind CSS and shadcn/ui components
- Model Context Protocol over stdio
- pnpm

## Prerequisites

- Node.js 20 or later
- pnpm 10 or later
- Docker Desktop, for the local Supabase stack

Install dependencies from the repository root:

```sh
pnpm install
```

## Local development

### 1. Start Supabase

```sh
pnpm supabase:start
pnpm db:reset
```

The local Supabase API runs at `http://127.0.0.1:54321`. To inspect the local keys and service URLs, run:

```sh
npx supabase status
```

### 2. Configure the web app

Copy `web/.env.example` to `web/.env.local` and set the Supabase URL and publishable (anon) key. For the local stack, use the values printed by `npx supabase status`.

Then start the web app:

```sh
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), create an account, and sign in.

### 3. Configure the MCP server

The MCP server uses the same Supabase project and authenticates as a Waterfall user. See [`mcp/README.md`](mcp/README.md) for the complete setup, including:

- `mcp/.env` configuration
- interactive login and local credential storage
- MCP client configuration
- MCP validation commands

The short version is:

```sh
pnpm mcp:login
pnpm mcp:dev
```

The server communicates over stdio and should be launched by an MCP client. A ready-to-adapt client configuration is available at [`mcp/mcp.json.example`](mcp/mcp.json.example).

## MCP tools

The server exposes these tools:

| Area | Tools |
| --- | --- |
| Projects | `create_project`, `delete_project`, `get_project`, `list_projects`, `update_project` |
| Issues | `create_issue`, `delete_issue`, `get_issue`, `list_issues`, `update_issue` |

Issues are identified by a project key and number, for example `APP-12`. Issue priorities range from `0` to `3`; custom statuses are configured in the web app and passed to MCP tools by status ID.

## Database

Schema changes live in [`supabase/migrations`](supabase/migrations). The domain model is documented in [`Waterfall ERD.json`](Waterfall%20ERD.json).

Useful database commands:

```sh
pnpm db:reset       # Recreate the local database and apply all migrations
pnpm db:push        # Push pending migrations to a linked Supabase project
pnpm db:new <name>  # Create a new migration
pnpm db:test        # Run database tests
```

Keep migrations forward-only. Do not commit `.env` files or the MCP session file at `mcp/.auth.json`.

## Validation

Run the relevant checks before committing:

```sh
pnpm build
pnpm lint
pnpm mcp:test
pnpm exec tsc -p mcp/tsconfig.json
pnpm mcp:check
```

## Repository layout

```text
web/                 Next.js application
mcp/                 MCP server, tools, tests, and client example
supabase/migrations/ Database schema and functions
supabase/tests/      Database tests
Waterfall ERD.json   Domain schema reference
```

## License

No license has been specified yet.
