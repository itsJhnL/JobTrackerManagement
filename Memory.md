# Memory

Decisions, conventions, and gotchas that are not obvious from the code. Append; do not rewrite history. Newest entries at the bottom of each section.

## Decisions

- **2026-11-05 — Next.js 16.4, `cacheComponents` off.** The scaffold enabled `cacheComponents` + `partialPrefetching`. Every page in this app reads the Supabase session cookie, so the static-shell model adds Suspense requirements with little benefit. Both flags are removed; the classic dynamic model applies (`cookies()` makes a route dynamic, `revalidatePath` after mutations).
- **2026-11-05 — shadcn "base-nova" style.** shadcn 4.x now scaffolds on Base UI, not Radix. Composition uses the `render={<Comp />}` prop instead of `asChild`. `Select` is `onValueChange(value, details)`, `Dialog` is `onOpenChange(open, details)`, `Checkbox` is `onCheckedChange(checked, details)`. The `cn` helper comes from the `cn` package via `@/lib/utils`.
- **2026-11-05 — TanStack Table v9.** `useReactTable` is gone. Use `useTable` with an explicit `tableFeatures({...})` and row-model slots. See `src/components/applications/applications-table.tsx` for the canonical pattern.
- **2026-11-05 — Middleware is `src/proxy.ts`.** Next 16 renamed `middleware.ts` to `proxy.ts` (Node runtime only). It only refreshes the Supabase session and redirects unauthenticated users; no DB calls there.
- **2026-11-05 — Enums are Postgres enums.** `application_status`, `rate_type`, `employment_type`, `follow_up_type`, `follow_up_status`, `priority`, `interview_type`, `interview_outcome`, `assessment_status`, `communication_type`, `communication_direction`, `document_type`. The TypeScript unions in `src/lib/constants.ts` mirror them and are the single source for labels and ordering.
- **2026-11-05 — Status history is written by a DB trigger**, not by application code, so it cannot be skipped. The `activities` table is written by server actions for the dashboard feed.
- **2026-11-05 — Archive is soft (`archived_at`), delete is hard.** Lists exclude archived rows by default. Deleting an application cascades to its children.
- **2026-11-05 — Settings live on `profiles`.** Default currency, time zone, weekly hours, follow-up intervals (jsonb), skills (text[]), experience and projects (jsonb). No separate settings table.
- **2026-11-05 — Money is `numeric(12,2)` and currency is ISO 4217 text.** Nothing is ever summed across currencies; aggregates are grouped by currency.
- **2026-11-05 — AI provider abstraction.** `src/lib/ai/provider.ts` defines `AiProvider` with one method per task, `src/lib/ai/gemini.ts` implements it, `src/lib/ai/index.ts` picks the provider from env. Route handlers in `src/app/api/ai/*` validate input with Zod, require a session, and call the provider. Structured output uses Gemini JSON schema mode.

- **2026-11-05 — Supabase `Database` type must use `type` aliases, not `interface`s**, and must declare `Relationships` for every FK. Interfaces lack the implicit index signature that `Record<string, unknown>` requires (every table resolved to `never`), and embedded selects like `application:applications(...)` type as `never` without the relationship entries.
- **2026-11-05 — Status colours follow the dataviz reference palette** (blue, orange, aqua, yellow, magenta, green, violet, red in pipeline order), validated with the dataviz skill's `validate_palette.js` for adjacent-pair CVD separation in light and dark. Status colour is always paired with a text label and never carries identity alone. Both maps live in `src/lib/constants.ts`.
- **2026-11-05 — AI output is validated with Zod** (`src/lib/ai/schemas.ts`) and the same schemas are converted with `z.toJSONSchema` for Gemini's `responseJsonSchema`. The model is never trusted: malformed output becomes a retryable `invalid_response`.
- **2026-11-05 — `server-only` guards `src/lib/ai/index.ts` and `handler.ts`** so the provider (and the key) can never be bundled into a client component.

- **2026-11-05 — Gemini model availability is key-dependent.** On this key `gemini-2.5-flash` returns 404 ("no longer available to new users") and `gemini-3.7/3.8-flash` were returning 503 "high demand", while `gemini-3.5-flash` answered in ~2 s. Default is therefore `gemini-3.5-flash` with `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite`; the provider retries transient errors once and then falls back. `GET /api/ai/health` (used by Settings → "Test AI connection") verifies key, model and quota.

## Conventions

- Routes: `src/app/(auth)/*` public, `src/app/(app)/*` protected by `src/app/(app)/layout.tsx` (server-side `requireUser()`).
- Data access: `src/lib/data/*.ts` (reads, typed, take a Supabase client). Mutations: `src/actions/*.ts` (`"use server"`, validate with Zod, `requireUser()`, `revalidatePath`).
- Validation: `src/lib/validations/*.ts`. Forms and actions import the same schema.
- Formatting: `src/lib/format.ts` for money, dates, hours. Never format money inline.
- Components: `src/components/ui` is shadcn only (never hand-edit beyond theming); feature components live in `src/components/<feature>/`; layout in `src/components/layout/`; small shared pieces in `src/components/shared/`.
- Icons: Lucide only, `size-4` in buttons and menus, `size-3.5` in badges.
- Toasts: `toast.success` / `toast.error` from Sonner after every mutation.

## Gotchas

- The React Compiler lint rules (`react-hooks/purity`, `react-hooks/set-state-in-effect`) are errors here. Do not call `Date.now()`/`Math.random()` directly in a component body; wrap it in a helper (see `currentTime()` in the interviews page) or `useState(() => Date.now())`. Do not reset state in a `useEffect`; remount with a `key` instead (see `QuickAddProvider`, `FormDialog`).
- `form.watch()` from React Hook Form trips the compiler's incompatible-library warning; use `useWatch` instead.
- shadcn `Card` has no `render` prop; wrap it in a `Link` instead.
- `lucide-react` v1 dropped brand icons (`Linkedin`, `Github`); use `Link2`/`ExternalLink`.

- `params` and `searchParams` are Promises in Next 16. Always `await`.
- `revalidateTag` requires a second argument in Next 16; this project uses `revalidatePath` only.
- Base UI `Select` does not accept `onValueChange={field.onChange}` directly in strict TS because the handler takes two arguments and `value` may be `null`; wrap it.
- react-day-picker v10 is what the shadcn `Calendar` wraps; `selected` / `onSelect` with `mode="single"`.
- Supabase: `auth.getUser()` on the server, never `getSession()`, for authorization decisions.
- Windows dev machine: paths are case-insensitive, so `Agents.md` and `AGENTS.md` are the same file.
