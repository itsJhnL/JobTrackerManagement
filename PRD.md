# Job Tracker — Product Requirements Document

A personal CRM for managing job applications, recruiters, interviews, assessments, compensation, and follow-ups. It should feel like a premium SaaS product (Linear / Raycast / modern shadcn dashboards), not an admin template.

## 1. Users and jobs to be done

Single user, personal deployment (one Supabase project, one Vercel deployment). Multi-user safe by design: every row is owned by `user_id` and protected by Row Level Security.

Jobs to be done, in priority order:

1. Enter a new opportunity in under a minute (manual or paste-a-job-post + AI extraction).
2. See the whole pipeline at a glance and know what needs attention today.
3. Never miss a follow-up. Draft follow-up messages quickly, but never send automatically.
4. Compare opportunities on compensation and hours, in their original currency, with clearly labeled estimates.
5. Keep recruiter contacts, interview schedules, assessments, and documents attached to the application they belong to.
6. Use AI to parse job posts, judge fit, and draft application and interview material from verified profile data only.

## 2. Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack, Server Components by default) |
| Language | TypeScript, strict |
| Styling | Tailwind CSS v4, shadcn/ui (base-nova style on Base UI), Lucide icons |
| Data | Supabase (Postgres, Auth, Storage), `@supabase/ssr` |
| Tables | TanStack Table v9 |
| Forms | React Hook Form + Zod v4 |
| Charts | Recharts 3 |
| Toasts | Sonner |
| AI | Google Gemini via `@google/genai`, server-side only, behind a provider abstraction |
| Hosting | Vercel |

## 3. Navigation and layout

Collapsible left sidebar (icon-collapse on desktop, Sheet on mobile).

- Workspace: Dashboard, Applications, Follow-ups, Interviews, Assessments, Contacts, Analytics
- Tools: AI Assistant, Templates, Settings
- Footer: user profile menu (account settings, theme, sign out)

Top bar: breadcrumbs, global search (opens command palette, `⌘K` / `Ctrl K`), notifications (due and overdue follow-ups), Quick Add Application.

## 4. Functional requirements

### 4.1 Dashboard

- Summary cards: Total, Active, Interviews, Follow-ups due, Offers, Estimated monthly income (per currency; never summed across currencies).
- Pipeline strip with counts per status: Saved → Applied → Viewed → Responded → Interview → Assessment → Offer → Hired, plus Rejected and Closed.
- Follow-ups panel: overdue, due today, upcoming; inline "Mark contacted" and "Snooze".
- Recent activity feed (status changes, follow-ups completed, interviews scheduled, communications logged).
- Compensation overview: average hourly rate (per currency), total expected weekly hours, estimated monthly income, distribution by rate band.
- Empty states that explain the next action.

### 4.2 Applications

- TanStack Table with columns: Company, Job Title, Status, Platform, Employment Type, Offered Rate, Proposed Rate, Hours/Week, Applied, Next Follow-up, Last Updated.
- Search, sort, filter (status, employment type, platform, rate range), pagination, column visibility, bulk select with bulk status change / archive / delete, table and card views.
- Create, edit, archive (soft delete via `archived_at`), delete (hard, with confirmation).
- Detail page tabs: Overview, Application, Compensation, Communication, Interviews, Tasks, Activity.
- Every status change is recorded in `application_status_history`.

### 4.3 Compensation

Fields: offered, proposed, negotiated, minimum acceptable rate; currency; rate type (hourly, daily, weekly, monthly, annual, fixed project); employment type; hours per week and per day; working days; work schedule; time zone; shift; benefits; payment frequency.

Monthly estimate rules (see `src/lib/compensation.ts`, unit tested):

- hourly: `rate × hours_per_week × 52 / 12`
- daily: `rate × working_days_per_week × 52 / 12`
- weekly: `rate × 52 / 12`
- monthly: `rate`
- annual: `rate / 12`
- fixed project: no monthly estimate; shown as a one-time amount

Rules: keep the original currency; never add currencies together; label every number as an estimate; the user can edit the assumptions (hours, days) per application and set defaults in Settings. Show proposed vs offered vs negotiated side by side. A comparison view lays applications side by side.

### 4.4 Follow-ups

Fields: application, type, due date, priority, status, last contact date, follow-up count, notes, message draft.

Types: initial application, interview, assessment, recruiter response, salary negotiation, general.
Views: Due today, Overdue, Upcoming, Completed, Snoozed.
Suggested intervals (editable in Settings): application +3 business days, next +7 days, interview +1–2 business days, assessment +2–3 business days.
Nothing is ever sent automatically. The app only drafts; the user copies and sends.

### 4.5 AI assistant

All calls go through `POST /api/ai/*` route handlers; keys live in `GEMINI_API_KEY`. The provider sits behind `AiProvider` in `src/lib/ai/` so it can be swapped. Loading, error, retry, and quota-exceeded states are explicit in the UI.

Features: job description parser (editable review before save), job fit analyzer (verified experience vs AI assumptions clearly separated), application writer (cover letter, email, screening answers, recruiter message), follow-up message generator, interview preparation. All output is editable before saving or copying. The writer must not invent experience.

### 4.6 Quick Add

Global button + `⌘K` command. Two paths: manual form, or paste → parse → review/edit → save. Multi-step Sheet, state preserved between steps.

### 4.7 Interviews, assessments, contacts, documents

CRUD for each, always attached to an application. Interviews carry time zone, platform, meeting URL, notes, outcome. Assessments carry deadline, status, submission URL. Documents are stored in Supabase Storage under `documents/{user_id}/...` with per-user policies.

### 4.8 Analytics

Applications over time, response rate, interview conversion, offer rate, rejection rate, average proposed and negotiated hourly rate (per currency), breakdowns by platform, employment type, and status. Percentages are hidden below a minimum sample size (n < 5) and replaced with "Not enough data".

### 4.9 Settings

Profile, skills and experience, portfolio and resume links, default currency, default time zone, default weekly hours, follow-up intervals, AI provider status, theme, CSV export, account.

## 5. Non-functional requirements

- Security: RLS on every table; server actions and route handlers re-check the session; secrets never reach the browser.
- Validation: Zod schemas shared between forms and server actions.
- Accessibility: keyboard navigable, focus visible, labelled controls, accessible chart tooltips.
- Performance: server components by default, client components only for interactivity, no unnecessary effects.
- Responsiveness: desktop, tablet, mobile.
- Theming: light and dark with system default.

## 6. Out of scope (v1)

Sending email, calendar sync, multi-user teams, browser extension, currency conversion with live rates (a static, user-editable table may come later).
