/**
 * Hand-maintained Supabase types. Keep in sync with supabase/migrations/*.sql.
 * Regenerate later with `supabase gen types typescript` once a project is linked;
 * the shape below follows the generator's output so that swap is a drop-in.
 */
import type {
  ActivityType,
  ApplicationStatus,
  AssessmentStatus,
  CommunicationDirection,
  CommunicationType,
  DocumentType,
  EmploymentType,
  FollowUpStatus,
  FollowUpType,
  InterviewOutcome,
  InterviewType,
  Priority,
  RateType,
} from "@/lib/constants";

export type Json =
  string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Row<T> = T;
type Insert<T, Optional extends keyof T, Omitted extends keyof T = never> = Omit<
  Partial<Pick<T, Optional>> & Omit<T, Optional | Omitted>,
  never
>;
type Update<T> = Partial<T>;

export type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  professional_summary: string | null;
  skills: string[];
  experience: Json;
  projects: Json;
  portfolio_url: string | null;
  resume_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  default_currency: string;
  default_timezone: string;
  default_hours_per_week: number;
  follow_up_intervals: Json;
  ai_provider: string;
  created_at: string;
  updated_at: string;
};

export type ApplicationRow = {
  id: string;
  user_id: string;
  company_name: string;
  job_title: string;
  job_url: string | null;
  platform: string | null;
  location: string | null;
  employment_type: EmploymentType | null;
  status: ApplicationStatus;
  job_description: string | null;
  applied_at: string | null;
  cover_letter: string | null;
  screening_answers: Json;
  resume_version: string | null;
  portfolio_links: string[];
  application_notes: string | null;
  offered_rate: number | null;
  proposed_rate: number | null;
  negotiated_rate: number | null;
  minimum_rate: number | null;
  currency: string;
  rate_type: RateType;
  payment_frequency: string | null;
  hours_per_week: number | null;
  hours_per_day: number | null;
  working_days: string[];
  work_schedule: string | null;
  timezone: string | null;
  shift: string | null;
  benefits: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ApplicationStatusHistoryRow = {
  id: string;
  user_id: string;
  application_id: string;
  previous_status: ApplicationStatus | null;
  new_status: ApplicationStatus;
  note: string | null;
  changed_at: string;
};

export type ContactRow = {
  id: string;
  user_id: string;
  application_id: string | null;
  name: string;
  role: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CommunicationRow = {
  id: string;
  user_id: string;
  application_id: string;
  contact_id: string | null;
  communication_type: CommunicationType;
  direction: CommunicationDirection;
  subject: string | null;
  message: string | null;
  communication_date: string;
  created_at: string;
};

export type FollowUpRow = {
  id: string;
  user_id: string;
  application_id: string;
  follow_up_type: FollowUpType;
  title: string | null;
  due_date: string;
  priority: Priority;
  status: FollowUpStatus;
  last_contact_date: string | null;
  follow_up_count: number;
  notes: string | null;
  message_draft: string | null;
  snoozed_until: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InterviewRow = {
  id: string;
  user_id: string;
  application_id: string;
  title: string | null;
  interview_type: InterviewType;
  scheduled_at: string;
  duration_minutes: number | null;
  timezone: string | null;
  platform: string | null;
  meeting_url: string | null;
  interviewer: string | null;
  notes: string | null;
  outcome: InterviewOutcome;
  created_at: string;
  updated_at: string;
};

export type AssessmentRow = {
  id: string;
  user_id: string;
  application_id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  status: AssessmentStatus;
  submission_url: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  user_id: string;
  application_id: string | null;
  file_name: string;
  file_url: string;
  document_type: DocumentType;
  size_bytes: number | null;
  mime_type: string | null;
  created_at: string;
};

export type TemplateRow = {
  id: string;
  user_id: string;
  name: string;
  category: string;
  subject: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

export type ActivityRow = {
  id: string;
  user_id: string;
  application_id: string | null;
  activity_type: ActivityType;
  title: string;
  metadata: Json;
  created_at: string;
};

type Timestamps = "created_at" | "updated_at";

export type Database = {
  __InternalSupabase: { PostgrestVersion: "13.0.4" };
  public: {
    Tables: {
      profiles: {
        Row: Row<ProfileRow>;
        Insert: Insert<ProfileRow, Exclude<keyof ProfileRow, "id">>;
        Update: Update<ProfileRow>;
        Relationships: [];
      };
      applications: {
        Row: Row<ApplicationRow>;
        Insert: Insert<
          ApplicationRow,
          | "id"
          | Timestamps
          | "status"
          | "currency"
          | "rate_type"
          | "screening_answers"
          | "portfolio_links"
          | "working_days"
          | "archived_at"
          | "job_url"
          | "platform"
          | "location"
          | "employment_type"
          | "job_description"
          | "applied_at"
          | "cover_letter"
          | "resume_version"
          | "application_notes"
          | "offered_rate"
          | "proposed_rate"
          | "negotiated_rate"
          | "minimum_rate"
          | "payment_frequency"
          | "hours_per_week"
          | "hours_per_day"
          | "work_schedule"
          | "timezone"
          | "shift"
          | "benefits"
          | "notes"
        >;
        Update: Update<ApplicationRow>;
        Relationships: [];
      };
      application_status_history: {
        Row: Row<ApplicationStatusHistoryRow>;
        Insert: Insert<
          ApplicationStatusHistoryRow,
          "id" | "changed_at" | "previous_status" | "note"
        >;
        Update: Update<ApplicationStatusHistoryRow>;
        Relationships: [
          {
            foreignKeyName: "application_status_history_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: Row<ContactRow>;
        Insert: Insert<
          ContactRow,
          | "id"
          | Timestamps
          | "application_id"
          | "role"
          | "company"
          | "email"
          | "phone"
          | "linkedin_url"
          | "notes"
        >;
        Update: Update<ContactRow>;
        Relationships: [
          {
            foreignKeyName: "contacts_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      communications: {
        Row: Row<CommunicationRow>;
        Insert: Insert<
          CommunicationRow,
          | "id"
          | "created_at"
          | "contact_id"
          | "communication_type"
          | "direction"
          | "subject"
          | "message"
          | "communication_date"
        >;
        Update: Update<CommunicationRow>;
        Relationships: [
          {
            foreignKeyName: "communications_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "communications_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
        ];
      };
      follow_ups: {
        Row: Row<FollowUpRow>;
        Insert: Insert<
          FollowUpRow,
          | "id"
          | Timestamps
          | "follow_up_type"
          | "title"
          | "priority"
          | "status"
          | "last_contact_date"
          | "follow_up_count"
          | "notes"
          | "message_draft"
          | "snoozed_until"
          | "completed_at"
        >;
        Update: Update<FollowUpRow>;
        Relationships: [
          {
            foreignKeyName: "follow_ups_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      interviews: {
        Row: Row<InterviewRow>;
        Insert: Insert<
          InterviewRow,
          | "id"
          | Timestamps
          | "title"
          | "interview_type"
          | "duration_minutes"
          | "timezone"
          | "platform"
          | "meeting_url"
          | "interviewer"
          | "notes"
          | "outcome"
        >;
        Update: Update<InterviewRow>;
        Relationships: [
          {
            foreignKeyName: "interviews_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      assessments: {
        Row: Row<AssessmentRow>;
        Insert: Insert<
          AssessmentRow,
          | "id"
          | Timestamps
          | "description"
          | "deadline"
          | "status"
          | "submission_url"
          | "notes"
          | "completed_at"
        >;
        Update: Update<AssessmentRow>;
        Relationships: [
          {
            foreignKeyName: "assessments_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      documents: {
        Row: Row<DocumentRow>;
        Insert: Insert<
          DocumentRow,
          | "id"
          | "created_at"
          | "application_id"
          | "document_type"
          | "size_bytes"
          | "mime_type"
        >;
        Update: Update<DocumentRow>;
        Relationships: [
          {
            foreignKeyName: "documents_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
      templates: {
        Row: Row<TemplateRow>;
        Insert: Insert<TemplateRow, "id" | Timestamps | "category" | "subject">;
        Update: Update<TemplateRow>;
        Relationships: [];
      };
      activities: {
        Row: Row<ActivityRow>;
        Insert: Insert<ActivityRow, "id" | "created_at" | "application_id" | "metadata">;
        Update: Update<ActivityRow>;
        Relationships: [
          {
            foreignKeyName: "activities_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "applications";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      application_status: ApplicationStatus;
      employment_type: EmploymentType;
      rate_type: RateType;
      priority_level: Priority;
      follow_up_type: FollowUpType;
      follow_up_status: FollowUpStatus;
      interview_type: InterviewType;
      interview_outcome: InterviewOutcome;
      assessment_status: AssessmentStatus;
      communication_type: CommunicationType;
      communication_direction: CommunicationDirection;
      document_type: DocumentType;
      activity_type: ActivityType;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
