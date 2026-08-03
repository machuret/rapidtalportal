/**
 * Database types — generated schema + curated row aliases.
 *
 * `Database` is derived from `types/schema.generated.ts` — the tracked output
 * of `pnpm gen:types` (`supabase gen types typescript`). Regenerate it after
 * migrations land and commit the diff; the typed Supabase clients in
 * `lib/supabase/` then know the real schema, so `(db as any)` casts for
 * missing tables/columns are unnecessary. (The old
 * `types/database.generated.ts` ignore-slot is kept for stale local copies;
 * `schema.generated.ts` is the canonical artifact.)
 *
 * Two curation layers sit on top of the generated schema:
 *
 * 1. **Compat overrides** (below, in `Database` itself): a handful of tables
 *    keep their hand-tuned Row/Insert/Update shapes because existing code was
 *    written against them — JSONB columns narrowed to the shapes the app
 *    validates (e.g. `sops.steps`, `company_dna.hard_rules`), trigger-filled
 *    columns optional on insert (`business_library_versions.content_hash`),
 *    and columns the app treats as non-null. `transition_business_library_version`
 *    keeps a nullable `p_version_id` (Postgres params accept NULL; the
 *    generator can't express that).
 * 2. **Curated aliases** (the `Db*` interfaces + string unions): app-level
 *    contracts for whole rows — e.g. `DbCompanyDna.hard_rules` is
 *    `ContentHardRule[]`, not `Json`.
 */
import type { ContentHardRule } from "@/supabase/functions/_shared/content-style";
import type { StyleAnalysisProfile } from "@/lib/content/style-analysis";
import type { Database as GeneratedSchema, Json } from "./schema.generated";

export type { Json } from "./schema.generated";

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

/** Per-field auto-fill provenance (migration 146): source + timestamp. */
export type DnaFieldProvenance = Record<string, { source: "scrape" | "vault_draft"; at: string }>;

// Object-literal type alias (not an interface) so it satisfies the
// `Record<string, unknown>` constraint in the Supabase client's generics.
export type DbCompanyDna = {
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
  field_provenance?: DnaFieldProvenance;
  extra: Record<string, unknown>;
  updated_at: string;
};

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

/* --------------------------------------------------------------------------
 * Compat overrides — see the header comment. Everything not listed here is
 * the generated schema verbatim.
 * ------------------------------------------------------------------------ */

type GeneratedPublic = GeneratedSchema["public"];
type GeneratedTables = GeneratedPublic["Tables"];
type GeneratedFunctions = GeneratedPublic["Functions"];

/** Keep a table's generated Insert/Update/Relationships, narrow only its Row. */
type RowAs<T extends keyof GeneratedTables, R> = {
  Row: R;
  Insert: GeneratedTables[T]["Insert"];
  Update: GeneratedTables[T]["Update"];
  Relationships: GeneratedTables[T]["Relationships"];
};

type CompanyDnaInsert = Omit<Partial<DbCompanyDna>, "client_id" | "field_provenance"> & {
  client_id: string;
  field_provenance?: Json;
};
type CompanyDnaUpdate = Partial<DbCompanyDna>;

type SopSteps = { title: string; detail: string; tip?: string }[];
type SopRow = Omit<GeneratedTables["sops"]["Row"], "category" | "steps"> & {
  category: string;
  steps: SopSteps | null;
};
type SopInsert = Omit<GeneratedTables["sops"]["Insert"], "category" | "steps"> & {
  title: string;
  category?: string;
  steps?: SopSteps | null;
};
type SopUpdate = Omit<GeneratedTables["sops"]["Update"], "category" | "steps"> & {
  category?: string;
  steps?: SopSteps | null;
};

type LibraryVersionStatus = "draft" | "in_review" | "published" | "superseded" | "retired";
type LibraryVersionRow = Omit<GeneratedTables["business_library_versions"]["Row"], "status"> & {
  status: LibraryVersionStatus;
};
// content_hash is filled by the set_business_library_content_hash() trigger
// (migration 128), so writes never supply it.
type LibraryVersionInsert = Omit<GeneratedTables["business_library_versions"]["Insert"], "status" | "content_hash"> & {
  status?: LibraryVersionStatus;
  content_hash?: string;
};
type LibraryVersionUpdate = Omit<GeneratedTables["business_library_versions"]["Update"], "status"> & {
  status?: LibraryVersionStatus;
};

