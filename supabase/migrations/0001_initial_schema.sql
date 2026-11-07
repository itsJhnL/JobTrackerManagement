-- Job Tracker — initial schema
-- Apply with: supabase db push   (or paste into the Supabase SQL editor)
-- Every table is owned by user_id and protected by Row Level Security.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.application_status as enum (
  'saved', 'applied', 'viewed', 'responded', 'interview',
  'assessment', 'offer', 'hired', 'rejected', 'closed'
);

create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'freelance');

create type public.rate_type as enum ('hourly', 'daily', 'weekly', 'monthly', 'annual', 'fixed_project');

create type public.priority_level as enum ('low', 'medium', 'high', 'urgent');

create type public.follow_up_type as enum (
  'initial_application', 'interview', 'assessment', 'recruiter_response',
  'salary_negotiation', 'general'
);

create type public.follow_up_status as enum ('pending', 'completed', 'snoozed', 'cancelled');

create type public.interview_type as enum (
  'phone_screen', 'video', 'onsite', 'technical', 'behavioral', 'panel', 'final', 'other'
);

create type public.interview_outcome as enum ('pending', 'passed', 'failed', 'no_show', 'cancelled');

create type public.assessment_status as enum ('not_started', 'in_progress', 'submitted', 'passed', 'failed', 'expired');

create type public.communication_type as enum ('email', 'message', 'call', 'video', 'in_person', 'other');

create type public.communication_direction as enum ('outbound', 'inbound');

create type public.document_type as enum ('resume', 'cover_letter', 'portfolio', 'assessment', 'offer', 'other');

create type public.activity_type as enum (
  'application_created', 'status_changed', 'interview_scheduled', 'interview_updated',
  'assessment_added', 'assessment_updated', 'follow_up_created', 'follow_up_completed',
  'follow_up_snoozed', 'communication_logged', 'contact_added', 'document_uploaded',
  'application_archived', 'application_restored', 'note_added'
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users; also holds user settings)
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  professional_summary text,
  skills text[] not null default '{}',
  experience jsonb not null default '[]'::jsonb,   -- [{ title, company, start, end, highlights[] }]
  projects jsonb not null default '[]'::jsonb,     -- [{ name, description, url, technologies[] }]
  portfolio_url text,
  resume_url text,
  linkedin_url text,
  github_url text,
  default_currency text not null default 'USD',
  default_timezone text not null default 'UTC',
  default_hours_per_week numeric(5,2) not null default 40,
  follow_up_intervals jsonb not null default
    '{"application_days": 3, "second_days": 7, "interview_days": 2, "assessment_days": 3}'::jsonb,
  ai_provider text not null default 'gemini',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  company_name text not null,
  job_title text not null,
  job_url text,
  platform text,                                   -- LinkedIn, Upwork, OnlineJobs.ph, Direct, ...
  location text,
  employment_type public.employment_type,
  status public.application_status not null default 'saved',
  job_description text,
  applied_at date,

  -- Application content
  cover_letter text,
  screening_answers jsonb not null default '[]'::jsonb,  -- [{ question, answer }]
  resume_version text,
  portfolio_links text[] not null default '{}',
  application_notes text,

  -- Compensation
  offered_rate numeric(12,2),
  proposed_rate numeric(12,2),
  negotiated_rate numeric(12,2),
  minimum_rate numeric(12,2),
  currency text not null default 'USD',
  rate_type public.rate_type not null default 'hourly',
  payment_frequency text,                          -- weekly, biweekly, monthly, milestone, ...
  hours_per_week numeric(5,2),
  hours_per_day numeric(4,2),
  working_days text[] not null default '{}',       -- ['mon','tue',...]
  work_schedule text,
  timezone text,
  shift text,
  benefits text,

  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint applications_currency_check check (char_length(currency) = 3),
  constraint applications_rates_nonnegative check (
    coalesce(offered_rate, 0) >= 0 and coalesce(proposed_rate, 0) >= 0 and
    coalesce(negotiated_rate, 0) >= 0 and coalesce(minimum_rate, 0) >= 0
  ),
  constraint applications_hours_check check (
    coalesce(hours_per_week, 0) between 0 and 168 and coalesce(hours_per_day, 0) between 0 and 24
  )
);

create index applications_user_id_idx on public.applications (user_id);
create index applications_user_status_idx on public.applications (user_id, status) where archived_at is null;
create index applications_user_updated_idx on public.applications (user_id, updated_at desc);
create index applications_user_applied_idx on public.applications (user_id, applied_at desc);

create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- application_status_history (written by trigger; cannot be skipped)
-- ---------------------------------------------------------------------------

create table public.application_status_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  previous_status public.application_status,
  new_status public.application_status not null,
  note text,
  changed_at timestamptz not null default now()
);

create index status_history_application_idx on public.application_status_history (application_id, changed_at desc);
create index status_history_user_idx on public.application_status_history (user_id, changed_at desc);

