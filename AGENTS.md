# Agents guide

Instructions for AI coding agents (and humans) working in this repository. Read `PRD.md` for what we are building, `Goals.md` for priorities, and `Memory.md` for decisions and gotchas before changing anything.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Quick facts

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, shadcn/ui on Base UI, TanStack Table v9, Supabase.
- Package manager: `pnpm`. Scripts: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format`.
- `src/app/(auth)` is public. `src/app/(app)` is protected. `src/proxy.ts` refreshes the session and redirects.
- Database schema and RLS live in `supabase/migrations/`. Apply with the Supabase SQL editor or `supabase db push`.
- Hand-maintained DB types live in `src/lib/supabase/database.types.ts`. Update them with every migration.

## Where things go

| What | Where |
| --- | --- |
| Page routes | `src/app/(app)/<feature>/page.tsx` (server component) |
| Reads | `src/lib/data/<feature>.ts` |
| Mutations | `src/actions/<feature>.ts` (`"use server"`) |
| Validation | `src/lib/validations/<feature>.ts` (Zod) |
| Feature UI | `src/components/<feature>/` |
| Layout UI | `src/components/layout/` |
| Shared UI | `src/components/shared/` |
| shadcn primitives | `src/components/ui/` (generated; do not hand-edit beyond theming) |
| Domain logic | `src/lib/compensation.ts`, `src/lib/follow-ups.ts`, `src/lib/format.ts`, `src/lib/constants.ts` |
| AI | `src/lib/ai/` (provider abstraction) and `src/app/api/ai/` (route handlers) |
| Tests | next to the module as `*.test.ts` (Vitest) |

## Rules

1. **Never bypass the data layer.** Components do not import Supabase. Pages call `src/lib/data`, forms call `src/actions`.
2. **Every server action**: parse input with the Zod schema, call `requireUser()`, scope the query by `user_id`, `revalidatePath`, return `{ ok, error? }` rather than throwing for expected failures.
3. **Use shadcn components** before writing custom ones. Compose with `render={<X />}`, not `asChild`.
4. **Server components by default.** Add `"use client"` only to the leaf that needs state or events.
5. **No secrets in client code.** Only `NEXT_PUBLIC_*` variables may be read in the browser.
6. **Money and dates** go through `src/lib/format.ts`. Currency is never mixed.
7. **Destructive actions** use `AlertDialog`. Archive before delete.
8. **Keep the docs honest.** When you make a decision that isn't obvious from the code, add it to `Memory.md`. When scope changes, update `PRD.md` and `Goals.md`.
9. **Before finishing a change**, run `pnpm typecheck && pnpm lint && pnpm test`. Report failures; do not hide them.

## Checking Next.js APIs

Request APIs are async (`await cookies()`, `await params`, `await searchParams`). The generated `PageProps<"/route">`, `LayoutProps<"/route">`, and `RouteContext<"/route">` global types are available after `next dev` or `next typegen`. `error.tsx` receives `{ error: unknown; retry: () => void }`.