type ProspectingDiscoveryCaptureRow = {
  id: string; client_id: string; campaign_id: string; job_id: string; prospect_id: string;
  source: string; canonical_key: string; dedupe_keys: string[]; normalized_payload: Json;
  raw_payload: Json; payload_hash: string; actor_id: string; actor_provider_id: string | null;
  actor_build_requested: string | null; actor_build_id: string | null; actor_run_id: string;
  adapter_version: number; captured_at: string; created_at: string;
};
type ProspectingIdentityAliasRow = {
  id: string; client_id: string; prospect_id: string; identity_type: string; identity_key: string;
  is_primary: boolean; source: string; first_seen_at: string; last_seen_at: string;
};
type ProspectingMergeSuggestionRow = {
  id: string; client_id: string; left_prospect_id: string; right_prospect_id: string;
  status: "pending" | "accepted" | "dismissed"; confidence: number; evidence: Json;
  created_at: string; updated_at: string;
};
type ProspectingProviderCheckRow = {
  id: string; provider: "google_maps" | "google_search" | "linkedin_profiles" | "website_enrichment";
  status: "queued" | "running" | "passed" | "warning" | "failed";
  actor_id: string; actor_provider_id: string; actor_build_requested: string;
  actor_build_id: string | null; actor_run_id: string | null; actor_dataset_id: string | null;
  input_hash: string; requested_results: number; usable_results: number | null;
  latency_ms: number | null; usage_total_usd: number | null; provider_status: string | null;
  diagnostic: string | null; initiated_by: string | null; started_at: string;
  completed_at: string | null; created_at: string; updated_at: string;
};
type ProspectingActivityEventRow = {
  id: string; client_id: string; campaign_id: string | null; lead_id: string | null;
  job_id: string | null; event_type: string; actor_id: string | null;
  subject_user_id: string | null; detail: Json; created_at: string;
};

type CompatTables = Omit<
  GeneratedTables,
  | "company_dna" | "sops" | "daily_log_notes" | "kb_entries" | "kb_generation_runs"
  | "business_library_versions" | "golden_questions" | "crawl_jobs" | "tool_runs"
  | "content_style_analyses"
