export type UserRole = "super_admin" | "client_admin" | "va";
export type DailyLogMood = "great" | "good" | "neutral" | "difficult" | "overwhelmed";
export type VaultSourceType = "pdf" | "docx" | "text" | "url";
export type VaultStatus = "pending" | "processing" | "ready" | "error";
export type KbRunStatus = "running" | "completed" | "failed";
export type TimeEntryPhase = "work" | "break";

export interface DbClient {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  created_by: string | null;
  archived_at: string | null;
}

export interface DbUser {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  client_id: string | null;
  created_at: string;
  phone: string | null;
  birthday: string | null;
  avatar_url: string | null;
  salary: number | null;
  payment_terms: string | null;
  payment_details: string | null;
  whatsapp: string | null;
  personal_email: string | null;
  address: string | null;
  timezone: string | null;
  skills: string[] | null;
}

export interface DbTimeEntry {
  id: string;
  user_id: string;
  client_id: string;
  work_date: string;
  phase: TimeEntryPhase;
  started_at: string;
  ended_at: string | null;
  is_manual: boolean;
  notes: string | null;
  category: string;
  created_at: string;
}

export interface DbCompanyDna {
  id: string;
  client_id: string;
  company_name: string | null;
  founders: string | null;
  location: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  values: string | null;
  services: string | null;
  target_demographic: string | null;
  client_type: string | null;
  brand_voice: string | null;
  sign_off: string | null;
  extra: Record<string, unknown>;
  updated_at: string;
}

export type VaultCategory = 'process' | 'policy' | 'service' | 'contact' | 'reference' | 'general';

export interface DbVaultItem {
  id: string;
  client_id: string;
  source_type: VaultSourceType;
  title: string;
  source_url: string | null;
  storage_path: string | null;
  raw_content: string | null;
  status: VaultStatus;
  error_message: string | null;
  created_at: string;
  created_by: string | null;
  category: VaultCategory | null;
  tags: string[];
  ai_summary: string | null;
  updated_at: string | null;
  updated_by: string | null;
  content_hash: string | null;
}

export interface DbKbEntry {
  id: string;
  client_id: string;
  question: string;
  answer: string;
  source_vault_ids: string[];
  category: string | null;
  generated_at: string;
}

export interface DbKbGenerationRun {
  id: string;
  client_id: string;
  triggered_by: string | null;
  status: KbRunStatus;
  entries_generated: number | null;
  tokens_used: number | null;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
}

