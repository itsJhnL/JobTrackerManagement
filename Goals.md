# Goals

What "done" means for this project, in priority order. When two goals conflict, the higher one wins.

## Product goals

1. **Excellent UX and navigation.** Every page is reachable in two clicks or one keystroke (`⌘K`). The sidebar, breadcrumbs, and command palette agree on names.
2. **Fast entry and editing.** A new application takes under a minute by hand and under thirty seconds via paste-and-parse. Edits save inline where safe, with optimistic UI only when a failure is trivially reversible.
3. **Clear pipeline visibility.** The dashboard answers "where do I stand?" and "what do I do today?" without scrolling.
4. **Reliable follow-up tracking.** Overdue and due-today follow-ups are impossible to miss. Nothing is sent automatically.
5. **Accurate compensation math.** Estimates are computed by one tested module, preserve currency, and are always labelled as estimates.
6. **Useful, safe AI.** AI reads only verified profile data, never invents experience, always returns editable drafts, and keys never leave the server.
7. **Maintainable architecture.** A new developer can find the data-access layer, the validation schemas, and the UI for a feature in under a minute.

## Engineering goals

- Server components by default; client components only where interaction demands.
- One data-access layer (`src/lib/data/`) and one place for mutations (`src/actions/`). No Supabase calls from components.
- Zod schemas (`src/lib/validations/`) shared by forms and server actions.
- RLS on every table. Server actions re-check `auth.getUser()` on every call. Frontend filtering is never the only guard.
- Every destructive action has a confirmation dialog. Archive is the default; delete is explicit.
- Loading, error, empty, and success states on every screen.
- Light and dark themes, keyboard navigation, visible focus, labelled controls.
- `pnpm typecheck`, `pnpm lint`, and `pnpm test` pass before a phase is called complete.

## Phase plan

| Phase | Scope | Status |
| --- | --- | --- |
| 1 Foundation | Next.js + shadcn, theme, layout + sidebar, Supabase auth, schema + RLS | done (2026-11-05) |
| 2 Core tracker | Dashboard, applications table, add/edit, detail page, status management | done (2026-11-05) |
| 3 Compensation + follow-ups | Rate/hours tracking, calculator, comparison, follow-up views, scheduling | done (2026-11-05) |
| 4 AI assistant | Gemini provider, parser, fit analyzer, writer, follow-up generator, interview prep | done (2026-11-05), untested against a live key |
| 5 Productivity | Interviews, assessments, contacts, analytics, CSV export, templates | done (2026-11-05); document upload UI not built |
| 6 Polish | Responsive, dark mode, a11y, error handling, performance, tests, deploy | partial: loading/error/not-found states, dark mode, keyboard nav done; no e2e tests; not yet run against a live Supabase project |

## Known gaps (as of 2026-11-05)

- Nothing has been exercised against a real Supabase project or Gemini key yet; the first live run will surface integration issues.
- Document upload to the `documents` storage bucket has schema + policies but no UI.
- No end-to-end tests. Unit tests cover compensation math and follow-up scheduling only.
- Currency conversion is intentionally absent; cross-currency aggregates are grouped, never summed.

## Non-goals for v1

Sending email or messages, calendar integrations, multi-user workspaces, live currency conversion, a browser extension.
