This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Supabase

Create `web/.env.local` from `web/.env.example`, then fill it with the URL and publishable (anon) key from the Supabase project's Connect dialog. The existing `.env` file is ignored and should not be committed.

Database migrations live in `../supabase/migrations/`. Add a timestamped migration with:

```bash
supabase migration new <name>
```

Run the local Supabase stack with `npm run supabase:start`, apply all migrations from scratch with `npm run db:reset`, and deploy pending migrations to a linked hosted project with `npm run db:push`.

`Waterfall ERD.json` is the source of truth for the `projects` and `issues` domain schema. The first migration creates those private tables and adds `projects.user_id` as the sole Supabase-specific field, associating ERD data with the signed-in user and enforcing row-level security.

Keep migrations forward-only: add a new migration for schema changes rather than altering an applied one. Make operations idempotent where PostgreSQL supports it (`if exists` / `if not exists`); use guarded `do` blocks for constraints, triggers, functions, and policies.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
