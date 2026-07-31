import type { ContentHardRule } from "@/supabase/functions/_shared/content-style";
import type { StyleAnalysisProfile } from "@/lib/content/style-analysis";

export type UserRole = "super_admin" | "client_admin" | "va";
export type DailyLogMood = "great" | "good" | "neutral" | "difficult" | "overwhelmed";
export type VaultSourceType = "pdf" | "docx" | "text" | "url";
export type VaultStatus = "pending" | "processing" | "ready" | "error";
export type VaultAuthorityLevel = "authoritative" | "supporting";
export type VaultKnowledgeStatus = "active" | "review_required" | "superseded";
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
  company_description: string | null;
  founders: string | null;
  location: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  values: string | null;
  services: string | null;
  target_demographic: string | null;
  client_type: string | null;
  brand_voice: string | null;
  sign_off: string | null;
  // Brain profile fields (migration 068) — feed every AI surface.
  business_goals: string | null;
  marketing_goals: string | null;
  team: string | null;
  tools_used: string | null;
  website_content: string | null;
  content_style: string | null;
  internal_rules: string | null;
  preferred_terms: string | null;
  prohibited_terms: string | null;
  emoji_policy: string | null;
  humour_policy: string | null;
  spelling_locale: string | null;
  default_cta_style: string | null;
  approved_claims: string | null;
  prohibited_claims: string | null;
  channel_styles: Record<string, string>;
  social_links: Record<string, string>;
  hard_rules: ContentHardRule[];
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
  origin_key?: string | null;
  evidence_role?: "factual" | "style_example" | "market_context";
  authority_level: VaultAuthorityLevel;
  knowledge_status: VaultKnowledgeStatus;
  time_sensitive: boolean;
  valid_from: string | null;
  valid_until: string | null;
  review_due_at: string | null;
  supersedes_item_id: string | null;
  has_conflict: boolean;
  conflict_note: string | null;
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

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
      brain_context_snapshots: {
        Row: {
          id: string;
          client_id: string;
          version: "brain-context-v1";
          resolver_version: "resolver-v1" | "resolver-v2-task-memory" | "resolver-v3-business-library" | "resolver-v4-library-availability" | "resolver-v5-role-aware-coach";
          surface: "ask" | "content" | "compose" | "tool" | "diagnostic" | "onboard";
          channel: string | null;
          artifact_kind: string | null;
          artifact_id: string | null;
          request: Json;
          snapshot: Json;
          snapshot_hash: string;
          model: string | null;
          prompt_version: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          version: "brain-context-v1";
          resolver_version: "resolver-v1" | "resolver-v2-task-memory" | "resolver-v3-business-library" | "resolver-v4-library-availability" | "resolver-v5-role-aware-coach";
          surface: "ask" | "content" | "compose" | "tool" | "diagnostic" | "onboard";
          channel?: string | null;
          artifact_kind?: string | null;
          artifact_id?: string | null;
          request: Json;
          snapshot: Json;
          model?: string | null;
          prompt_version?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: NoRelationships;
      };
      brain_diagnostic_runs: {
        Row: {
          id: string;
          client_id: string;
          status: "running" | "completed" | "failed";
          trigger_kind: "scheduled" | "manual";
          brain_context_snapshot_id: string | null;
          summary: Json;
          opportunities_created: number;
          error_code: string | null;
          error_message: string | null;
          recoverable: boolean;
          created_by: string | null;
          started_at: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          status?: "running" | "completed" | "failed";
          trigger_kind: "scheduled" | "manual";
          brain_context_snapshot_id?: string | null;
          summary?: Json;
          opportunities_created?: number;
          error_code?: string | null;
          error_message?: string | null;
          recoverable?: boolean;
          created_by?: string | null;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["brain_diagnostic_runs"]["Insert"]>;
        Relationships: NoRelationships;
      };
      brain_opportunities: {
        Row: {
          id: string;
          client_id: string;
          diagnostic_run_id: string;
          brain_context_snapshot_id: string;
          fingerprint: string;
          kind: "knowledge_gap" | "voice" | "personalisation" | "reliability" | "market" | "growth";
          title: string;
          summary: string;
          rationale: string;
          recommended_action: string;
          impact: "low" | "medium" | "high";
          effort: "low" | "medium" | "high";
          priority_score: number;
          source_layers: string[];
          company_provenance: Json;
          library_provenance: Json;
          status: "suggested" | "approved" | "dismissed" | "in_progress" | "completed";
          approved_by: string | null;
          approved_at: string | null;
          dismissed_by: string | null;
          dismissed_at: string | null;
          started_at: string | null;
          completed_by: string | null;
          completed_at: string | null;
          outcome: Json;
          effectiveness_status: "unmeasured" | "measuring" | "effective" | "mixed" | "ineffective";
          measured_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          diagnostic_run_id: string;
          brain_context_snapshot_id: string;
          fingerprint: string;
          kind: Database["public"]["Tables"]["brain_opportunities"]["Row"]["kind"];
          title: string;
          summary: string;
          rationale: string;
          recommended_action: string;
          impact: "low" | "medium" | "high";
          effort: "low" | "medium" | "high";
          priority_score: number;
          source_layers?: string[];
          company_provenance?: Json;
          library_provenance?: Json;
          status?: Database["public"]["Tables"]["brain_opportunities"]["Row"]["status"];
          outcome?: Json;
          effectiveness_status?: Database["public"]["Tables"]["brain_opportunities"]["Row"]["effectiveness_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: never;
        Relationships: NoRelationships;
      };
      brain_opportunity_events: {
        Row: {
          id: string;
          opportunity_id: string;
          client_id: string;
          event_kind: "suggested" | "approved" | "dismissed" | "started" | "completed" | "reopened" | "measured";
          from_status: string | null;
          to_status: string | null;
          metadata: Json;
          actor_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          opportunity_id: string;
          client_id: string;
          event_kind: Database["public"]["Tables"]["brain_opportunity_events"]["Row"]["event_kind"];
          from_status?: string | null;
          to_status?: string | null;
          metadata?: Json;
          actor_id?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: NoRelationships;
      };
      brain_knowledge_gaps: {
        Row: {
          id: string;
          client_id: string;
          normalized_topic: string;
          example_questions: string[];
          occurrence_count: number;
          affected_surfaces: Array<"ask" | "content" | "compose" | "tool">;
          importance: "low" | "normal" | "high" | "critical";
          status: "open" | "in_review" | "resolved" | "dismissed";
          owner_id: string | null;
          recommended_source: string | null;
          resolved_by_vault_item_id: string | null;
          created_at: string;
          updated_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          client_id: string;
          normalized_topic: string;
          example_questions: string[];
          occurrence_count?: number;
          affected_surfaces?: Array<"ask" | "content" | "compose" | "tool">;
          importance?: "low" | "normal" | "high" | "critical";
          status?: "open" | "in_review" | "resolved" | "dismissed";
          owner_id?: string | null;
          recommended_source?: string | null;
          resolved_by_vault_item_id?: string | null;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["brain_knowledge_gaps"]["Insert"]>;
        Relationships: NoRelationships;
      };
      brain_evaluation_cases: {
        Row: {
          id: string;
          client_id: string;
          version: 1;
          name: string;
          case_type: "ask" | "content_idea" | "content_draft" | "tool";
          channel: string | null;
          input: Json;
          expected: Json;
          baseline_output: string;
          baseline_context_snapshot_id: string | null;
          baseline_model: string | null;
          baseline_prompt_version: string | null;
          baseline_captured_at: string | null;
          tags: string[];
          active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          version?: 1;
          name: string;
          case_type: "ask" | "content_idea" | "content_draft" | "tool";
          channel?: string | null;
          input: Json;
          expected?: Json;
          baseline_output?: string;
          baseline_context_snapshot_id?: string | null;
          baseline_model?: string | null;
          baseline_prompt_version?: string | null;
          baseline_captured_at?: string | null;
          tags?: string[];
          active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          name?: string;
          channel?: string | null;
          input?: Json;
          expected?: Json;
          baseline_output?: string;
          baseline_context_snapshot_id?: string | null;
          baseline_model?: string | null;
          baseline_prompt_version?: string | null;
          baseline_captured_at?: string | null;
          tags?: string[];
          active?: boolean;
          updated_at?: string;
        };
        Relationships: NoRelationships;
      };
      brain_context_feature_flags: {
        Row: {
          client_id: string;
          ask_enabled: boolean;
          content_enabled: boolean;
          topics_enabled: boolean;
          tools_enabled: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          client_id: string;
          ask_enabled?: boolean;
          content_enabled?: boolean;
          topics_enabled?: boolean;
          tools_enabled?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: {
          ask_enabled?: boolean;
          content_enabled?: boolean;
          topics_enabled?: boolean;
          tools_enabled?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Relationships: NoRelationships;
      };
      company_dna: {
        Row: { id: string; client_id: string; company_name: string | null; company_description: string | null; founders: string | null; location: string | null; address: string | null; phone: string | null; email: string | null; website: string | null; values: string | null; services: string | null; target_demographic: string | null; client_type: string | null; brand_voice: string | null; sign_off: string | null; business_goals: string | null; marketing_goals: string | null; team: string | null; tools_used: string | null; website_content: string | null; content_style: string | null; internal_rules: string | null; preferred_terms: string | null; prohibited_terms: string | null; emoji_policy: string | null; humour_policy: string | null; spelling_locale: string | null; default_cta_style: string | null; approved_claims: string | null; prohibited_claims: string | null; channel_styles: Record<string, string>; social_links: Record<string, string>; hard_rules: ContentHardRule[]; extra: Record<string, unknown>; updated_at: string };
        Insert: { id?: string; client_id: string; company_name?: string | null; company_description?: string | null; founders?: string | null; location?: string | null; address?: string | null; phone?: string | null; email?: string | null; website?: string | null; values?: string | null; services?: string | null; target_demographic?: string | null; client_type?: string | null; brand_voice?: string | null; sign_off?: string | null; business_goals?: string | null; marketing_goals?: string | null; team?: string | null; tools_used?: string | null; website_content?: string | null; content_style?: string | null; internal_rules?: string | null; preferred_terms?: string | null; prohibited_terms?: string | null; emoji_policy?: string | null; humour_policy?: string | null; spelling_locale?: string | null; default_cta_style?: string | null; approved_claims?: string | null; prohibited_claims?: string | null; channel_styles?: Record<string, string>; social_links?: Record<string, string>; hard_rules?: ContentHardRule[]; extra?: Record<string, unknown>; updated_at?: string };
        Update: { id?: string; client_id?: string; company_name?: string | null; company_description?: string | null; founders?: string | null; location?: string | null; address?: string | null; phone?: string | null; email?: string | null; website?: string | null; values?: string | null; services?: string | null; target_demographic?: string | null; client_type?: string | null; brand_voice?: string | null; sign_off?: string | null; business_goals?: string | null; marketing_goals?: string | null; team?: string | null; tools_used?: string | null; website_content?: string | null; content_style?: string | null; internal_rules?: string | null; preferred_terms?: string | null; prohibited_terms?: string | null; emoji_policy?: string | null; humour_policy?: string | null; spelling_locale?: string | null; default_cta_style?: string | null; approved_claims?: string | null; prohibited_claims?: string | null; channel_styles?: Record<string, string>; social_links?: Record<string, string>; hard_rules?: ContentHardRule[]; extra?: Record<string, unknown>; updated_at?: string };
        Relationships: NoRelationships;
      };
      vault_items: {
        Row: { id: string; client_id: string; source_type: string; title: string; source_url: string | null; storage_path: string | null; raw_content: string | null; status: string; error_message: string | null; created_at: string; created_by: string | null; category: string | null; tags: string[]; ai_summary: string | null; updated_at: string | null; updated_by: string | null; content_hash: string | null; meta_curated: boolean; indexed_at: string | null; index_error: string | null; origin_key: string | null; evidence_role: "factual" | "style_example" | "market_context"; authority_level: VaultAuthorityLevel; knowledge_status: VaultKnowledgeStatus; time_sensitive: boolean; valid_from: string | null; valid_until: string | null; review_due_at: string | null; supersedes_item_id: string | null; has_conflict: boolean; conflict_note: string | null };
        Insert: { id?: string; client_id: string; source_type: string; title: string; source_url?: string | null; storage_path?: string | null; raw_content?: string | null; status?: string; error_message?: string | null; created_at?: string; created_by?: string | null; category?: string | null; tags?: string[]; ai_summary?: string | null; updated_at?: string | null; updated_by?: string | null; content_hash?: string | null; meta_curated?: boolean; indexed_at?: string | null; index_error?: string | null; origin_key?: string | null; evidence_role?: "factual" | "style_example" | "market_context"; authority_level?: VaultAuthorityLevel; knowledge_status?: VaultKnowledgeStatus; time_sensitive?: boolean; valid_from?: string | null; valid_until?: string | null; review_due_at?: string | null; supersedes_item_id?: string | null; has_conflict?: boolean; conflict_note?: string | null };
        Update: { id?: string; client_id?: string; source_type?: string; title?: string; source_url?: string | null; storage_path?: string | null; raw_content?: string | null; status?: string; error_message?: string | null; created_at?: string; created_by?: string | null; category?: string | null; tags?: string[]; ai_summary?: string | null; updated_at?: string | null; updated_by?: string | null; content_hash?: string | null; meta_curated?: boolean; indexed_at?: string | null; index_error?: string | null; origin_key?: string | null; evidence_role?: "factual" | "style_example" | "market_context"; authority_level?: VaultAuthorityLevel; knowledge_status?: VaultKnowledgeStatus; time_sensitive?: boolean; valid_from?: string | null; valid_until?: string | null; review_due_at?: string | null; supersedes_item_id?: string | null; has_conflict?: boolean; conflict_note?: string | null };
        Relationships: NoRelationships;
      };
      vault_item_versions: {
        Row: { id: string; item_id: string; client_id: string; version_number: number; title: string; source_url: string | null; raw_content: string | null; content_hash: string | null; authority_level: VaultAuthorityLevel; knowledge_status: VaultKnowledgeStatus; time_sensitive: boolean; valid_from: string | null; valid_until: string | null; review_due_at: string | null; supersedes_item_id: string | null; has_conflict: boolean; conflict_note: string | null; captured_by: string | null; captured_at: string };
        Insert: { id?: string; item_id: string; client_id: string; version_number: number; title: string; source_url?: string | null; raw_content?: string | null; content_hash?: string | null; authority_level: VaultAuthorityLevel; knowledge_status: VaultKnowledgeStatus; time_sensitive?: boolean; valid_from?: string | null; valid_until?: string | null; review_due_at?: string | null; supersedes_item_id?: string | null; has_conflict?: boolean; conflict_note?: string | null; captured_by?: string | null; captured_at?: string };
        Update: never;
        Relationships: NoRelationships;
      };
      cron_heartbeats: {
        Row: { name: string; ran_at: string; detail: Json };
        Insert: { name: string; ran_at?: string; detail?: Json };
        Update: { name?: string; ran_at?: string; detail?: Json };
        Relationships: NoRelationships;
      };
      leads: {
        Row: { id: string; name: string; company: string | null; contact_name: string | null; email: string | null; phone: string | null; source: string | null; stage: string; value: number | null; owner_id: string | null; next_action: string | null; next_action_date: string | null; notes: string | null; sort_order: number; created_by: string | null; created_at: string; updated_at: string; archived_at: string | null };
        Insert: { id?: string; name: string; company?: string | null; contact_name?: string | null; email?: string | null; phone?: string | null; source?: string | null; stage?: string; value?: number | null; owner_id?: string | null; next_action?: string | null; next_action_date?: string | null; notes?: string | null; sort_order?: number; created_by?: string | null; created_at?: string; updated_at?: string; archived_at?: string | null };
        Update: { id?: string; name?: string; company?: string | null; contact_name?: string | null; email?: string | null; phone?: string | null; source?: string | null; stage?: string; value?: number | null; owner_id?: string | null; next_action?: string | null; next_action_date?: string | null; notes?: string | null; sort_order?: number; created_by?: string | null; created_at?: string; updated_at?: string; archived_at?: string | null };
        Relationships: NoRelationships;
      };
      lead_events: {
        Row: { id: string; lead_id: string; user_id: string | null; kind: string; body: string; created_at: string };
        Insert: { id?: string; lead_id: string; user_id?: string | null; kind?: string; body: string; created_at?: string };
        Update: { id?: string; lead_id?: string; user_id?: string | null; kind?: string; body?: string; created_at?: string };
        Relationships: NoRelationships;
      };
      expenses: {
        Row: { id: string; name: string; vendor: string | null; category: string; amount: number; currency: string; cadence: string; status: string; next_due_date: string | null; url: string | null; started_on: string | null; owner_id: string | null; notes: string | null; created_by: string | null; created_at: string; updated_at: string; archived_at: string | null };
        Insert: { id?: string; name: string; vendor?: string | null; category?: string; amount?: number; currency?: string; cadence?: string; status?: string; next_due_date?: string | null; url?: string | null; started_on?: string | null; owner_id?: string | null; notes?: string | null; created_by?: string | null; created_at?: string; updated_at?: string; archived_at?: string | null };
        Update: { id?: string; name?: string; vendor?: string | null; category?: string; amount?: number; currency?: string; cadence?: string; status?: string; next_due_date?: string | null; url?: string | null; started_on?: string | null; owner_id?: string | null; notes?: string | null; created_by?: string | null; created_at?: string; updated_at?: string; archived_at?: string | null };
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
      feature_videos: {
        Row: { slug: string; loom_url: string; updated_by: string | null; updated_at: string };
        Insert: { slug: string; loom_url: string; updated_by?: string | null; updated_at?: string };
        Update: { slug?: string; loom_url?: string; updated_by?: string | null; updated_at?: string };
        Relationships: NoRelationships;
      };
      guides: {
        Row: { key: string; data: Json; updated_by: string | null; updated_at: string };
        Insert: { key: string; data: Json; updated_by?: string | null; updated_at?: string };
        Update: { key?: string; data?: Json; updated_by?: string | null; updated_at?: string };
        Relationships: NoRelationships;
      };
      va_job_contracts: {
        Row: { user_id: string; client_id: string | null; rate: number | null; currency: string; pay_period: string; payment_method: string | null; payment_schedule: string | null; start_date: string | null; weekly_hours: number | null; notice_period: string | null; next_review_date: string | null; annual_leave_days: number | null; contract_path: string | null; contract_name: string | null; updated_by: string | null; updated_at: string };
        Insert: { user_id: string; client_id?: string | null; rate?: number | null; currency?: string; pay_period?: string; payment_method?: string | null; payment_schedule?: string | null; start_date?: string | null; weekly_hours?: number | null; notice_period?: string | null; next_review_date?: string | null; annual_leave_days?: number | null; contract_path?: string | null; contract_name?: string | null; updated_by?: string | null; updated_at?: string };
        Update: { user_id?: string; client_id?: string | null; rate?: number | null; currency?: string; pay_period?: string; payment_method?: string | null; payment_schedule?: string | null; start_date?: string | null; weekly_hours?: number | null; notice_period?: string | null; next_review_date?: string | null; annual_leave_days?: number | null; contract_path?: string | null; contract_name?: string | null; updated_by?: string | null; updated_at?: string };
        Relationships: NoRelationships;
      };
      va_days_worked: {
        Row: { id: string; user_id: string; client_id: string | null; work_date: string; hours: number | null; note: string | null; created_at: string };
        Insert: { id?: string; user_id: string; client_id?: string | null; work_date: string; hours?: number | null; note?: string | null; created_at?: string };
        Update: { id?: string; user_id?: string; client_id?: string | null; work_date?: string; hours?: number | null; note?: string | null; created_at?: string };
        Relationships: NoRelationships;
      };
      va_leave_requests: {
        Row: { id: string; user_id: string; client_id: string | null; start_date: string; end_date: string; leave_type: string; reason: string | null; status: string; reviewed_by: string | null; reviewed_at: string | null; created_at: string };
        Insert: { id?: string; user_id: string; client_id?: string | null; start_date: string; end_date: string; leave_type?: string; reason?: string | null; status?: string; reviewed_by?: string | null; reviewed_at?: string | null; created_at?: string };
        Update: { id?: string; user_id?: string; client_id?: string | null; start_date?: string; end_date?: string; leave_type?: string; reason?: string | null; status?: string; reviewed_by?: string | null; reviewed_at?: string | null; created_at?: string };
        Relationships: NoRelationships;
      };
      va_issues: {
        Row: { id: string; user_id: string; client_id: string | null; category: string; subject: string; detail: string; status: string; created_at: string };
        Insert: { id?: string; user_id: string; client_id?: string | null; category?: string; subject: string; detail: string; status?: string; created_at?: string };
        Update: { id?: string; user_id?: string; client_id?: string | null; category?: string; subject?: string; detail?: string; status?: string; created_at?: string };
        Relationships: NoRelationships;
      };
      va_self_reports: {
        Row: { id: string; user_id: string; client_id: string | null; report_month: string; delivered: string | null; challenges: string | null; goals: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; user_id: string; client_id?: string | null; report_month: string; delivered?: string | null; challenges?: string | null; goals?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; user_id?: string; client_id?: string | null; report_month?: string; delivered?: string | null; challenges?: string | null; goals?: string | null; created_at?: string; updated_at?: string };
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
        Row: { id: string; client_id: string | null; title: string; category: string; subcategory: string | null; body: string; order_index: number; created_by: string | null; steps: { title: string; detail: string; tip?: string }[] | null; intro: string | null; prerequisites: string[] | null; visibility: string; version: number; forked_from: string | null; forked_version: number | null; deleted_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id?: string | null; title: string; category?: string; subcategory?: string | null; body?: string; order_index?: number; created_by?: string | null; steps?: { title: string; detail: string; tip?: string }[] | null; intro?: string | null; prerequisites?: string[] | null; visibility?: string; version?: number; forked_from?: string | null; forked_version?: number | null; deleted_at?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string | null; title?: string; category?: string; subcategory?: string | null; body?: string; order_index?: number; created_by?: string | null; steps?: { title: string; detail: string; tip?: string }[] | null; intro?: string | null; prerequisites?: string[] | null; visibility?: string; version?: number; forked_from?: string | null; forked_version?: number | null; deleted_at?: string | null; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      content_pieces: {
        Row: { id: string; client_id: string; project_id: string | null; content_type: string; title: string; brief: string | null; body: string | null; status: string; style_snapshot: Json; content_brief: Json; source_references: Json; parent_piece_id: string | null; generation_kind: string; revision_reason: string | null; brain_context_snapshot_id: string | null; ai_original: string | null; outcome: string | null; outcome_at: string | null; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; project_id?: string | null; content_type: string; title: string; brief?: string | null; body?: string | null; status?: string; style_snapshot?: Json; content_brief?: Json; source_references?: Json; parent_piece_id?: string | null; generation_kind?: string; revision_reason?: string | null; brain_context_snapshot_id?: string | null; ai_original?: string | null; outcome?: string | null; outcome_at?: string | null; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; project_id?: string | null; content_type?: string; title?: string; brief?: string | null; body?: string | null; status?: string; style_snapshot?: Json; content_brief?: Json; source_references?: Json; parent_piece_id?: string | null; generation_kind?: string; revision_reason?: string | null; brain_context_snapshot_id?: string | null; ai_original?: string | null; outcome?: string | null; outcome_at?: string | null; created_by?: string | null; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      content_projects: {
        Row: { id: string; client_id: string; title: string; status: string; current_step: string; idea_snapshot: Json; content_brief: Json; vault_source_ids: string[]; vault_source_references: Json; competitor_signals: Json; style_snapshot: Json; current_piece_id: string | null; brain_context_snapshot_id: string | null; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; title: string; status?: string; current_step?: string; idea_snapshot?: Json; content_brief?: Json; vault_source_ids?: string[]; vault_source_references?: Json; competitor_signals?: Json; style_snapshot?: Json; current_piece_id?: string | null; brain_context_snapshot_id?: string | null; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; title?: string; status?: string; current_step?: string; idea_snapshot?: Json; content_brief?: Json; vault_source_ids?: string[]; vault_source_references?: Json; competitor_signals?: Json; style_snapshot?: Json; current_piece_id?: string | null; brain_context_snapshot_id?: string | null; created_by?: string | null; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      content_piece_revisions: {
        Row: { id: string; piece_id: string; client_id: string; revision_number: number; title: string; body: string | null; content_type: string; content_brief: Json; style_snapshot: Json; source_references: Json; reason: string; created_by: string | null; created_at: string };
        Insert: { id?: string; piece_id: string; client_id: string; revision_number: number; title: string; body?: string | null; content_type: string; content_brief?: Json; style_snapshot?: Json; source_references?: Json; reason?: string; created_by?: string | null; created_at?: string };
        Update: { id?: string; piece_id?: string; client_id?: string; revision_number?: number; title?: string; body?: string | null; content_type?: string; content_brief?: Json; style_snapshot?: Json; source_references?: Json; reason?: string; created_by?: string | null; created_at?: string };
        Relationships: NoRelationships;
      };
      content_editorial_events: {
        Row: { id: string; client_id: string; project_id: string | null; piece_id: string; event_type: "generated" | "manual_revision" | "ai_rewrite" | "submitted" | "approved"; edit_origin: "generation" | "manual" | "ai_rewrite" | "workflow"; before_title: string | null; after_title: string | null; before_body: string | null; after_body: string | null; analysis: Json; created_by: string | null; created_at: string };
        Insert: { id?: string; client_id: string; project_id?: string | null; piece_id: string; event_type: "generated" | "manual_revision" | "ai_rewrite" | "submitted" | "approved"; edit_origin: "generation" | "manual" | "ai_rewrite" | "workflow"; before_title?: string | null; after_title?: string | null; before_body?: string | null; after_body?: string | null; analysis?: Json; created_by?: string | null; created_at?: string };
        Update: { analysis?: Json; created_by?: string | null };
        Relationships: NoRelationships;
      };
      editorial_learning_suggestions: {
        Row: { id: string; client_id: string; project_id: string | null; piece_id: string; event_id: string; classification: string; proposed_outcome: string; dimensions: string[]; summary: string; lesson_content: string; explanation: string; before_excerpt: string; after_excerpt: string; proposed_scope: Json; confidence: number; status: string; signal_id: string | null; memory_id: string | null; created_by: string | null; reviewed_by: string | null; reviewed_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; project_id?: string | null; piece_id: string; event_id: string; classification: string; proposed_outcome: string; dimensions?: string[]; summary: string; lesson_content: string; explanation: string; before_excerpt?: string; after_excerpt?: string; proposed_scope?: Json; confidence?: number; status?: string; signal_id?: string | null; memory_id?: string | null; created_by?: string | null; reviewed_by?: string | null; reviewed_at?: string | null; created_at?: string; updated_at?: string };
        Update: { proposed_scope?: Json; status?: string; signal_id?: string | null; memory_id?: string | null; reviewed_by?: string | null; reviewed_at?: string | null; updated_at?: string };
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
        Row: { id: string; client_id: string; assigned_to: string | null; created_by: string | null; title: string; description: string; status: string; order_index: number; due_date: string | null; priority: number; completed_at: string | null; category_id: string | null; archived_at: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; assigned_to?: string | null; created_by?: string | null; title: string; description?: string; status?: string; order_index?: number; due_date?: string | null; priority?: number; completed_at?: string | null; category_id?: string | null; archived_at?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; assigned_to?: string | null; created_by?: string | null; title?: string; description?: string; status?: string; order_index?: number; due_date?: string | null; priority?: number; completed_at?: string | null; category_id?: string | null; archived_at?: string | null; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      task_recurrences: {
        Row: { id: string; client_id: string; created_by: string | null; assigned_to: string | null; category_id: string | null; title: string; description: string; priority: number; frequency: string; interval: number; next_run_on: string; last_spawned_at: string | null; active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; created_by?: string | null; assigned_to?: string | null; category_id?: string | null; title: string; description?: string; priority?: number; frequency: string; interval?: number; next_run_on: string; last_spawned_at?: string | null; active?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; created_by?: string | null; assigned_to?: string | null; category_id?: string | null; title?: string; description?: string; priority?: number; frequency?: string; interval?: number; next_run_on?: string; last_spawned_at?: string | null; active?: boolean; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      task_categories: {
        Row: { id: string; client_id: string; name: string; color: string; order_index: number; created_at: string };
        Insert: { id?: string; client_id: string; name: string; color?: string; order_index?: number; created_at?: string };
        Update: { id?: string; client_id?: string; name?: string; color?: string; order_index?: number; created_at?: string };
        Relationships: NoRelationships;
      };
      placements: {
        Row: { id: string; client_id: string; va_user_id: string; client_user_id: string; status: string; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; va_user_id: string; client_user_id: string; status?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; va_user_id?: string; client_user_id?: string; status?: string; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      notebook_pages: {
        Row: { id: string; placement_id: string; parent_page_id: string | null; title: string; content: Json; sort_order: number; created_by: string | null; last_edited_by: string | null; is_archived: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; placement_id: string; parent_page_id?: string | null; title?: string; content?: Json; sort_order?: number; created_by?: string | null; last_edited_by?: string | null; is_archived?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; placement_id?: string; parent_page_id?: string | null; title?: string; content?: Json; sort_order?: number; created_by?: string | null; last_edited_by?: string | null; is_archived?: boolean; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      notebook_page_revisions: {
        Row: { id: string; page_id: string; content: Json; title: string; edited_by: string | null; created_at: string };
        Insert: { id?: string; page_id: string; content: Json; title: string; edited_by?: string | null; created_at?: string };
        Update: { id?: string; page_id?: string; content?: Json; title?: string; edited_by?: string | null; created_at?: string };
        Relationships: NoRelationships;
      };
      notebook_activity: {
        Row: { id: string; placement_id: string; event: string; actor_role: string; created_at: string };
        Insert: { id?: string; placement_id: string; event: string; actor_role: string; created_at?: string };
        Update: { id?: string; placement_id?: string; event?: string; actor_role?: string; created_at?: string };
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
        Row: { id: string; client_id: string; created_by: string | null; url: string; status: string; error: string | null; firecrawl_id: string | null; page_cap: number; pages_total: number; pages_done: number; items_created: number; products_seen: number; pages_dropped: number; tokens_used: number; dossier_item_id: string | null; meta: Record<string, unknown>; lease_token: string | null; lease_until: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; created_by?: string | null; url: string; status?: string; error?: string | null; firecrawl_id?: string | null; page_cap?: number; pages_total?: number; pages_done?: number; items_created?: number; products_seen?: number; pages_dropped?: number; tokens_used?: number; dossier_item_id?: string | null; meta?: Record<string, unknown>; lease_token?: string | null; lease_until?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; created_by?: string | null; url?: string; status?: string; error?: string | null; firecrawl_id?: string | null; page_cap?: number; pages_total?: number; pages_done?: number; items_created?: number; products_seen?: number; pages_dropped?: number; tokens_used?: number; dossier_item_id?: string | null; meta?: Record<string, unknown>; lease_token?: string | null; lease_until?: string | null; created_at?: string; updated_at?: string };
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
        Row: { id: string; client_id: string; user_id: string | null; tool: string; input_summary: string | null; tokens_used: number; output: Record<string, unknown> | null; brain_context_snapshot_id: string | null; created_at: string };
        Insert: { id?: string; client_id: string; user_id?: string | null; tool: string; input_summary?: string | null; tokens_used?: number; output?: Record<string, unknown> | null; brain_context_snapshot_id?: string | null; created_at?: string };
        Update: { id?: string; client_id?: string; user_id?: string | null; tool?: string; input_summary?: string | null; tokens_used?: number; output?: Record<string, unknown> | null; brain_context_snapshot_id?: string | null; created_at?: string };
        Relationships: NoRelationships;
      };
      vault_analyses: {
        Row: { id: string; client_id: string; content: string; model: string | null; source_url: string | null; tokens_used: number; created_by: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; client_id: string; content: string; model?: string | null; source_url?: string | null; tokens_used?: number; created_by?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; client_id?: string; content?: string; model?: string | null; source_url?: string | null; tokens_used?: number; created_by?: string | null; created_at?: string; updated_at?: string };
        Relationships: NoRelationships;
      };
      content_style_analyses: {
        Row: {
          id: string;
          client_id: string;
          channel: string;
          status: string;
          version: number;
          analysis: StyleAnalysisProfile;
          source_item_ids: string[];
          source_count: number;
          source_character_count: number;
          model: string | null;
          analysed_at: string | null;
          approved_at: string | null;
          approved_by: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          channel: string;
          status?: string;
          version?: number;
          analysis?: StyleAnalysisProfile;
          source_item_ids?: string[];
          source_count?: number;
          source_character_count?: number;
          model?: string | null;
          analysed_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          client_id?: string;
          channel?: string;
          status?: string;
          version?: number;
          analysis?: StyleAnalysisProfile;
          source_item_ids?: string[];
          source_count?: number;
          source_character_count?: number;
          model?: string | null;
          analysed_at?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: NoRelationships;
      };
      business_library_categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          slug?: string;
          name?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: NoRelationships;
      };
      business_library_entries: {
        Row: {
          id: string;
          slug: string;
          current_version_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          retired_at: string | null;
        };
        Insert: {
          id?: string;
          slug: string;
          current_version_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          retired_at?: string | null;
        };
        Update: {
          slug?: string;
          current_version_id?: string | null;
          updated_at?: string;
          retired_at?: string | null;
        };
        Relationships: NoRelationships;
      };
      business_library_versions: {
        Row: {
          id: string;
          entry_id: string;
          version_number: number;
          status: "draft" | "in_review" | "published" | "superseded" | "retired";
          category_id: string;
          title: string;
          summary: string;
          body: string;
          source_url: string | null;
          tags: string[];
          industries: string[];
          countries: string[];
          audiences: string[];
          lifecycle_stages: string[];
          channels: string[];
          time_sensitive: boolean;
          valid_from: string | null;
          valid_until: string | null;
          review_due_at: string | null;
          change_note: string | null;
          content_hash: string;
          created_by: string | null;
          submitted_at: string | null;
          approved_by: string | null;
          approved_at: string | null;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          version_number: number;
          status?: "draft" | "in_review" | "published" | "superseded" | "retired";
          category_id: string;
          title: string;
          summary: string;
          body: string;
          source_url?: string | null;
          tags?: string[];
          industries?: string[];
          countries?: string[];
          audiences?: string[];
          lifecycle_stages?: string[];
          channels?: string[];
          time_sensitive?: boolean;
          valid_from?: string | null;
          valid_until?: string | null;
          review_due_at?: string | null;
          change_note?: string | null;
          content_hash?: string;
          created_by?: string | null;
          submitted_at?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          status?: "draft" | "in_review" | "published" | "superseded" | "retired";
          category_id?: string;
          title?: string;
          summary?: string;
          body?: string;
          source_url?: string | null;
          tags?: string[];
          industries?: string[];
          countries?: string[];
          audiences?: string[];
          lifecycle_stages?: string[];
          channels?: string[];
          time_sensitive?: boolean;
          valid_from?: string | null;
          valid_until?: string | null;
          review_due_at?: string | null;
          change_note?: string | null;
          submitted_at?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          published_at?: string | null;
          updated_at?: string;
        };
        Relationships: NoRelationships;
      };
      business_library_chunks: {
        Row: {
          id: string;
          entry_id: string;
          version_id: string;
          chunk_index: number;
          content: string;
          search_vector: unknown;
          embedding: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          version_id: string;
          chunk_index: number;
          content: string;
          embedding?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: NoRelationships;
      };
      business_library_events: {
        Row: {
          id: string;
          entry_id: string;
          version_id: string | null;
          action: string;
          actor_id: string | null;
          detail: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          entry_id: string;
          version_id?: string | null;
          action: string;
          actor_id?: string | null;
          detail?: Json;
          created_at?: string;
        };
        Update: never;
        Relationships: NoRelationships;
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_contact_status_counts: {
        Args: { p_client_id: string };
        Returns: { status: string; count: number }[];
      };
      health_schema_check: {
        Args: Record<string, never>;
        Returns: Json;
      };
      admin_client_overview: {
        Args: Record<string, never>;
        Returns: {
          client_id: string; client_name: string; client_created_at: string;
          user_count: number; va_count: number; vault_total: number; vault_ready: number; vault_error: number;
          has_dossier: boolean; open_tasks: number; done_recently: number; vas_logged: number; last_activity: string | null;
        }[];
      };
      claim_crawl_job: {
        Args: { p_job_id: string; p_lease_seconds?: number };
        Returns: Database["public"]["Tables"]["crawl_jobs"]["Row"][];
      };
      claim_brain_signals: {
        Args: {
          p_client_id: string;
          p_limit?: number;
          p_min_signals?: number;
          p_lease_seconds?: number;
        };
        Returns: {
          id: string;
          client_id: string;
          user_id: string | null;
          surface: string;
          artifact_id: string | null;
          artifact_text: string;
          rating: number;
          reason: string | null;
          context: Json;
          dimensions: string[];
          channel: string | null;
          content_type: string | null;
          learning_intent: string;
          editorial_event_id: string | null;
          resolved: boolean;
          created_at: string;
          distilled_at: string | null;
          distill_claim_token: string | null;
          distill_claim_until: string | null;
        }[];
      };
      release_brain_signal_claim: {
        Args: { p_client_id: string; p_claim_token: string };
        Returns: number;
      };
      commit_brain_distillation: {
        Args: {
          p_client_id: string;
          p_claim_token: string;
          p_signal_ids: string[];
          p_operations: Json;
        };
        Returns: Json;
      };
      transition_brain_opportunity: {
        Args: {
          p_opportunity_id: string;
          p_client_id: string;
          p_action: "approve" | "dismiss" | "start" | "complete" | "reopen" | "measure";
          p_actor_id: string;
          p_outcome?: Json;
        };
        Returns: Database["public"]["Tables"]["brain_opportunities"]["Row"];
      };
      match_brain_memories: {
        Args: {
          p_client_id: string;
          p_query_embedding: string | number[] | null;
          p_surface: "ask" | "content" | "compose" | "tool" | "diagnostic" | "onboard";
          p_channel?: string | null;
          p_content_type?: string | null;
          p_limit?: number;
          p_audience?: string | null;
          p_objective?: string | null;
        };
        Returns: {
          id: string;
          kind: "preference" | "anti_pattern" | "rule";
          content: string;
          confidence: number;
          source_count: number;
          pinned: boolean;
          scope: Json;
          semantic_relevance: number;
          scope_specificity: number;
          rank_score: number;
          selection_reason: string;
        }[];
      };
      resolve_brain_memory_conflict: {
        Args: {
          p_client_id: string;
          p_memory_id: string;
          p_action: "keep_existing" | "replace_existing" | "merge" | "narrow" | "keep_both";
          p_actor_id: string;
          p_resolution?: Json;
        };
        Returns: Json;
      };
      decay_brain_memories: {
        Args: { p_client_id: string };
        Returns: number;
      };
      approve_editorial_learning_suggestion: {
        Args: {
          p_client_id: string;
          p_suggestion_id: string;
          p_actor_id: string;
          p_scope?: Json | null;
        };
        Returns: Database["public"]["Tables"]["editorial_learning_suggestions"]["Row"][];
      };
      approve_content_style_analysis: {
        Args: {
          p_client_id: string;
          p_analysis_id: string;
          p_actor_id: string;
        };
        Returns: Database["public"]["Tables"]["content_style_analyses"]["Row"];
      };
      match_business_library_chunks: {
        Args: {
          p_query: string;
          p_match_count?: number;
          p_channel?: string | null;
          p_audience?: string | null;
        };
        Returns: Array<{
          entry_id: string;
          version_id: string;
          chunk_id: string;
          version_number: number;
          title: string;
          summary: string;
          content: string;
          category: string;
          source_url: string | null;
          tags: string[];
          rank: number;
        }>;
      };
      transition_business_library_version: {
        Args: {
          p_entry_id: string;
          p_version_id: string | null;
          p_action: "submit_review" | "return_draft" | "publish" | "new_version" | "retire";
          p_actor_id: string;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