> & {
  company_dna: {
    Row: DbCompanyDna;
    Insert: CompanyDnaInsert;
    Update: CompanyDnaUpdate;
    Relationships: GeneratedTables["company_dna"]["Relationships"];
  };
  sops: {
    Row: SopRow;
    Insert: SopInsert;
    Update: SopUpdate;
    Relationships: GeneratedTables["sops"]["Relationships"];
  };
  daily_log_notes: RowAs<"daily_log_notes", Omit<GeneratedTables["daily_log_notes"]["Row"], "created_at"> & {
    created_at: string;
  }>;
  kb_entries: RowAs<"kb_entries", Omit<GeneratedTables["kb_entries"]["Row"], "generated_at" | "source_vault_ids"> & {
    generated_at: string;
    source_vault_ids: string[];
  }>;
  kb_generation_runs: RowAs<"kb_generation_runs", Omit<GeneratedTables["kb_generation_runs"]["Row"], "status" | "started_at"> & {
    status: string;
    started_at: string;
  }>;
  business_library_versions: {
    Row: LibraryVersionRow;
    Insert: LibraryVersionInsert;
    Update: LibraryVersionUpdate;
    Relationships: GeneratedTables["business_library_versions"]["Relationships"];
  };
  // Curated jsonb columns (validated shapes the app was written against).
  golden_questions: RowAs<"golden_questions", Omit<GeneratedTables["golden_questions"]["Row"], "history"> & {
    history: { s: string; at: string }[];
  }>;
  content_style_analyses: RowAs<"content_style_analyses", Omit<GeneratedTables["content_style_analyses"]["Row"], "analysis"> & {
    analysis: StyleAnalysisProfile;
  }>;
  crawl_jobs: {
    Row: Omit<GeneratedTables["crawl_jobs"]["Row"], "meta"> & { meta: Record<string, unknown> };
    Insert: Omit<GeneratedTables["crawl_jobs"]["Insert"], "meta"> & { meta?: Record<string, unknown> };
    Update: Omit<GeneratedTables["crawl_jobs"]["Update"], "meta"> & { meta?: Record<string, unknown> };
    Relationships: GeneratedTables["crawl_jobs"]["Relationships"];
  };
  tool_runs: {
    Row: Omit<GeneratedTables["tool_runs"]["Row"], "output"> & { output: Record<string, unknown> | null };
    Insert: Omit<GeneratedTables["tool_runs"]["Insert"], "output"> & { output?: Record<string, unknown> | null };
    Update: Omit<GeneratedTables["tool_runs"]["Update"], "output"> & { output?: Record<string, unknown> | null };
    Relationships: GeneratedTables["tool_runs"]["Relationships"];
  };
  prospecting_discovery_captures: {
    Row: ProspectingDiscoveryCaptureRow;
    Insert: Omit<ProspectingDiscoveryCaptureRow, "id" | "created_at"> & { id?: string; created_at?: string };
    Update: Partial<ProspectingDiscoveryCaptureRow>;
    Relationships: [];
  };
  prospecting_identity_aliases: {
    Row: ProspectingIdentityAliasRow;
    Insert: Omit<ProspectingIdentityAliasRow, "id" | "first_seen_at" | "last_seen_at"> & { id?: string; first_seen_at?: string; last_seen_at?: string };
    Update: Partial<ProspectingIdentityAliasRow>;
    Relationships: [];
  };
  prospecting_merge_suggestions: {
    Row: ProspectingMergeSuggestionRow;
    Insert: Omit<ProspectingMergeSuggestionRow, "id" | "status" | "created_at" | "updated_at"> & { id?: string; status?: ProspectingMergeSuggestionRow["status"]; created_at?: string; updated_at?: string };
    Update: Partial<ProspectingMergeSuggestionRow>;
    Relationships: [];
  };
  prospecting_provider_checks: {
    Row: ProspectingProviderCheckRow;
    Insert: Omit<ProspectingProviderCheckRow,
      "id" | "status" | "actor_build_id" | "actor_run_id" | "actor_dataset_id" |
      "usable_results" | "latency_ms" | "usage_total_usd" | "provider_status" |
      "diagnostic" | "started_at" | "completed_at" | "created_at" | "updated_at"
    > & Partial<Pick<ProspectingProviderCheckRow,
      "id" | "status" | "actor_build_id" | "actor_run_id" | "actor_dataset_id" |
      "usable_results" | "latency_ms" | "usage_total_usd" | "provider_status" |
      "diagnostic" | "started_at" | "completed_at" | "created_at" | "updated_at"
    >>;
    Update: Partial<ProspectingProviderCheckRow>;
    Relationships: [];
  };
  prospecting_campaigns: {
    Row: GeneratedTables["prospecting_campaigns"]["Row"] & { search_fingerprint: string | null; owner_id: string | null };
    Insert: GeneratedTables["prospecting_campaigns"]["Insert"] & { search_fingerprint?: string | null; owner_id?: string | null };
    Update: GeneratedTables["prospecting_campaigns"]["Update"] & { search_fingerprint?: string | null; owner_id?: string | null };
    Relationships: GeneratedTables["prospecting_campaigns"]["Relationships"];
  };
  prospecting_campaign_leads: {
    Row: GeneratedTables["prospecting_campaign_leads"]["Row"] & { assigned_to: string | null; latest_enrichment_job_id: string | null };
    Insert: GeneratedTables["prospecting_campaign_leads"]["Insert"] & { assigned_to?: string | null; latest_enrichment_job_id?: string | null };
    Update: GeneratedTables["prospecting_campaign_leads"]["Update"] & { assigned_to?: string | null; latest_enrichment_job_id?: string | null };
    Relationships: GeneratedTables["prospecting_campaign_leads"]["Relationships"];
  };
  prospecting_activity_events: {
    Row: ProspectingActivityEventRow;
    Insert: Omit<ProspectingActivityEventRow,"id"|"detail"|"created_at"> & {
      id?: string; detail?: Json; created_at?: string;
    };
    Update: Partial<ProspectingActivityEventRow>;
    Relationships: [];
  };
};

/**
 * Generated RPC args are typed non-nullable when the SQL param has no
 * DEFAULT — but Postgres function parameters always accept NULL and
 * PostgREST forwards it. Widen every arg to `T | null` so callers can pass
 * the nullable values the functions already accept at runtime.
 */
type NullableArgs<A> = [A] extends [never] ? A : { [P in keyof A]: A[P] | null };
type WithNullableArgs<F> = F extends { Args: infer A }
  ? { [K in keyof F]: K extends "Args" ? NullableArgs<A> : F[K] }
  : F;
type GeneratedFunctionsNullable = { [K in keyof GeneratedFunctions]: WithNullableArgs<GeneratedFunctions[K]> };

