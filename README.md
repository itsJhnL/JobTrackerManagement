# Job Tracker

A personal CRM for job applications: pipeline, follow-ups, interviews, assessments, contacts, compensation comparison, and an AI assistant that only writes from your verified profile.

Built with Next.js 16, TypeScript, Tailwind v4, shadcn/ui, Supabase, TanStack Table v9, React Hook Form + Zod, Recharts, and Google Gemini.

See `PRD.md` (what), `Goals.md` (priorities and phases), `Memory.md` (decisions and gotchas) and `AGENTS.md` (how to work in this repo).

## Setup

1. **Install**

   ```bash
   pnpm install
   ```

2. **Create a Supabase project** at <https://supabase.com>, then apply the schema. Either paste `supabase/migrations/0001_initial_schema.sql` into the SQL editor, or link the project and push:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```

   The migration creates all tables, enums, triggers (status history, profile on sign-up), indexes, Row Level Security policies, and a private `documents` storage bucket.

3. **Configure auth.** In Supabase → Authentication → URL Configuration, set the Site URL to your app URL and add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback` to the redirect allow-list. For a personal deployment you can disable email confirmation to sign in immediately after sign-up.

4. **Environment.** Copy `.env.example` to `.env.local` and fill in:

   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   GEMINI_API_KEY=            # optional; from https://aistudio.google.com (free tier)
   GEMINI_MODEL=gemini-3.5-flash
GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite
   ```

   The Gemini key is read only on the server. Without it, the app works fully and the AI pages explain what is missing. Model availability depends on the key: new keys cannot use `gemini-2.5-*`; `gemini-3.5-flash` is the tested default and `GEMINI_FALLBACK_MODEL` is used when the primary model is overloaded. Settings → Account has a **Test AI connection** button.

5. **Run**

   ```bash
   pnpm dev
   ```

## Exchange rates and income

Hired applications with an active employment record are income. Each job is estimated in its own currency (rate x hours/week x 4.33) and converted to the dashboard currency (PHP by default, Settings -> Preferences) with daily reference rates from the European Central Bank (frankfurter.app) with ExchangeRate-API as fallback. Rates are cached in `exchange_rates` (history kept), refreshed lazily when older than 12 hours, by the daily cron in `vercel.json` (needs `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`), or manually from the dashboard. The UI always shows the rate date, source and last update; it never labels a daily rate as live.

## Integrations

Settings -> Integrations connects a Google account with read-only Gmail and Calendar-events scopes (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `INTEGRATION_ENCRYPTION_KEY`). Gmail sync classifies recent recruiting mail with the AI provider and queues it in **Inbox** for review; nothing is linked, scheduled or sent without confirmation. Confirming an interview invitation can create the interview and, if you tick it, the Google Calendar event. Calendar sync mirrors upcoming events and reflects reschedules/cancellations on linked interviews.

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm typecheck` | Generates route types and runs `tsc` |
| `pnpm lint` | ESLint (includes React Compiler rules) |
| `pnpm test` | Vitest unit tests (compensation math, follow-up scheduling) |
| `RUN_AI_INTEGRATION=1 pnpm test` | Also runs the live Gemini integration test (spends a little quota) |
| `pnpm format` | Prettier with the Tailwind class sorter |

## Deploying to Vercel

Import the repo, add the same environment variables, and deploy. The proxy (`src/proxy.ts`) refreshes the Supabase session on every request and redirects unauthenticated users to `/login`.

## Project layout

```
src/app/(auth)        login, signup, forgot-password
src/app/(app)         protected pages: dashboard, applications, follow-ups, interviews, …
src/app/api/ai/*      AI route handlers (server-side; keys never reach the browser)
src/app/api/export    CSV export
src/actions           server actions (validate → auth → mutate → revalidate)
src/lib/data          read-side data access
src/lib/validations   Zod schemas shared by forms and actions
src/lib/ai            provider abstraction (Gemini implementation in providers/)
src/lib/compensation  income estimates, unit tested
src/lib/follow-ups    scheduling rules, unit tested
src/components        feature UI; src/components/ui is generated shadcn
supabase/migrations   schema, triggers, RLS, storage policies
```