create or replace function public.record_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_status_history (user_id, application_id, previous_status, new_status)
    values (new.user_id, new.id, null, new.status);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.application_status_history (user_id, application_id, previous_status, new_status)
    values (new.user_id, new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger applications_record_status_change
  after insert or update of status on public.applications
  for each row execute function public.record_status_change();

-- ---------------------------------------------------------------------------
-- contacts
-- ---------------------------------------------------------------------------

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  name text not null,
  role text,
  company text,
  email text,
  phone text,
  linkedin_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_user_idx on public.contacts (user_id);
create index contacts_application_idx on public.contacts (application_id);

create trigger contacts_set_updated_at
  before update on public.contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- communications
-- ---------------------------------------------------------------------------

create table public.communications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  communication_type public.communication_type not null default 'email',
  direction public.communication_direction not null default 'outbound',
  subject text,
  message text,
  communication_date timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index communications_application_idx on public.communications (application_id, communication_date desc);
create index communications_user_idx on public.communications (user_id, communication_date desc);

-- ---------------------------------------------------------------------------
-- follow_ups
-- ---------------------------------------------------------------------------

create table public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  follow_up_type public.follow_up_type not null default 'general',
  title text,
  due_date date not null,
  priority public.priority_level not null default 'medium',
  status public.follow_up_status not null default 'pending',
  last_contact_date date,
  follow_up_count integer not null default 0,
  notes text,
  message_draft text,
  snoozed_until date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index follow_ups_user_due_idx on public.follow_ups (user_id, due_date) where status in ('pending', 'snoozed');
create index follow_ups_application_idx on public.follow_ups (application_id, due_date);

create trigger follow_ups_set_updated_at
  before update on public.follow_ups
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- interviews
-- ---------------------------------------------------------------------------

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  title text,
  interview_type public.interview_type not null default 'video',
  scheduled_at timestamptz not null,
  duration_minutes integer,
  timezone text,
  platform text,                                   -- Zoom, Google Meet, Teams, phone
  meeting_url text,
  interviewer text,
  notes text,
  outcome public.interview_outcome not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index interviews_user_scheduled_idx on public.interviews (user_id, scheduled_at);
create index interviews_application_idx on public.interviews (application_id, scheduled_at);

create trigger interviews_set_updated_at
  before update on public.interviews
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- assessments
-- ---------------------------------------------------------------------------

create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid not null references public.applications (id) on delete cascade,
  title text not null,
  description text,
  deadline timestamptz,
  status public.assessment_status not null default 'not_started',
  submission_url text,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index assessments_user_deadline_idx on public.assessments (user_id, deadline);
create index assessments_application_idx on public.assessments (application_id);

create trigger assessments_set_updated_at
  before update on public.assessments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- documents (metadata; files live in Storage bucket "documents")
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  file_name text not null,
  file_url text not null,                          -- storage path: {user_id}/{application_id|general}/{file}
  document_type public.document_type not null default 'other',
  size_bytes bigint,
  mime_type text,
  created_at timestamptz not null default now()
);

create index documents_user_idx on public.documents (user_id);
create index documents_application_idx on public.documents (application_id);

-- ---------------------------------------------------------------------------
-- templates (reusable message / cover letter templates)
-- ---------------------------------------------------------------------------

create table public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null default 'general',        -- cover_letter, follow_up, recruiter_message, screening, general
  subject text,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index templates_user_idx on public.templates (user_id, category);

create trigger templates_set_updated_at
  before update on public.templates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- activities (feed for the dashboard; written by server actions)
-- ---------------------------------------------------------------------------

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  application_id uuid references public.applications (id) on delete cascade,
  activity_type public.activity_type not null,
  title text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activities_user_created_idx on public.activities (user_id, created_at desc);
create index activities_application_idx on public.activities (application_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.application_status_history enable row level security;
alter table public.contacts enable row level security;
alter table public.communications enable row level security;
alter table public.follow_ups enable row level security;
alter table public.interviews enable row level security;
alter table public.assessments enable row level security;
alter table public.documents enable row level security;
alter table public.templates enable row level security;
alter table public.activities enable row level security;

-- profiles: id is the owner key
create policy "profiles_select_own" on public.profiles for select using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles for insert with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "profiles_delete_own" on public.profiles for delete using ((select auth.uid()) = id);

-- Generic owner policies for every user_id table.
do $$
declare
  t text;
begin
  foreach t in array array[
    'applications', 'application_status_history', 'contacts', 'communications',
    'follow_ups', 'interviews', 'assessments', 'documents', 'templates', 'activities'
  ]
  loop
    execute format('create policy "%1$s_select_own" on public.%1$I for select using ((select auth.uid()) = user_id);', t);
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert with check ((select auth.uid()) = user_id);', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);', t);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete using ((select auth.uid()) = user_id);', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage: private "documents" bucket, folder per user
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 10485760,
  array['application/pdf', 'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain', 'image/png', 'image/jpeg']
)
on conflict (id) do nothing;

create policy "documents_storage_select_own" on storage.objects for select
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_storage_insert_own" on storage.objects for insert
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_storage_update_own" on storage.objects for update
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_storage_delete_own" on storage.objects for delete
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