type CompatFunctions = Omit<GeneratedFunctionsNullable, "transition_business_library_version"> & {
  transition_business_library_version: {
    Args: {
      p_entry_id: string;
      p_version_id: string | null;
      p_action: "submit_review" | "return_draft" | "publish" | "new_version" | "retire";
      p_actor_id: string;
    };
    Returns: string;
  };
  release_prospecting_enrichment_reservation: {
    Args: {
      p_job_id: string;
      p_client_id: string;
      p_error_code?: string | null;
      p_error_message?: string | null;
    };
    Returns: GeneratedTables["prospecting_jobs"]["Row"][];
  };
  update_prospecting_campaign_profile: {
    Args: { p_campaign_id: string; p_client_id: string; p_profile: Json };
    Returns: GeneratedTables["prospecting_campaigns"]["Row"][];
  };
  promote_prospecting_lead_to_crm_v2: {
    Args: {
      p_campaign_lead_id: string;
      p_client_id: string;
      p_actor_id: string;
      p_selected_email?: string | null;
      p_selected_phone?: string | null;
    };
    Returns: string;
  };
  prepare_prospecting_job: {
    Args: {
      p_job_id: string;
      p_client_id: string;
      p_actor_provider_id: string;
      p_actor_build_requested: string;
      p_input_payload: Json;
      p_input_hash: string;
    };
    Returns: GeneratedTables["prospecting_jobs"]["Row"][];
  };
  reconcile_prospecting_provider_run_v2: {
    Args: {
      p_job_id: string;
      p_actor_provider_id: string;
      p_actor_run_id: string;
      p_provider_status: string;
      p_actor_build_id?: string | null;
      p_actor_dataset_id?: string | null;
      p_usage_total_usd?: number | null;
    };
    Returns: GeneratedTables["prospecting_jobs"]["Row"][];
  };
  ingest_prospecting_job_results_v2: {
    Args: {
      p_job_id: string;
      p_lease_token: string;
      p_results: Json;
      p_usage_total_usd?: number | null;
    };
    Returns: GeneratedTables["prospecting_jobs"]["Row"][];
  };
  create_prospecting_campaign_once: {
    Args: {
      p_client_id: string;
      p_name: string;
      p_source: string;
      p_queries: string[];
      p_locations: string[];
      p_country_code: string;
      p_language_code: string;
      p_max_results: number;
      p_ideal_profile: Json;
      p_created_by: string;
    };
    Returns: Json;
  };
  reserve_prepare_claim_prospecting_job: {
    Args: {
      p_campaign_id: string; p_client_id: string; p_actor_id: string; p_actor_identifier: string;
      p_actor_provider_id: string; p_actor_build_requested: string; p_adapter_version: number;
      p_input_payload: Json; p_input_hash: string; p_max_charge_usd: number;
      p_daily_run_limit?: number; p_daily_result_limit?: number;
    };
    Returns: GeneratedTables["prospecting_jobs"]["Row"][];
  };
  reserve_prepare_claim_prospecting_enrichment: {
    Args: {
      p_lead_id: string; p_client_id: string; p_actor_id: string; p_actor_identifier: string;
      p_actor_provider_id: string; p_actor_build_requested: string; p_adapter_version: number;
      p_input_payload: Json; p_input_hash: string; p_max_charge_usd: number;
      p_daily_enrichment_limit?: number;
    };
    Returns: GeneratedTables["prospecting_jobs"]["Row"][];
  };
  update_prospecting_lead_workflow: {
    Args: {
      p_lead_id: string; p_client_id: string; p_actor_id: string; p_status?: string | null;
      p_set_assignee?: boolean; p_assigned_to?: string | null;
    };
    Returns: GeneratedTables["prospecting_campaign_leads"]["Row"][];
  };
  update_prospecting_campaign_workflow: {
    Args: {
      p_campaign_id: string; p_client_id: string; p_actor_id: string; p_set_owner?: boolean;
      p_owner_id?: string | null; p_archived?: boolean | null;
    };
    Returns: GeneratedTables["prospecting_campaigns"]["Row"][];
  };
  record_prospecting_activity: {
    Args: {
      p_client_id: string; p_actor_id: string; p_event_type: string;
      p_campaign_id?: string | null; p_lead_id?: string | null; p_job_id?: string | null;
      p_subject_user_id?: string | null; p_detail?: Json;
    };
    Returns: string;
  };
  promote_prospecting_lead_to_crm_v3: {
    Args: {
      p_campaign_lead_id: string; p_client_id: string; p_actor_id: string;
      p_selected_email?: string | null; p_selected_phone?: string | null;
    };
    Returns: string;
  };
};

export type Database = Omit<GeneratedSchema, "public"> & {
  public: Omit<GeneratedPublic, "Tables" | "Functions"> & {
    Tables: CompatTables;
    Functions: CompatFunctions;
  };
};

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];
