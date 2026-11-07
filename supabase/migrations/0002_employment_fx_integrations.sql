-- Job Tracker — migration 0002
-- Employment records on applications, display currency, exchange rates with history,
-- extra pipeline statuses, and the integration tables for Gmail / Google Calendar.
-- Apply after 0001 with: supabase db push   (or paste into the Supabase SQL editor)

-- ---------------------------------------------------------------------------
-- Statuses: shortlisted (between responded and interview) and withdrawn (terminal)
-- ---------------------------------------------------------------------------
alter type public.application_status add value if not exists 'shortlisted' after 'responded';
alter type public.application_status add value if not exists 'withdrawn' after 'rejected';

-- ---------------------------------------------------------------------------
-- Employment records: a hired application is an employment record
-- ---------------------------------------------------------------------------
alter table public.applications
  add column if not exists employment_active boolean not null default true,
  add column if not exists employment_started_at date,
  add column if not exists employment_ended_at date;

comment on column public.applications.employment_active is
  'Only hired applications with employment_active = true count toward estimated income.';

create index if not exists applications_user_employment_idx
  on public.applications (user_id)
  where status = 'hired' and employment_active = true and archived_at is null;

-- ---------------------------------------------------------------------------
-- Profiles: consolidated display currency (PHP by default)
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists display_currency text not null default 'PHP';

-- ---------------------------------------------------------------------------
-- Exchange rates (shared, append-only history; one row per pair/day/source)
-- ---------------------------------------------------------------------------
create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  base_currency text not null,
  quote_currency text not null,
  rate numeric(18,8) not null check (rate > 0),
  rate_date date not null,                 -- the provider's rate date
  source text not null,                    -- e.g. 'frankfurter' (ECB) or 'exchangerate-api'
  provider_updated_at timestamptz,         -- when the provider says the rate was published
  fetched_at timestamptz not null default now(),
  constraint exchange_rates_currency_check check (char_length(base_currency) = 3 and char_length(quote_currency) = 3),
  constraint exchange_rates_unique_per_day unique (base_currency, quote_currency, rate_date, source)
);

create index if not exists exchange_rates_latest_idx
  on public.exchange_rates (base_currency, quote_currency, rate_date desc);

alter table public.exchange_rates enable row level security;

-- Rates are not private data: any signed-in user may read them and append new ones.
-- Rows are never updated or deleted from the app, so history stays intact.
create policy "exchange_rates_select_authenticated" on public.exchange_rates
  for select to authenticated using (true);
create policy "exchange_rates_insert_authenticated" on public.exchange_rates
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------------------
-- Google integrations (Gmail + Calendar). Tokens are stored encrypted (AES-GCM,
-- key from INTEGRATION_ENCRYPTION_KEY) and never leave the server.
-- ---------------------------------------------------------------------------
create type public.integration_provider as enum ('google');
create type public.integration_status as enum ('connected', 'error', 'revoked');

create table if not exists public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  provider public.integration_provider not null default 'google',
  account_email text,
  scopes text[] not null default '{}',
  refresh_token_enc text,                  -- encrypted refresh token
  access_token_enc text,                   -- encrypted short-lived access token
  access_token_expires_at timestamptz,
  status public.integration_status not null default 'connected',
  gmail_history_id text,                   -- incremental sync cursor
  calendar_sync_token text,                -- incremental sync cursor
  last_gmail_sync_at timestamptz,
  last_calendar_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integration_accounts_one_per_provider unique (user_id, provider)
);

create trigger integration_accounts_set_updated_at
  before update on public.integration_accounts
  for each row execute function public.set_updated_at();

create type public.email_classification as enum (
  'application_confirmation', 'recruiter_response', 'interview_invitation',
  'interview_reschedule', 'job_offer', 'rejection', 'other_recruiting', 'not_recruiting'
);
create type public.email_review_status as enum ('pending', 'confirmed', 'dismissed');

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.integration_accounts (id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  from_name text,
  from_email text,
  subject text,
  snippet text,
  received_at timestamptz,
  classification public.email_classification,
  confidence numeric(4,3),
  extracted jsonb not null default '{}'::jsonb,     -- interview details etc.
  application_id uuid references public.applications (id) on delete set null,
  match_confidence numeric(4,3),
  review_status public.email_review_status not null default 'pending',
  interview_id uuid references public.interviews (id) on delete set null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint email_messages_unique_message unique (user_id, gmail_message_id)
);

create index if not exists email_messages_user_review_idx
  on public.email_messages (user_id, review_status, received_at desc);
create index if not exists email_messages_application_idx on public.email_messages (application_id);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null references public.integration_accounts (id) on delete cascade,
  interview_id uuid references public.interviews (id) on delete set null,
  google_event_id text not null,
  google_calendar_id text not null default 'primary',
  summary text,
  starts_at timestamptz,
  ends_at timestamptz,
  timezone text,
  meeting_url text,
  html_link text,
  status text,                              -- confirmed | tentative | cancelled
  etag text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint calendar_events_unique_event unique (user_id, google_calendar_id, google_event_id)
);

create index if not exists calendar_events_user_start_idx on public.calendar_events (user_id, starts_at);
create index if not exists calendar_events_interview_idx on public.calendar_events (interview_id);

-- Link an interview to its calendar event without a second lookup.
alter table public.interviews
  add column if not exists google_event_id text,
  add column if not exists source text not null default 'manual';   -- manual | gmail | calendar

alter table public.integration_accounts enable row level security;
alter table public.email_messages enable row level security;
alter table public.calendar_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['integration_accounts', 'email_messages', 'calendar_events']
  loop
    execute format('create policy "%1$s_select_own" on public.%1$I for select using ((select auth.uid()) = user_id);', t);
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert with check ((select auth.uid()) = user_id);', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);', t);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete using ((select auth.uid()) = user_id);', t);
  end loop;
end $$;

-- Activity types for the new flows
alter type public.activity_type add value if not exists 'employment_updated';
alter type public.activity_type add value if not exists 'email_detected';
alter type public.activity_type add value if not exists 'calendar_synced';
alter type public.activity_type add value if not exists 'integration_connected';
alter type public.activity_type add value if not exists 'integration_disconnected';