type NoRelationships = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
}[];

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: { id: string; name: string; slug: string; created_at: string; created_by: string | null; archived_at: string | null };
        Insert: { id?: string; name: string; slug: string; created_at?: string; created_by?: string | null; archived_at?: string | null };
        Update: { id?: string; name?: string; slug?: string; created_at?: string; created_by?: string | null };
        Relationships: NoRelationships;
      };
      users: {
        Row: { id: string; email: string; full_name: string | null; role: string; client_id: string | null; created_at: string; phone: string | null; birthday: string | null; avatar_url: string | null; salary: number | null; payment_terms: string | null; payment_details: string | null; whatsapp: string | null; personal_email: string | null; address: string | null; timezone: string | null; skills: string[] | null };
        Insert: { id: string; email: string; full_name?: string | null; role: string; client_id?: string | null; created_at?: string; phone?: string | null; birthday?: string | null; avatar_url?: string | null; salary?: number | null; payment_terms?: string | null; payment_details?: string | null; whatsapp?: string | null; personal_email?: string | null; address?: string | null; timezone?: string | null; skills?: string[] | null };
        Update: { id?: string; email?: string; full_name?: string | null; role?: string; client_id?: string | null; created_at?: string; phone?: string | null; birthday?: string | null; avatar_url?: string | null; salary?: number | null; payment_terms?: string | null; payment_details?: string | null; whatsapp?: string | null; personal_email?: string | null; address?: string | null; timezone?: string | null; skills?: string[] | null };
        Relationships: [
          { foreignKeyName: "users_client_id_fkey"; columns: ["client_id"]; isOneToOne: false; referencedRelation: "clients"; referencedColumns: ["id"] }
        ];
      };
      company_dna: {
        Row: { id: string; client_id: string; company_name: string | null; founders: string | null; location: string | null; phone: string | null; email: string | null; website: string | null; values: string | null; services: string | null; target_demographic: string | null; client_type: string | null; brand_voice: string | null; sign_off: string | null; extra: Record<string, unknown>; updated_at: string };
        Insert: { id?: string; client_id: string; company_name?: string | null; founders?: string | null; location?: string | null; phone?: string | null; email?: string | null; website?: string | null; values?: string | null; services?: string | null; target_demographic?: string | null; client_type?: string | null; brand_voice?: string | null; sign_off?: string | null; extra?: Record<string, unknown>; updated_at?: string };
        Update: { id?: string; client_id?: string; company_name?: string | null; founders?: string | null; location?: string | null; phone?: string | null; email?: string | null; website?: string | null; values?: string | null; services?: string | null; target_demographic?: string | null; client_type?: string | null; brand_voice?: string | null; sign_off?: string | null; extra?: Record<string, unknown>; updated_at?: string };
        Relationships: NoRelationships;
      };
      vault_items: {
        Row: { id: string; client_id: string; source_type: string; title: string; source_url: string | null; storage_path: string | null; raw_content: string | null; status: string; error_message: string | null; created_at: string; created_by: string | null; category: string | null; tags: string[]; ai_summary: string | null; updated_at: string | null; updated_by: string | null; content_hash: string | null; meta_curated: boolean };
        Insert: { id?: string; client_id: string; source_type: string; title: string; source_url?: string | null; storage_path?: string | null; raw_content?: string | null; status?: string; error_message?: string | null; created_at?: string; created_by?: string | null; category?: string | null; tags?: string[]; ai_summary?: string | null; updated_at?: string | null; updated_by?: string | null; content_hash?: string | null; meta_curated?: boolean };
        Update: { id?: string; client_id?: string; source_type?: string; title?: string; source_url?: string | null; storage_path?: string | null; raw_content?: string | null; status?: string; error_message?: string | null; created_at?: string; created_by?: string | null; category?: string | null; tags?: string[]; ai_summary?: string | null; updated_at?: string | null; updated_by?: string | null; content_hash?: string | null; meta_curated?: boolean };
        Relationships: NoRelationships;
      };
      kb_entries: {
        Row: { id: string; client_id: string; question: string; answer: string; source_vault_ids: string[]; category: string | null; generated_at: string; is_pinned: boolean };
        Insert: { id?: string; client_id: string; question: string; answer: string; source_vault_ids: string[]; category?: string | null; generated_at?: string; is_pinned?: boolean };
        Update: { id?: string; client_id?: string; question?: string; answer?: string; source_vault_ids?: string[]; category?: string | null; generated_at?: string; is_pinned?: boolean };
        Relationships: NoRelationships;
      };
      kb_generation_runs: {
        Row: { id: string; client_id: string; triggered_by: string | null; status: string; entries_generated: number | null; tokens_used: number | null; error_message: string | null; started_at: string; completed_at: string | null };
        Insert: { id?: string; client_id: string; triggered_by?: string | null; status?: string; entries_generated?: number | null; tokens_used?: number | null; error_message?: string | null; started_at?: string; completed_at?: string | null };
        Update: { id?: string; client_id?: string; triggered_by?: string | null; status?: string; entries_generated?: number | null; tokens_used?: number | null; error_message?: string | null; started_at?: string; completed_at?: string | null };
        Relationships: NoRelationships;
      };
      crm_contacts: {
        Row: { id: string; client_id: string; first_name: string; last_name: string | null; email: string | null; phone: string | null; company: string | null; job_title: string | null; status: string; source: string | null; tags: string[]; notes: string | null; created_by: string | null; archived_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; first_name: string; last_name?: string | null; email?: string | null; phone?: string | null; company?: string | null; job_title?: string | null; status?: string; source?: string | null; tags?: string[]; notes?: string | null; created_by?: string | null; archived_at?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; first_name?: string; last_name?: string | null; email?: string | null; phone?: string | null; company?: string | null; job_title?: string | null; status?: string; source?: string | null; tags?: string[]; notes?: string | null; created_by?: string | null; archived_at?: string | null; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      app_errors: {
        Row: { id: string; source: string; message: string; stack: string | null; url: string | null; user_id: string | null; client_id: string | null; created_at: string };
        Insert: { id?: string; source: string; message: string; stack?: string | null; url?: string | null; user_id?: string | null; client_id?: string | null; created_at?: string };
        Update: { id?: string; source?: string; message?: string; stack?: string | null; url?: string | null; user_id?: string | null; client_id?: string | null; created_at?: string };
        Relationships: NoRelationships;
      };
      ai_prompts: {
        Row: { slug: string; content: string; updated_by: string | null; updated_at: string };
        Insert: { slug: string; content: string; updated_by?: string | null; updated_at?: string };
        Update: { slug?: string; content?: string; updated_by?: string | null; updated_at?: string };
        Relationships: NoRelationships;
      };
      ai_prompt_versions: {
        Row: { id: string; slug: string; content: string; saved_by: string | null; created_at: string };
        Insert: { id?: string; slug: string; content: string; saved_by?: string | null; created_at?: string };
        Update: { id?: string; slug?: string; content?: string; saved_by?: string | null; created_at?: string };
        Relationships: NoRelationships;
      };
      crm_events: {
        Row: { id: string; contact_id: string; client_id: string; user_id: string | null; body: string; created_at: string };
        Insert: { id?: string; contact_id: string; client_id: string; user_id?: string | null; body: string; created_at?: string };
        Update: { id?: string; contact_id?: string; client_id?: string; user_id?: string | null; body?: string; created_at?: string };
        Relationships: NoRelationships;
      };
      crm_notes: {
        Row: { id: string; contact_id: string; client_id: string; body: string; created_by: string | null; created_at: string };
        Insert: { id?: string; contact_id: string; client_id: string; body: string; created_by?: string | null; created_at?: string };
        Update: { id?: string; contact_id?: string; client_id?: string; body?: string; created_by?: string | null; created_at?: string };
        Relationships: NoRelationships;
      };
      sops: {
        Row: { id: string; client_id: string | null; title: string; category: string; body: string; order_index: number; created_by: string | null; steps: { title: string; detail: string; tip?: string }[] | null; intro: string | null; prerequisites: string[] | null; version: number; forked_from: string | null; forked_version: number | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id?: string | null; title: string; category?: string; body?: string; order_index?: number; created_by?: string | null; steps?: { title: string; detail: string; tip?: string }[] | null; intro?: string | null; prerequisites?: string[] | null; version?: number; forked_from?: string | null; forked_version?: number | null; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string | null; title?: string; category?: string; body?: string; order_index?: number; created_by?: string | null; steps?: { title: string; detail: string; tip?: string }[] | null; intro?: string | null; prerequisites?: string[] | null; version?: number; forked_from?: string | null; forked_version?: number | null; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      content_pieces: {
        Row: { id: string; client_id: string; content_type: string; title: string; brief: string | null; body: string | null; status: string; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; content_type: string; title: string; brief?: string | null; body?: string | null; status?: string; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; content_type?: string; title?: string; brief?: string | null; body?: string | null; status?: string; created_by?: string | null; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      daily_logs: {
        Row: { id: string; client_id: string; user_id: string; log_date: string; tasks_done: string; positives: string; challenges: string; goals_achieved: string; goals_tomorrow: string; mood: DailyLogMood | null; admin_feedback: string | null; reviewed_at: string | null; reviewed_by: string | null; updated_at: string };
        Insert: { id?: string; client_id: string; user_id: string; log_date: string; tasks_done?: string; positives?: string; challenges?: string; goals_achieved?: string; goals_tomorrow?: string; mood?: DailyLogMood | null; admin_feedback?: string | null; reviewed_at?: string | null; reviewed_by?: string | null; updated_at?: string };
        Update: { id?: string; client_id?: string; user_id?: string; log_date?: string; tasks_done?: string; positives?: string; challenges?: string; goals_achieved?: string; goals_tomorrow?: string; mood?: DailyLogMood | null; admin_feedback?: string | null; reviewed_at?: string | null; reviewed_by?: string | null; updated_at?: string };
        Relationships: [
          { foreignKeyName: "daily_log_notes_log_id_fkey"; columns: ["id"]; isOneToOne: false; referencedRelation: "daily_log_notes"; referencedColumns: ["log_id"] },
          { foreignKeyName: "daily_logs_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "users"; referencedColumns: ["id"] }
        ];
      };
      daily_log_notes: {
        Row: { id: string; log_id: string; client_id: string; user_id: string; body: string; created_at: string };
        Insert: { id?: string; log_id: string; client_id: string; user_id: string; body: string; created_at?: string };
        Update: { id?: string; log_id?: string; client_id?: string; user_id?: string; body?: string; created_at?: string };
        Relationships: NoRelationships;
      };
      time_entries: {
        Row: { id: string; user_id: string; client_id: string; work_date: string; phase: TimeEntryPhase; started_at: string; ended_at: string | null; is_manual: boolean; notes: string | null; category: string; created_at: string };
        Insert: { id?: string; user_id: string; client_id: string; work_date: string; phase: TimeEntryPhase; started_at: string; ended_at?: string | null; is_manual?: boolean; notes?: string | null; category?: string; created_at?: string };
        Update: { id?: string; user_id?: string; client_id?: string; work_date?: string; phase?: TimeEntryPhase; started_at?: string; ended_at?: string | null; is_manual?: boolean; notes?: string | null; category?: string; created_at?: string };
        Relationships: NoRelationships;
      };
      sop_runs: {
        Row: { id: string; sop_id: string; client_id: string | null; user_id: string | null; status: string; steps_total: number; steps_done: number; created_at: string; updated_at: string };
        Insert: { id?: string; sop_id: string; client_id?: string | null; user_id?: string | null; status?: string; steps_total?: number; steps_done?: number; created_at?: string; updated_at?: string };
        Update: { id?: string; sop_id?: string; client_id?: string | null; user_id?: string | null; status?: string; steps_total?: number; steps_done?: number; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      tasks: {
        Row: { id: string; client_id: string; assigned_to: string | null; created_by: string | null; title: string; description: string; status: string; order_index: number; due_date: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; assigned_to?: string | null; created_by?: string | null; title: string; description?: string; status?: string; order_index?: number; due_date?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; assigned_to?: string | null; created_by?: string | null; title?: string; description?: string; status?: string; order_index?: number; due_date?: string | null; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      access_credentials: {
        Row: { id: string; client_id: string; created_by: string | null; site: string; category: string; url: string; username: string; password_enc: string; restricted_to: string[] | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; created_by?: string | null; site: string; category?: string; url?: string; username?: string; password_enc: string; restricted_to?: string[] | null; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; created_by?: string | null; site?: string; category?: string; url?: string; username?: string; password_enc?: string; restricted_to?: string[] | null; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      access_credential_reveals: {
        Row: { id: string; credential_id: string; client_id: string; user_id: string | null; revealed_at: string };
        Insert: { id?: string; credential_id: string; client_id: string; user_id?: string | null; revealed_at?: string };
        Update: { id?: string; credential_id?: string; client_id?: string; user_id?: string | null; revealed_at?: string };
        Relationships: NoRelationships;
      };
      schema_migrations: {
        Row: { version: string; applied_at: string };
        Insert: { version: string; applied_at?: string };
        Update: { version?: string; applied_at?: string };
        Relationships: NoRelationships;
      };
      crawl_jobs: {
        Row: { id: string; client_id: string; created_by: string | null; url: string; status: string; error: string | null; firecrawl_id: string | null; page_cap: number; pages_total: number; pages_done: number; items_created: number; products_seen: number; pages_dropped: number; tokens_used: number; dossier_item_id: string | null; meta: Record<string, unknown>; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; created_by?: string | null; url: string; status?: string; error?: string | null; firecrawl_id?: string | null; page_cap?: number; pages_total?: number; pages_done?: number; items_created?: number; products_seen?: number; pages_dropped?: number; tokens_used?: number; dossier_item_id?: string | null; meta?: Record<string, unknown>; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; created_by?: string | null; url?: string; status?: string; error?: string | null; firecrawl_id?: string | null; page_cap?: number; pages_total?: number; pages_done?: number; items_created?: number; products_seen?: number; pages_dropped?: number; tokens_used?: number; dossier_item_id?: string | null; meta?: Record<string, unknown>; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      task_events: {
        Row: { id: string; task_id: string; client_id: string; user_id: string | null; kind: string; body: string; created_at: string };
        Insert: { id?: string; task_id: string; client_id: string; user_id?: string | null; kind: string; body: string; created_at?: string };
        Update: { id?: string; task_id?: string; client_id?: string; user_id?: string | null; kind?: string; body?: string; created_at?: string };
        Relationships: NoRelationships;
      };
      notifications: {
        Row: { id: string; user_id: string; client_id: string | null; type: string; title: string; body: string; href: string | null; read_at: string | null; created_at: string };
        Insert: { id?: string; user_id: string; client_id?: string | null; type: string; title: string; body?: string; href?: string | null; read_at?: string | null; created_at?: string };
        Update: { id?: string; user_id?: string; client_id?: string | null; type?: string; title?: string; body?: string; href?: string | null; read_at?: string | null; created_at?: string };
        Relationships: NoRelationships;
      };
      golden_questions: {
        Row: { id: string; client_id: string; question: string; last_status: string | null; last_checked_at: string | null; history: { s: string; at: string }[]; created_by: string | null; created_at: string };
        Insert: { id?: string; client_id: string; question: string; last_status?: string | null; last_checked_at?: string | null; history?: { s: string; at: string }[]; created_by?: string | null; created_at?: string };
        Update: { id?: string; client_id?: string; question?: string; last_status?: string | null; last_checked_at?: string | null; history?: { s: string; at: string }[]; created_by?: string | null; created_at?: string };
        Relationships: NoRelationships;
      };
      tool_runs: {
        Row: { id: string; client_id: string; user_id: string | null; tool: string; input_summary: string | null; tokens_used: number; output: Record<string, unknown> | null; created_at: string };
        Insert: { id?: string; client_id: string; user_id?: string | null; tool: string; input_summary?: string | null; tokens_used?: number; output?: Record<string, unknown> | null; created_at?: string };
        Update: { id?: string; client_id?: string; user_id?: string | null; tool?: string; input_summary?: string | null; tokens_used?: number; output?: Record<string, unknown> | null; created_at?: string };
        Relationships: NoRelationships;
      };
      vault_analyses: {
        Row: { id: string; client_id: string; content: string; model: string | null; source_url: string | null; tokens_used: number; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; content: string; model?: string | null; source_url?: string | null; tokens_used?: number; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; content?: string; model?: string | null; source_url?: string | null; tokens_used?: number; created_by?: string | null; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_contact_status_counts: {
        Args: { p_client_id: string };
        Returns: { status: string; count: number }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
