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

| Phase                       | Scope                                                                              | Status                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 1 Foundation                | Next.js + shadcn, theme, layout + sidebar, Supabase auth, schema + RLS             | done (2026-11-05)                                                                                                                |
| 2 Core tracker              | Dashboard, applications table, add/edit, detail page, status management            | done (2026-11-05)                                                                                                                |
| 3 Compensation + follow-ups | Rate/hours tracking, calculator, comparison, follow-up views, scheduling           | done (2026-11-05)                                                                                                                |
| 4 AI assistant              | Gemini provider, parser, fit analyzer, writer, follow-up generator, interview prep | done (2026-11-05), untested against a live key                                                                                   |
| 5 Productivity              | Interviews, assessments, contacts, analytics, CSV export, templates                | done (2026-11-05); document upload UI not built                                                                                  |
| 6 Polish                    | Responsive, dark mode, a11y, error handling, performance, tests, deploy            | partial: loading/error/not-found states, dark mode, keyboard nav done; no e2e tests; not yet run against a live Supabase project |

| 7 Audit round (2026-11-06) | Perf (router cache, request-scoped client), time-zone picker + consistent TZ rendering, logout hardening, employment income with PHP conversion + FX history, new statuses, Google Gmail/Calendar integration layer, Inbox review, cron | done; Google flows untested without credentials |

## Known gaps (as of 2026-11-07)

- Google OAuth now completes against a real account (test user on the consent screen). Gmail and Calendar syncs run in the background; their behaviour on a large real inbox/calendar is only verified with simulated Google responses.
- Calendar interview detection is rule-based (title keywords, organizer domain, company names). Events that look like interviews but match no application are offered as suggestions on the Interviews page rather than tracked automatically.
- Job links are read on the server. Sites that require sign-in or render only in the browser can't be read; the user is told to paste the text instead.
- Work arrangement (remote/hybrid/on-site) is stored at the start of `location` because `applications` has no dedicated column yet.
- Migration `0003_interview_calendar_event_unique.sql` (optional hardening) is not applied to the live project yet.

- Google OAuth reaches Google's consent screen with the minimal scopes and rejects forged state, but a full consent → token → Gmail/Calendar sync has not been completed against a real Google account.
- The end-to-end browser suite (Playwright, ~215 checks) lives outside the repo; there is no CI running it yet.
- Currency conversion uses daily reference rates (ECB / ExchangeRate-API), not live market quotes; the UI says so.

## Known gaps (as of 2026-11-06)

- Migration `0002_employment_fx_integrations.sql` must be applied to the live project; the app degrades gracefully (no rates, no employment flags) until then.
- Google OAuth, Gmail sync and Calendar sync are implemented but have not been exercised against real Google credentials.
- No end-to-end browser tests; email confirmation is enabled on the live project so automated sign-in tests were not possible from this environment.
- Currency conversion uses daily reference rates (ECB / ExchangeRate-API), not live market quotes; the UI says so.

## Known gaps (as of 2026-11-05)

- Nothing has been exercised against a real Supabase project or Gemini key yet; the first live run will surface integration issues.
- Document upload to the `documents` storage bucket has schema + policies but no UI.
- No end-to-end tests. Unit tests cover compensation math and follow-up scheduling only.
- Currency conversion is intentionally absent; cross-currency aggregates are grouped, never summed.

## Non-goals for v1

Sending email or messages, calendar integrations, multi-user workspaces, live currency conversion, a browser extension.
