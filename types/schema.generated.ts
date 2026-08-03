export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      access_credential_reveals: {
        Row: {
          client_id: string
          credential_id: string
          id: string
          revealed_at: string | null
          user_id: string | null
        }
        Insert: {
          client_id: string
          credential_id: string
          id?: string
          revealed_at?: string | null
          user_id?: string | null
        }
        Update: {
          client_id?: string
          credential_id?: string
          id?: string
          revealed_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_credential_reveals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_credential_reveals_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "access_credentials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_credential_reveals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      access_credentials: {
        Row: {
          category: string
          client_id: string
          created_at: string | null
          created_by: string | null
          id: string
          password_enc: string
          restricted_to: string[] | null
          site: string
          updated_at: string | null
          url: string
          username: string
        }
        Insert: {
          category?: string
          client_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          password_enc: string
          restricted_to?: string[] | null
          site: string
          updated_at?: string | null
          url?: string
          username?: string
        }
        Update: {
          category?: string
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          password_enc?: string
          restricted_to?: string[] | null
          site?: string
          updated_at?: string | null
          url?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_credentials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_credentials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompt_versions: {
        Row: {
          content: string
          created_at: string
          id: string
          saved_by: string | null
          slug: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          saved_by?: string | null
          slug: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          saved_by?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_versions_saved_by_fkey"
            columns: ["saved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_prompts: {
        Row: {
          content: string
          slug: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: string
          slug: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          slug?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_errors: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          message: string
          source: string
          stack: string | null
          url: string | null
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          message: string
          source: string
          stack?: string | null
          url?: string | null
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          message?: string
          source?: string
          stack?: string | null
          url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_errors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_errors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      apply_applicants: {
        Row: {
          age: number | null
          created_at: string
          current_job_title: string | null
          device_brand: string | null
          device_type: string | null
          disqualification_reason: string | null
          disqualified_at: string | null
          email: string | null
          facebook_link: string | null
          first_name: string | null
          id: string
          instagram_link: string | null
          internet_mbps: number | null
          internet_provider: string | null
          job_id: string | null
          kids: boolean | null
          last_name: string | null
          location: string | null
          married: boolean | null
          phone: string | null
          previous_employers: string | null
          role_slug: string
          sex: string | null
          skills_tools: string | null
          software_used: string | null
          task_description: string | null
          typing_accuracy: number | null
          typing_wpm: number | null
          years_experience: string | null
        }
        Insert: {
          age?: number | null
          created_at?: string
          current_job_title?: string | null
          device_brand?: string | null
          device_type?: string | null
          disqualification_reason?: string | null
          disqualified_at?: string | null
          email?: string | null
          facebook_link?: string | null
          first_name?: string | null
          id?: string
          instagram_link?: string | null
          internet_mbps?: number | null
          internet_provider?: string | null
          job_id?: string | null
          kids?: boolean | null
          last_name?: string | null
          location?: string | null
          married?: boolean | null
          phone?: string | null
          previous_employers?: string | null
          role_slug: string
          sex?: string | null
          skills_tools?: string | null
          software_used?: string | null
          task_description?: string | null
          typing_accuracy?: number | null
          typing_wpm?: number | null
          years_experience?: string | null
        }
        Update: {
          age?: number | null
          created_at?: string
          current_job_title?: string | null
          device_brand?: string | null
          device_type?: string | null
          disqualification_reason?: string | null
          disqualified_at?: string | null
          email?: string | null
          facebook_link?: string | null
          first_name?: string | null
          id?: string
          instagram_link?: string | null
          internet_mbps?: number | null
          internet_provider?: string | null
          job_id?: string | null
          kids?: boolean | null
          last_name?: string | null
          location?: string | null
          married?: boolean | null
          phone?: string | null
          previous_employers?: string | null
          role_slug?: string
          sex?: string | null
          skills_tools?: string | null
          software_used?: string | null
          task_description?: string | null
          typing_accuracy?: number | null
          typing_wpm?: number | null
          years_experience?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apply_applicants_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "apply_job_postings"
            referencedColumns: ["id"]
          },
        ]
      }
      apply_candidate_notes: {
        Row: {
          candidate_id: string
          created_at: string
          id: string
          note: string
        }
        Insert: {
          candidate_id: string
          created_at?: string
          id?: string
          note: string
        }
        Update: {
          candidate_id?: string
          created_at?: string
          id?: string
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "apply_candidate_notes_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "apply_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      apply_candidates: {
        Row: {
          age: number | null
          current_job_title: string | null
          cv_type: string
          cv_url: string
          device_brand: string | null
          device_type: string | null
          differentiator: string
          email: string
          facebook_link: string | null
          full_name: string
          id: string
          instagram_link: string | null
          internet_provider: string | null
          job_id: string | null
          kids: boolean | null
          last_name: string | null
          location: string
          married: boolean | null
          payment_methods: string[]
          paypal_email: string | null
          phone: string
          practical_response: string | null
          previous_employers: string | null
          rejection_reason: string | null
          salary_expectation_php: number
          session_id: string
          sex: string | null
          skills_tools: string | null
          software_used: string | null
          starred: boolean
          status: string
          submitted_at: string
          task_description: string | null
          video_intro_url: string | null
          wise_email: string | null
          writing_sample: string | null
          years_experience: string | null
        }
        Insert: {
          age?: number | null
          current_job_title?: string | null
          cv_type: string
          cv_url: string
          device_brand?: string | null
          device_type?: string | null
          differentiator: string
          email: string
          facebook_link?: string | null
          full_name: string
          id?: string
          instagram_link?: string | null
          internet_provider?: string | null
          job_id?: string | null
          kids?: boolean | null
          last_name?: string | null
          location: string
          married?: boolean | null
          payment_methods: string[]
          paypal_email?: string | null
          phone: string
          practical_response?: string | null
          previous_employers?: string | null
          rejection_reason?: string | null
          salary_expectation_php: number
          session_id: string
          sex?: string | null
          skills_tools?: string | null
          software_used?: string | null
          starred?: boolean
          status?: string
          submitted_at?: string
          task_description?: string | null
          video_intro_url?: string | null
          wise_email?: string | null
          writing_sample?: string | null
          years_experience?: string | null
        }
        Update: {
          age?: number | null
          current_job_title?: string | null
          cv_type?: string
          cv_url?: string
          device_brand?: string | null
          device_type?: string | null
          differentiator?: string
          email?: string
          facebook_link?: string | null
          full_name?: string
          id?: string
          instagram_link?: string | null
          internet_provider?: string | null
          job_id?: string | null
          kids?: boolean | null
          last_name?: string | null
          location?: string
          married?: boolean | null
          payment_methods?: string[]
          paypal_email?: string | null
          phone?: string
          practical_response?: string | null
          previous_employers?: string | null
          rejection_reason?: string | null
          salary_expectation_php?: number
          session_id?: string
          sex?: string | null
          skills_tools?: string | null
          software_used?: string | null
          starred?: boolean
          status?: string
          submitted_at?: string
          task_description?: string | null
          video_intro_url?: string | null
          wise_email?: string | null
          writing_sample?: string | null
          years_experience?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apply_candidates_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "apply_job_postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apply_candidates_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "apply_quiz_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      apply_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          role_id: string
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          role_id: string
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          role_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "apply_categories_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "apply_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      apply_job_postings: {
        Row: {
          category_id: string | null
          created_at: string
          description: string | null
          id: string
          requirements: string | null
          role_id: string
          salary_from: number | null
          salary_to: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          requirements?: string | null
          role_id: string
          salary_from?: number | null
          salary_to?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          requirements?: string | null
          role_id?: string
          salary_from?: number | null
          salary_to?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "apply_job_postings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "apply_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apply_job_postings_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "apply_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      apply_practical_tasks: {
        Row: {
          active: boolean
          id: string
          prompt: string
          role_id: string
        }
        Insert: {
          active?: boolean
          id?: string
          prompt: string
          role_id: string
        }
        Update: {
          active?: boolean
          id?: string
          prompt?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "apply_practical_tasks_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "apply_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      apply_questions: {
        Row: {
          active: boolean
          category_id: string | null
          correct_answer_index: number
          created_at: string
          id: string
          options: string[]
          question_text: string
          role_id: string
        }
        Insert: {
          active?: boolean
          category_id?: string | null
          correct_answer_index: number
          created_at?: string
          id?: string
          options: string[]
          question_text: string
          role_id: string
        }
        Update: {
          active?: boolean
          category_id?: string | null
          correct_answer_index?: number
          created_at?: string
          id?: string
          options?: string[]
          question_text?: string
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "apply_questions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "apply_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apply_questions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "apply_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      apply_quiz_sessions: {
        Row: {
          answer_times: number[] | null
          applicant_id: string | null
          candidate_email: string | null
          completed_at: string | null
          correct_flags: boolean[] | null
          id: string
          ip_address: string | null
          option_orders: Json | null
          passed: boolean | null
          question_ids: string[]
          role_id: string
          score: number | null
          started_at: string
          suspicious_answer_count: number
          tab_switches: number
        }
        Insert: {
          answer_times?: number[] | null
          applicant_id?: string | null
          candidate_email?: string | null
          completed_at?: string | null
          correct_flags?: boolean[] | null
          id?: string
          ip_address?: string | null
          option_orders?: Json | null
          passed?: boolean | null
          question_ids?: string[]
          role_id: string
          score?: number | null
          started_at?: string
          suspicious_answer_count?: number
          tab_switches?: number
        }
        Update: {
          answer_times?: number[] | null
          applicant_id?: string | null
          candidate_email?: string | null
          completed_at?: string | null
          correct_flags?: boolean[] | null
          id?: string
          ip_address?: string | null
          option_orders?: Json | null
          passed?: boolean | null
          question_ids?: string[]
          role_id?: string
          score?: number | null
          started_at?: string
          suspicious_answer_count?: number
          tab_switches?: number
        }
        Relationships: [
          {
            foreignKeyName: "apply_quiz_sessions_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "apply_applicants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "apply_quiz_sessions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "apply_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      apply_roles: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      brain_context_feature_flags: {
        Row: {
          ask_enabled: boolean
          client_id: string
          content_enabled: boolean
          tools_enabled: boolean
          topics_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ask_enabled?: boolean
          client_id: string
          content_enabled?: boolean
          tools_enabled?: boolean
          topics_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ask_enabled?: boolean
          client_id?: string
          content_enabled?: boolean
          tools_enabled?: boolean
          topics_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brain_context_feature_flags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_context_feature_flags_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_context_snapshots: {
        Row: {
          artifact_id: string | null
          artifact_kind: string | null
          channel: string | null
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          model: string | null
          prompt_version: string | null
          request: Json
          resolver_version: string
          snapshot: Json
          snapshot_hash: string
          surface: string
          version: string
        }
        Insert: {
          artifact_id?: string | null
          artifact_kind?: string | null
          channel?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string | null
          prompt_version?: string | null
          request: Json
          resolver_version: string
          snapshot: Json
          snapshot_hash: string
          surface: string
          version: string
        }
        Update: {
          artifact_id?: string | null
          artifact_kind?: string | null
          channel?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string | null
          prompt_version?: string | null
          request?: Json
          resolver_version?: string
          snapshot?: Json
          snapshot_hash?: string
          surface?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_context_snapshots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_context_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_diagnostic_runs: {
        Row: {
          brain_context_snapshot_id: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          id: string
          opportunities_created: number
          recoverable: boolean
          started_at: string
          status: string
          summary: Json
          trigger_kind: string
          updated_at: string
        }
        Insert: {
          brain_context_snapshot_id?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          opportunities_created?: number
          recoverable?: boolean
          started_at?: string
          status?: string
          summary?: Json
          trigger_kind: string
          updated_at?: string
        }
        Update: {
          brain_context_snapshot_id?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          opportunities_created?: number
          recoverable?: boolean
          started_at?: string
          status?: string
          summary?: Json
          trigger_kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_diagnostic_runs_brain_context_snapshot_id_client_id_fkey"
            columns: ["brain_context_snapshot_id", "client_id"]
            isOneToOne: false
            referencedRelation: "brain_context_snapshots"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "brain_diagnostic_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_diagnostic_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_evaluation_cases: {
        Row: {
          active: boolean
          baseline_captured_at: string | null
          baseline_context_snapshot_id: string | null
          baseline_model: string | null
          baseline_output: string
          baseline_prompt_version: string | null
          case_type: string
          channel: string | null
          client_id: string
          created_at: string
          created_by: string | null
          expected: Json
          id: string
          input: Json
          name: string
          tags: string[]
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          baseline_captured_at?: string | null
          baseline_context_snapshot_id?: string | null
          baseline_model?: string | null
          baseline_output?: string
          baseline_prompt_version?: string | null
          case_type: string
          channel?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          expected?: Json
          id?: string
          input: Json
          name: string
          tags?: string[]
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          baseline_captured_at?: string | null
          baseline_context_snapshot_id?: string | null
          baseline_model?: string | null
          baseline_output?: string
          baseline_prompt_version?: string | null
          case_type?: string
          channel?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          expected?: Json
          id?: string
          input?: Json
          name?: string
          tags?: string[]
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "brain_evaluation_cases_baseline_context_snapshot_id_fkey"
            columns: ["baseline_context_snapshot_id"]
            isOneToOne: false
            referencedRelation: "brain_context_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_evaluation_cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_evaluation_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_events: {
        Row: {
          artifact_id: string | null
          channel: string | null
          client_id: string
          created_at: string
          event_key: string | null
          event_type: string | null
          id: string
          kind: string
          meaningful: boolean
          meta: Json
          summary: string
        }
        Insert: {
          artifact_id?: string | null
          channel?: string | null
          client_id: string
          created_at?: string
          event_key?: string | null
          event_type?: string | null
          id?: string
          kind: string
          meaningful?: boolean
          meta?: Json
          summary: string
        }
        Update: {
          artifact_id?: string | null
          channel?: string | null
          client_id?: string
          created_at?: string
          event_key?: string | null
          event_type?: string | null
          id?: string
          kind?: string
          meaningful?: boolean
          meta?: Json
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_knowledge_gaps: {
        Row: {
          affected_surfaces: string[]
          client_id: string
          created_at: string
          example_questions: string[]
          id: string
          importance: string
          normalized_topic: string
          occurrence_count: number
          owner_id: string | null
          recommended_source: string | null
          resolved_at: string | null
          resolved_by_vault_item_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          affected_surfaces?: string[]
          client_id: string
          created_at?: string
          example_questions?: string[]
          id?: string
          importance?: string
          normalized_topic: string
          occurrence_count?: number
          owner_id?: string | null
          recommended_source?: string | null
          resolved_at?: string | null
          resolved_by_vault_item_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          affected_surfaces?: string[]
          client_id?: string
          created_at?: string
          example_questions?: string[]
          id?: string
          importance?: string
          normalized_topic?: string
          occurrence_count?: number
          owner_id?: string | null
          recommended_source?: string | null
          resolved_at?: string | null
          resolved_by_vault_item_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_knowledge_gaps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_knowledge_gaps_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_knowledge_gaps_resolved_by_vault_item_id_fkey"
            columns: ["resolved_by_vault_item_id"]
            isOneToOne: false
            referencedRelation: "vault_items"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_maintenance_state: {
        Row: {
          client_id: string
          last_decay_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          last_decay_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          last_decay_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_maintenance_state_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_memory: {
        Row: {
          active: boolean
          approved_at: string | null
          approved_by: string | null
          client_id: string
          confidence: number
          conflict_resolution: string | null
          conflict_resolved_at: string | null
          conflict_resolved_by: string | null
          conflict_summary: string | null
          content: string
          contradiction_status: string
          contradicts_memory_id: string | null
          created_at: string
          embedding: Json | null
          embedding_vector: string | null
          first_observed_at: string
          id: string
          kind: string
          last_confirmed_at: string
          last_reinforced_at: string
          lineage_complete: boolean
          pinned: boolean
          scope: Json
          source_count: number
          status: string
          style_profile_version_at_confirmation: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          confidence?: number
          conflict_resolution?: string | null
          conflict_resolved_at?: string | null
          conflict_resolved_by?: string | null
          conflict_summary?: string | null
          content: string
          contradiction_status?: string
          contradicts_memory_id?: string | null
          created_at?: string
          embedding?: Json | null
          embedding_vector?: string | null
          first_observed_at?: string
          id?: string
          kind: string
          last_confirmed_at?: string
          last_reinforced_at?: string
          lineage_complete?: boolean
          pinned?: boolean
          scope?: Json
          source_count?: number
          status?: string
          style_profile_version_at_confirmation?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          confidence?: number
          conflict_resolution?: string | null
          conflict_resolved_at?: string | null
          conflict_resolved_by?: string | null
          conflict_summary?: string | null
          content?: string
          contradiction_status?: string
          contradicts_memory_id?: string | null
          created_at?: string
          embedding?: Json | null
          embedding_vector?: string | null
          first_observed_at?: string
          id?: string
          kind?: string
          last_confirmed_at?: string
          last_reinforced_at?: string
          lineage_complete?: boolean
          pinned?: boolean
          scope?: Json
          source_count?: number
          status?: string
          style_profile_version_at_confirmation?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_memory_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_memory_conflict_resolved_by_fkey"
            columns: ["conflict_resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_memory_contradicts_memory_id_fkey"
            columns: ["contradicts_memory_id"]
            isOneToOne: false
            referencedRelation: "brain_memory"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_memory_sources: {
        Row: {
          client_id: string
          contribution: string
          created_at: string
          id: string
          memory_id: string
          signal_id: string
          supporting_excerpt: string
          supporting_excerpt_hash: string
        }
        Insert: {
          client_id: string
          contribution?: string
          created_at?: string
          id?: string
          memory_id: string
          signal_id: string
          supporting_excerpt: string
          supporting_excerpt_hash: string
        }
        Update: {
          client_id?: string
          contribution?: string
          created_at?: string
          id?: string
          memory_id?: string
          signal_id?: string
          supporting_excerpt?: string
          supporting_excerpt_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_memory_sources_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_memory_sources_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "brain_memory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_memory_sources_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "brain_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_opportunities: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          brain_context_snapshot_id: string
          client_id: string
          company_provenance: Json
          completed_at: string | null
          completed_by: string | null
          created_at: string
          diagnostic_run_id: string
          dismissed_at: string | null
          dismissed_by: string | null
          effectiveness_status: string
          effort: string
          fingerprint: string
          id: string
          impact: string
          kind: string
          library_provenance: Json
          measured_at: string | null
          outcome: Json
          priority_score: number
          rationale: string
          recommended_action: string
          source_layers: string[]
          started_at: string | null
          status: string
          summary: string
          title: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          brain_context_snapshot_id: string
          client_id: string
          company_provenance?: Json
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          diagnostic_run_id: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          effectiveness_status?: string
          effort: string
          fingerprint: string
          id?: string
          impact: string
          kind: string
          library_provenance?: Json
          measured_at?: string | null
          outcome?: Json
          priority_score: number
          rationale: string
          recommended_action: string
          source_layers?: string[]
          started_at?: string | null
          status?: string
          summary: string
          title: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          brain_context_snapshot_id?: string
          client_id?: string
          company_provenance?: Json
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          diagnostic_run_id?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          effectiveness_status?: string
          effort?: string
          fingerprint?: string
          id?: string
          impact?: string
          kind?: string
          library_provenance?: Json
          measured_at?: string | null
          outcome?: Json
          priority_score?: number
          rationale?: string
          recommended_action?: string
          source_layers?: string[]
          started_at?: string | null
          status?: string
          summary?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_opportunities_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_opportunities_brain_context_snapshot_id_client_id_fkey"
            columns: ["brain_context_snapshot_id", "client_id"]
            isOneToOne: false
            referencedRelation: "brain_context_snapshots"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "brain_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_opportunities_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_opportunities_diagnostic_run_id_client_id_fkey"
            columns: ["diagnostic_run_id", "client_id"]
            isOneToOne: false
            referencedRelation: "brain_diagnostic_runs"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "brain_opportunities_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_opportunity_events: {
        Row: {
          actor_id: string | null
          client_id: string
          created_at: string
          event_kind: string
          from_status: string | null
          id: string
          metadata: Json
          opportunity_id: string
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          client_id: string
          created_at?: string
          event_kind: string
          from_status?: string | null
          id?: string
          metadata?: Json
          opportunity_id: string
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          client_id?: string
          created_at?: string
          event_kind?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          opportunity_id?: string
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brain_opportunity_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_opportunity_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_opportunity_events_opportunity_id_client_id_fkey"
            columns: ["opportunity_id", "client_id"]
            isOneToOne: false
            referencedRelation: "brain_opportunities"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      brain_score_history: {
        Row: {
          captured_date: string
          client_id: string
          components: Json
          created_at: string
          id: string
          level: string
          score: number
        }
        Insert: {
          captured_date?: string
          client_id: string
          components?: Json
          created_at?: string
          id?: string
          level: string
          score: number
        }
        Update: {
          captured_date?: string
          client_id?: string
          components?: Json
          created_at?: string
          id?: string
          level?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "brain_score_history_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_signals: {
        Row: {
          artifact_id: string | null
          artifact_text: string
          channel: string | null
          client_id: string
          content_type: string | null
          context: Json
          created_at: string
          dimensions: string[]
          distill_claim_token: string | null
          distill_claim_until: string | null
          distilled_at: string | null
          editorial_event_id: string | null
          id: string
          learning_intent: string
          rating: number
          reason: string | null
          resolved: boolean
          retention_until: string | null
          surface: string
          user_id: string | null
          visibility: string
        }
        Insert: {
          artifact_id?: string | null
          artifact_text: string
          channel?: string | null
          client_id: string
          content_type?: string | null
          context?: Json
          created_at?: string
          dimensions?: string[]
          distill_claim_token?: string | null
          distill_claim_until?: string | null
          distilled_at?: string | null
          editorial_event_id?: string | null
          id?: string
          learning_intent?: string
          rating: number
          reason?: string | null
          resolved?: boolean
          retention_until?: string | null
          surface: string
          user_id?: string | null
          visibility?: string
        }
        Update: {
          artifact_id?: string | null
          artifact_text?: string
          channel?: string | null
          client_id?: string
          content_type?: string | null
          context?: Json
          created_at?: string
          dimensions?: string[]
          distill_claim_token?: string | null
          distill_claim_until?: string | null
          distilled_at?: string | null
          editorial_event_id?: string | null
          id?: string
          learning_intent?: string
          rating?: number
          reason?: string | null
          resolved?: boolean
          retention_until?: string | null
          surface?: string
          user_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_signals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_signals_editorial_event_fkey"
            columns: ["editorial_event_id"]
            isOneToOne: false
            referencedRelation: "content_editorial_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brain_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_library_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      business_library_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedded_at: string | null
          embedding: string | null
          embedding_attempts: number
          embedding_error: string | null
          embedding_model: string | null
          entry_id: string
          id: string
          search_vector: unknown
          version_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_attempts?: number
          embedding_error?: string | null
          embedding_model?: string | null
          entry_id: string
          id?: string
          search_vector?: unknown
          version_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedded_at?: string | null
          embedding?: string | null
          embedding_attempts?: number
          embedding_error?: string | null
          embedding_model?: string | null
          entry_id?: string
          id?: string
          search_vector?: unknown
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_library_chunks_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "business_library_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_library_chunks_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "business_library_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      business_library_entries: {
        Row: {
          created_at: string
          created_by: string | null
          current_version_id: string | null
          id: string
          retired_at: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          retired_at?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_version_id?: string | null
          id?: string
          retired_at?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_library_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_library_entries_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "business_library_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      business_library_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: Json
          entry_id: string
          id: string
          version_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entry_id: string
          id?: string
          version_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: Json
          entry_id?: string
          id?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "business_library_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_library_events_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "business_library_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_library_events_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "business_library_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      business_library_gap_suggestions: {
        Row: {
          brain_context_snapshot_id: string | null
          client_id: string
          coach_role: string
          consented_at: string
          created_at: string
          detail: string
          id: string
          owner_id: string | null
          status: string
          topic: string
          updated_at: string
        }
        Insert: {
          brain_context_snapshot_id?: string | null
          client_id: string
          coach_role: string
          consented_at: string
          created_at?: string
          detail?: string
          id?: string
          owner_id?: string | null
          status?: string
          topic: string
          updated_at?: string
        }
        Update: {
          brain_context_snapshot_id?: string | null
          client_id?: string
          coach_role?: string
          consented_at?: string
          created_at?: string
          detail?: string
          id?: string
          owner_id?: string | null
          status?: string
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_library_gap_suggestions_brain_context_snapshot_id_fkey"
            columns: ["brain_context_snapshot_id"]
            isOneToOne: false
            referencedRelation: "brain_context_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_library_gap_suggestions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_library_gap_suggestions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      business_library_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          audiences: string[]
          body: string
          category_id: string
          change_note: string | null
          channels: string[]
          content_hash: string
          countries: string[]
          created_at: string
          created_by: string | null
          entry_id: string
          id: string
          industries: string[]
          lifecycle_stages: string[]
          published_at: string | null
          review_due_at: string | null
          source_url: string | null
          status: string
          submitted_at: string | null
          summary: string
          tags: string[]
          time_sensitive: boolean
          title: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          audiences?: string[]
          body: string
          category_id: string
          change_note?: string | null
          channels?: string[]
          content_hash: string
          countries?: string[]
          created_at?: string
          created_by?: string | null
          entry_id: string
          id?: string
          industries?: string[]
          lifecycle_stages?: string[]
          published_at?: string | null
          review_due_at?: string | null
          source_url?: string | null
          status?: string
          submitted_at?: string | null
          summary: string
          tags?: string[]
          time_sensitive?: boolean
          title: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          version_number: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          audiences?: string[]
          body?: string
          category_id?: string
          change_note?: string | null
          channels?: string[]
          content_hash?: string
          countries?: string[]
          created_at?: string
          created_by?: string | null
          entry_id?: string
          id?: string
          industries?: string[]
          lifecycle_stages?: string[]
          published_at?: string | null
          review_due_at?: string | null
          source_url?: string | null
          status?: string
          submitted_at?: string | null
          summary?: string
          tags?: string[]
          time_sensitive?: boolean
          title?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_library_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_library_versions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "business_library_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_library_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_library_versions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "business_library_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          archived_at: string | null
          content_pilot_enabled: boolean
          content_pilot_started_at: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          archived_at?: string | null
          content_pilot_enabled?: boolean
          content_pilot_started_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          archived_at?: string | null
          content_pilot_enabled?: boolean
          content_pilot_started_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_action_previews: {
        Row: {
          action_type: string
          brain_context_snapshot_id: string
          client_id: string
          completed_at: string | null
          created_at: string
          expires_at: string
          generated_payload: Json
          id: string
          idempotency_key: string
          owner_id: string
          status: string
          updated_at: string
        }
        Insert: {
          action_type: string
          brain_context_snapshot_id: string
          client_id: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          generated_payload: Json
          id?: string
          idempotency_key: string
          owner_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          brain_context_snapshot_id?: string
          client_id?: string
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          generated_payload?: Json
          id?: string
          idempotency_key?: string
          owner_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_action_previews_brain_context_snapshot_id_fkey"
            columns: ["brain_context_snapshot_id"]
            isOneToOne: false
            referencedRelation: "brain_context_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_action_previews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_action_previews_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_action_receipts: {
        Row: {
          action_type: string
          client_id: string
          completed_at: string | null
          created_at: string
          error_code: string | null
          id: string
          idempotency_key: string
          owner_id: string
          payload: Json
          payload_hash: string
          result: Json | null
          status: string
          turn_id: string
          updated_at: string
        }
        Insert: {
          action_type: string
          client_id: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key: string
          owner_id: string
          payload: Json
          payload_hash: string
          result?: Json | null
          status?: string
          turn_id: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          client_id?: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          id?: string
          idempotency_key?: string
          owner_id?: string
          payload?: Json
          payload_hash?: string
          result?: Json | null
          status?: string
          turn_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_action_receipts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_action_receipts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_action_receipts_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "coach_turns"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_commitments: {
        Row: {
          check_in_claim_token: string | null
          check_in_claimed_until: string | null
          check_in_interval_days: number | null
          client_id: string
          commitment: string
          completed_at: string | null
          created_at: string
          due_date: string | null
          goal_id: string | null
          id: string
          last_check_in_at: string | null
          next_check_in_at: string | null
          owner_id: string
          reminder_count: number
          retention_until: string | null
          source_turn_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          check_in_claim_token?: string | null
          check_in_claimed_until?: string | null
          check_in_interval_days?: number | null
          client_id: string
          commitment: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          goal_id?: string | null
          id?: string
          last_check_in_at?: string | null
          next_check_in_at?: string | null
          owner_id: string
          reminder_count?: number
          retention_until?: string | null
          source_turn_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          check_in_claim_token?: string | null
          check_in_claimed_until?: string | null
          check_in_interval_days?: number | null
          client_id?: string
          commitment?: string
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          goal_id?: string | null
          id?: string
          last_check_in_at?: string | null
          next_check_in_at?: string | null
          owner_id?: string
          reminder_count?: number
          retention_until?: string | null
          source_turn_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_commitments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_commitments_goal_owner_fkey"
            columns: ["goal_id", "client_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "coach_goals"
            referencedColumns: ["id", "client_id", "owner_id"]
          },
          {
            foreignKeyName: "coach_commitments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_commitments_source_turn_id_fkey"
            columns: ["source_turn_id"]
            isOneToOne: false
            referencedRelation: "coach_turns"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_goals: {
        Row: {
          achieved_at: string | null
          client_id: string
          created_at: string
          id: string
          outcome: string
          owner_id: string
          progress: number
          retention_until: string | null
          source_turn_id: string | null
          status: string
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          achieved_at?: string | null
          client_id: string
          created_at?: string
          id?: string
          outcome?: string
          owner_id: string
          progress?: number
          retention_until?: string | null
          source_turn_id?: string | null
          status?: string
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          achieved_at?: string | null
          client_id?: string
          created_at?: string
          id?: string
          outcome?: string
          owner_id?: string
          progress?: number
          retention_until?: string | null
          source_turn_id?: string | null
          status?: string
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_goals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_goals_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_goals_source_turn_id_fkey"
            columns: ["source_turn_id"]
            isOneToOne: false
            referencedRelation: "coach_turns"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_memories: {
        Row: {
          client_id: string
          content: string
          created_at: string
          id: string
          kind: string
          owner_id: string
          source_turn_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string
          id?: string
          kind: string
          owner_id: string
          source_turn_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string
          id?: string
          kind?: string
          owner_id?: string
          source_turn_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_memories_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_memories_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_memories_source_turn_id_fkey"
            columns: ["source_turn_id"]
            isOneToOne: false
            referencedRelation: "coach_turns"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_progress_events: {
        Row: {
          client_id: string
          commitment_id: string | null
          created_at: string
          detail: Json
          event_type: string
          goal_id: string | null
          id: string
          owner_id: string
        }
        Insert: {
          client_id: string
          commitment_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          goal_id?: string | null
          id?: string
          owner_id: string
        }
        Update: {
          client_id?: string
          commitment_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          goal_id?: string | null
          id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_progress_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_progress_events_commitment_id_fkey"
            columns: ["commitment_id"]
            isOneToOne: false
            referencedRelation: "coach_commitments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_progress_events_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "coach_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_progress_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_question_metrics_daily: {
        Row: {
          answer_mode: string
          answered: boolean
          client_id: string
          coach_role: string
          metric_date: string
          question_count: number
          updated_at: string
        }
        Insert: {
          answer_mode: string
          answered: boolean
          client_id: string
          coach_role: string
          metric_date: string
          question_count?: number
          updated_at?: string
        }
        Update: {
          answer_mode?: string
          answered?: boolean
          client_id?: string
          coach_role?: string
          metric_date?: string
          question_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_question_metrics_daily_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_threads: {
        Row: {
          client_id: string
          created_at: string
          id: string
          owner_id: string
          retention_days: number
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          owner_id: string
          retention_days?: number
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          owner_id?: string
          retention_days?: number
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_threads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_turns: {
        Row: {
          action_completed_at: string | null
          action_draft: Json | null
          action_status: string
          answer: string
          brain_context_snapshot_id: string
          client_id: string
          coach_mode: string
          created_at: string
          deep_answer: string | null
          deep_brain_context_snapshot_id: string | null
          deep_library_availability: string
          deep_sources: Json
          deep_suggestions: Json
          deep_updated_at: string | null
          deep_warnings: Json
          id: string
          library_availability: string
          origin: string
          owner_id: string
          question: string
          sources: Json
          suggestions: Json
          thread_id: string
          warnings: Json
        }
        Insert: {
          action_completed_at?: string | null
          action_draft?: Json | null
          action_status?: string
          answer: string
          brain_context_snapshot_id: string
          client_id: string
          coach_mode?: string
          created_at?: string
          deep_answer?: string | null
          deep_brain_context_snapshot_id?: string | null
          deep_library_availability?: string
          deep_sources?: Json
          deep_suggestions?: Json
          deep_updated_at?: string | null
          deep_warnings?: Json
          id?: string
          library_availability?: string
          origin?: string
          owner_id: string
          question: string
          sources?: Json
          suggestions?: Json
          thread_id: string
          warnings?: Json
        }
        Update: {
          action_completed_at?: string | null
          action_draft?: Json | null
          action_status?: string
          answer?: string
          brain_context_snapshot_id?: string
          client_id?: string
          coach_mode?: string
          created_at?: string
          deep_answer?: string | null
          deep_brain_context_snapshot_id?: string | null
          deep_library_availability?: string
          deep_sources?: Json
          deep_suggestions?: Json
          deep_updated_at?: string | null
          deep_warnings?: Json
          id?: string
          library_availability?: string
          origin?: string
          owner_id?: string
          question?: string
          sources?: Json
          suggestions?: Json
          thread_id?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "coach_turns_brain_context_snapshot_id_fkey"
            columns: ["brain_context_snapshot_id"]
            isOneToOne: false
            referencedRelation: "brain_context_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_turns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_turns_deep_snapshot_tenant_fkey"
            columns: ["deep_brain_context_snapshot_id", "client_id"]
            isOneToOne: false
            referencedRelation: "brain_context_snapshots"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "coach_turns_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_turns_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "coach_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_turns_thread_owner_fkey"
            columns: ["thread_id", "client_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "coach_threads"
            referencedColumns: ["id", "client_id", "owner_id"]
          },
        ]
      }
      company_dna: {
        Row: {
          address: string | null
          approved_claims: string | null
          brand_voice: string | null
          business_goals: string | null
          channel_styles: Json
          client_id: string
          client_type: string | null
          company_description: string | null
          company_name: string | null
          content_style: string | null
          default_cta_style: string | null
          email: string | null
          emoji_policy: string | null
          extra: Json | null
          field_provenance: Json
          founders: string | null
          hard_rules: Json
          humour_policy: string | null
          id: string
          internal_rules: string | null
          location: string | null
          marketing_goals: string | null
          phone: string | null
          preferred_terms: string | null
          prohibited_claims: string | null
          prohibited_terms: string | null
          services: string | null
          sign_off: string | null
          social_links: Json
          spelling_locale: string | null
          target_demographic: string | null
          team: string | null
          tools_used: string | null
          updated_at: string | null
          values: string | null
          website: string | null
          website_content: string | null
        }
        Insert: {
          address?: string | null
          approved_claims?: string | null
          brand_voice?: string | null
          business_goals?: string | null
          channel_styles?: Json
          client_id: string
          client_type?: string | null
          company_description?: string | null
          company_name?: string | null
          content_style?: string | null
          default_cta_style?: string | null
          email?: string | null
          emoji_policy?: string | null
          extra?: Json | null
          field_provenance?: Json
          founders?: string | null
          hard_rules?: Json
          humour_policy?: string | null
          id?: string
          internal_rules?: string | null
          location?: string | null
          marketing_goals?: string | null
          phone?: string | null
          preferred_terms?: string | null
          prohibited_claims?: string | null
          prohibited_terms?: string | null
          services?: string | null
          sign_off?: string | null
          social_links?: Json
          spelling_locale?: string | null
          target_demographic?: string | null
          team?: string | null
          tools_used?: string | null
          updated_at?: string | null
          values?: string | null
          website?: string | null
          website_content?: string | null
        }
        Update: {
          address?: string | null
          approved_claims?: string | null
          brand_voice?: string | null
          business_goals?: string | null
          channel_styles?: Json
          client_id?: string
          client_type?: string | null
          company_description?: string | null
          company_name?: string | null
          content_style?: string | null
          default_cta_style?: string | null
          email?: string | null
          emoji_policy?: string | null
          extra?: Json | null
          field_provenance?: Json
          founders?: string | null
          hard_rules?: Json
          humour_policy?: string | null
          id?: string
          internal_rules?: string | null
          location?: string | null
          marketing_goals?: string | null
          phone?: string | null
          preferred_terms?: string | null
          prohibited_claims?: string | null
          prohibited_terms?: string | null
          services?: string | null
          sign_off?: string | null
          social_links?: Json
          spelling_locale?: string | null
          target_demographic?: string | null
          team?: string | null
          tools_used?: string | null
          updated_at?: string | null
          values?: string | null
          website?: string | null
          website_content?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_dna_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_capture_versions: {
        Row: {
          captured_at: string
          client_id: string
          competitor_id: string
          content_hash: string
          id: string
          item_id: string
          raw_content: string
          source_id: string
        }
        Insert: {
          captured_at?: string
          client_id: string
          competitor_id: string
          content_hash: string
          id?: string
          item_id: string
          raw_content: string
          source_id: string
        }
        Update: {
          captured_at?: string
          client_id?: string
          competitor_id?: string
          content_hash?: string
          id?: string
          item_id?: string
          raw_content?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_capture_versions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_capture_versions_item_id_source_id_competitor_i_fkey"
            columns: ["item_id", "source_id", "competitor_id", "client_id"]
            isOneToOne: false
            referencedRelation: "competitor_content_items"
            referencedColumns: ["id", "source_id", "competitor_id", "client_id"]
          },
        ]
      }
      competitor_content_items: {
        Row: {
          author: string | null
          canonical_url: string
          captured_at: string
          client_id: string
          competitor_id: string
          content_hash: string
          content_type: string
          first_seen_at: string
          id: string
          is_removed: boolean
          last_seen_at: string
          last_seen_generation: string | null
          metadata: Json
          platform: string
          published_at: string | null
          raw_content: string
          source_id: string
          title: string
        }
        Insert: {
          author?: string | null
          canonical_url: string
          captured_at?: string
          client_id: string
          competitor_id: string
          content_hash: string
          content_type?: string
          first_seen_at?: string
          id?: string
          is_removed?: boolean
          last_seen_at?: string
          last_seen_generation?: string | null
          metadata?: Json
          platform?: string
          published_at?: string | null
          raw_content: string
          source_id: string
          title: string
        }
        Update: {
          author?: string | null
          canonical_url?: string
          captured_at?: string
          client_id?: string
          competitor_id?: string
          content_hash?: string
          content_type?: string
          first_seen_at?: string
          id?: string
          is_removed?: boolean
          last_seen_at?: string
          last_seen_generation?: string | null
          metadata?: Json
          platform?: string
          published_at?: string | null
          raw_content?: string
          source_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_content_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_content_items_source_id_competitor_id_client_id_fkey"
            columns: ["source_id", "competitor_id", "client_id"]
            isOneToOne: false
            referencedRelation: "competitor_sources"
            referencedColumns: ["id", "competitor_id", "client_id"]
          },
        ]
      }
      competitor_crawl_jobs: {
        Row: {
          cancel_requested_at: string | null
          client_id: string
          competitor_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          generation_id: string
          id: string
          items_captured: number
          lease_token: string | null
          lease_until: string | null
          meta: Json
          next_result_url: string | null
          pages_discovered: number
          provider: string
          provider_complete: boolean
          provider_job_id: string | null
          source_id: string
          status: string
          updated_at: string
        }
        Insert: {
          cancel_requested_at?: string | null
          client_id: string
          competitor_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          generation_id?: string
          id?: string
          items_captured?: number
          lease_token?: string | null
          lease_until?: string | null
          meta?: Json
          next_result_url?: string | null
          pages_discovered?: number
          provider?: string
          provider_complete?: boolean
          provider_job_id?: string | null
          source_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancel_requested_at?: string | null
          client_id?: string
          competitor_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          generation_id?: string
          id?: string
          items_captured?: number
          lease_token?: string | null
          lease_until?: string | null
          meta?: Json
          next_result_url?: string | null
          pages_discovered?: number
          provider?: string
          provider_complete?: boolean
          provider_job_id?: string | null
          source_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_crawl_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_crawl_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_crawl_jobs_source_id_competitor_id_client_id_fkey"
            columns: ["source_id", "competitor_id", "client_id"]
            isOneToOne: false
            referencedRelation: "competitor_sources"
            referencedColumns: ["id", "competitor_id", "client_id"]
          },
        ]
      }
      competitor_crawl_pages: {
        Row: {
          client_id: string
          competitor_id: string
          created_at: string
          id: string
          job_id: string
          payload: Json
          processed_at: string | null
          provider_url: string
          source_id: string
        }
        Insert: {
          client_id: string
          competitor_id: string
          created_at?: string
          id?: string
          job_id: string
          payload: Json
          processed_at?: string | null
          provider_url: string
          source_id: string
        }
        Update: {
          client_id?: string
          competitor_id?: string
          created_at?: string
          id?: string
          job_id?: string
          payload?: Json
          processed_at?: string | null
          provider_url?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_crawl_pages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_crawl_pages_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "competitor_crawl_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_crawl_pages_source_id_competitor_id_client_id_fkey"
            columns: ["source_id", "competitor_id", "client_id"]
            isOneToOne: false
            referencedRelation: "competitor_sources"
            referencedColumns: ["id", "competitor_id", "client_id"]
          },
        ]
      }
      competitor_crawl_usage: {
        Row: {
          client_id: string
          crawls_started: number
          pages_captured: number
          pages_reserved: number
          updated_at: string
          usage_date: string
        }
        Insert: {
          client_id: string
          crawls_started?: number
          pages_captured?: number
          pages_reserved?: number
          updated_at?: string
          usage_date?: string
        }
        Update: {
          client_id?: string
          crawls_started?: number
          pages_captured?: number
          pages_reserved?: number
          updated_at?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_crawl_usage_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_intelligence_jobs: {
        Row: {
          client_id: string
          competitor_ids: string[]
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          id: string
          lease_token: string
          lease_until: string
          started_at: string
          status: string
          updated_at: string
          window_end: string
          window_start: string
        }
        Insert: {
          client_id: string
          competitor_ids: string[]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          lease_token?: string
          lease_until: string
          started_at?: string
          status?: string
          updated_at?: string
          window_end: string
          window_start: string
        }
        Update: {
          client_id?: string
          competitor_ids?: string[]
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          lease_token?: string
          lease_until?: string
          started_at?: string
          status?: string
          updated_at?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_intelligence_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_intelligence_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_intelligence_runs: {
        Row: {
          analysis: Json
          analysis_hash: string
          client_id: string
          company_evidence: Json
          competitor_ids: string[]
          created_at: string
          created_by: string | null
          fallback_date_count: number
          id: string
          job_id: string | null
          market_model_version: number
          model: string
          prompt_version: string
          schema_version: number
          source_character_count: number
          source_count: number
          source_evidence: Json
          source_item_ids: string[]
          status: string
          updated_at: string
          window_end: string
          window_start: string
        }
        Insert: {
          analysis: Json
          analysis_hash: string
          client_id: string
          company_evidence?: Json
          competitor_ids?: string[]
          created_at?: string
          created_by?: string | null
          fallback_date_count?: number
          id?: string
          job_id?: string | null
          market_model_version?: number
          model: string
          prompt_version?: string
          schema_version?: number
          source_character_count: number
          source_count: number
          source_evidence?: Json
          source_item_ids?: string[]
          status?: string
          updated_at?: string
          window_end: string
          window_start: string
        }
        Update: {
          analysis?: Json
          analysis_hash?: string
          client_id?: string
          company_evidence?: Json
          competitor_ids?: string[]
          created_at?: string
          created_by?: string | null
          fallback_date_count?: number
          id?: string
          job_id?: string | null
          market_model_version?: number
          model?: string
          prompt_version?: string
          schema_version?: number
          source_character_count?: number
          source_count?: number
          source_evidence?: Json
          source_item_ids?: string[]
          status?: string
          updated_at?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_intelligence_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_intelligence_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_intelligence_runs_job_fk"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "competitor_intelligence_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      competitor_sources: {
        Row: {
          client_id: string
          competitor_id: string
          content_count: number
          crawl_scope: string
          created_at: string
          created_by: string | null
          failure_count: number
          id: string
          last_crawled_at: string | null
          last_error: string | null
          last_success_at: string | null
          max_pages: number
          next_refresh_at: string | null
          normalized_url: string
          path_prefix: string | null
          platform: string
          refresh_cadence: string | null
          source_type: string
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          client_id: string
          competitor_id: string
          content_count?: number
          crawl_scope: string
          created_at?: string
          created_by?: string | null
          failure_count?: number
          id?: string
          last_crawled_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          max_pages?: number
          next_refresh_at?: string | null
          normalized_url: string
          path_prefix?: string | null
          platform?: string
          refresh_cadence?: string | null
          source_type: string
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          client_id?: string
          competitor_id?: string
          content_count?: number
          crawl_scope?: string
          created_at?: string
          created_by?: string | null
          failure_count?: number
          id?: string
          last_crawled_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          max_pages?: number
          next_refresh_at?: string | null
          normalized_url?: string
          path_prefix?: string | null
          platform?: string
          refresh_cadence?: string | null
          source_type?: string
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitor_sources_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitor_sources_competitor_id_client_id_fkey"
            columns: ["competitor_id", "client_id"]
            isOneToOne: false
            referencedRelation: "competitors"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "competitor_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      competitors: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          refresh_cadence: string
          status: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          refresh_cadence?: string
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          refresh_cadence?: string
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competitors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_analysis_attempts: {
        Row: {
          actor_id: string | null
          analysis_kind: string
          client_id: string
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost_usd: number
          id: string
          input_summary: Json
          input_tokens: number
          lease_token: string
          lease_until: string
          model: string | null
          output_tokens: number
          provider: string | null
          related_id: string | null
          result_summary: Json
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          analysis_kind: string
          client_id: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number
          id?: string
          input_summary?: Json
          input_tokens?: number
          lease_token?: string
          lease_until?: string
          model?: string | null
          output_tokens?: number
          provider?: string | null
          related_id?: string | null
          result_summary?: Json
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          analysis_kind?: string
          client_id?: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          estimated_cost_usd?: number
          id?: string
          input_summary?: Json
          input_tokens?: number
          lease_token?: string
          lease_until?: string
          model?: string | null
          output_tokens?: number
          provider?: string | null
          related_id?: string | null
          result_summary?: Json
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_analysis_attempts_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_analysis_attempts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      content_campaign_events: {
        Row: {
          actor_id: string | null
          campaign_id: string
          client_id: string
          created_at: string
          event_type: string
          from_status: string | null
          id: string
          metadata: Json
          slot_id: string | null
          to_status: string | null
        }
        Insert: {
          actor_id?: string | null
          campaign_id: string
          client_id: string
          created_at?: string
          event_type: string
          from_status?: string | null
          id?: string
          metadata?: Json
          slot_id?: string | null
          to_status?: string | null
        }
        Update: {
          actor_id?: string | null
          campaign_id?: string
          client_id?: string
          created_at?: string
          event_type?: string
          from_status?: string | null
          id?: string
          metadata?: Json
          slot_id?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_campaign_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_campaign_events_campaign_client_fkey"
            columns: ["campaign_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_campaigns"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "content_campaign_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_campaign_events_slot_client_fkey"
            columns: ["slot_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_campaign_slots"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      content_campaign_slots: {
        Row: {
          assigned_to: string | null
          audience: string | null
          call_to_action: string | null
          campaign_id: string
          channel: string
          client_id: string
          created_at: string
          created_by: string | null
          desired_format: string | null
          id: string
          idea_snapshot: Json
          notes: string | null
          objective: string | null
          project_id: string | null
          provenance_snapshot: Json
          published_at: string | null
          scheduled_date: string
          scheduled_time: string | null
          status: string
          timezone: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          audience?: string | null
          call_to_action?: string | null
          campaign_id: string
          channel: string
          client_id: string
          created_at?: string
          created_by?: string | null
          desired_format?: string | null
          id?: string
          idea_snapshot?: Json
          notes?: string | null
          objective?: string | null
          project_id?: string | null
          provenance_snapshot?: Json
          published_at?: string | null
          scheduled_date: string
          scheduled_time?: string | null
          status?: string
          timezone?: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          audience?: string | null
          call_to_action?: string | null
          campaign_id?: string
          channel?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          desired_format?: string | null
          id?: string
          idea_snapshot?: Json
          notes?: string | null
          objective?: string | null
          project_id?: string | null
          provenance_snapshot?: Json
          published_at?: string | null
          scheduled_date?: string
          scheduled_time?: string | null
          status?: string
          timezone?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_campaign_slots_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_campaign_slots_campaign_client_fkey"
            columns: ["campaign_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_campaigns"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "content_campaign_slots_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_campaign_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_campaign_slots_project_client_fkey"
            columns: ["project_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "content_campaign_slots_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_campaigns: {
        Row: {
          audience: string | null
          channels: string[]
          client_id: string
          core_message: string | null
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          name: string
          objective: string
          start_date: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: string | null
          channels?: string[]
          client_id: string
          core_message?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name: string
          objective?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: string | null
          channels?: string[]
          client_id?: string
          core_message?: string | null
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          name?: string
          objective?: string
          start_date?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_campaigns_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_editorial_events: {
        Row: {
          after_body: string | null
          after_title: string | null
          analysis: Json
          before_body: string | null
          before_title: string | null
          client_id: string
          created_at: string
          created_by: string | null
          edit_origin: string
          event_type: string
          id: string
          piece_id: string
          project_id: string | null
        }
        Insert: {
          after_body?: string | null
          after_title?: string | null
          analysis?: Json
          before_body?: string | null
          before_title?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          edit_origin: string
          event_type: string
          id?: string
          piece_id: string
          project_id?: string | null
        }
        Update: {
          after_body?: string | null
          after_title?: string | null
          analysis?: Json
          before_body?: string | null
          before_title?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          edit_origin?: string
          event_type?: string
          id?: string
          piece_id?: string
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_editorial_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_editorial_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_editorial_events_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_editorial_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      content_golden_examples: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          body: string
          channel: string
          client_id: string
          content_hash: string
          content_type: string
          created_at: string
          created_by: string | null
          evaluation_permission: boolean
          id: string
          published_at: string | null
          represents_brand_strongly: boolean
          source_url: string | null
          status: string
          structural_traits: string[]
          title: string
          updated_at: string
          updated_by: string | null
          vocabulary_preferences: string[]
          voice_traits: string[]
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          body: string
          channel: string
          client_id: string
          content_hash: string
          content_type: string
          created_at?: string
          created_by?: string | null
          evaluation_permission?: boolean
          id?: string
          published_at?: string | null
          represents_brand_strongly?: boolean
          source_url?: string | null
          status?: string
          structural_traits?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
          vocabulary_preferences?: string[]
          voice_traits?: string[]
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          body?: string
          channel?: string
          client_id?: string
          content_hash?: string
          content_type?: string
          created_at?: string
          created_by?: string | null
          evaluation_permission?: boolean
          id?: string
          published_at?: string | null
          represents_brand_strongly?: boolean
          source_url?: string | null
          status?: string
          structural_traits?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
          vocabulary_preferences?: string[]
          voice_traits?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "content_golden_examples_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_golden_examples_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_golden_examples_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_golden_examples_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_piece_revisions: {
        Row: {
          body: string | null
          client_id: string
          content_brief: Json
          content_type: string
          created_at: string
          created_by: string | null
          id: string
          piece_id: string
          reason: string
          revision_number: number
          source_references: Json
          style_snapshot: Json
          title: string
        }
        Insert: {
          body?: string | null
          client_id: string
          content_brief?: Json
          content_type: string
          created_at?: string
          created_by?: string | null
          id?: string
          piece_id: string
          reason?: string
          revision_number: number
          source_references?: Json
          style_snapshot?: Json
          title: string
        }
        Update: {
          body?: string | null
          client_id?: string
          content_brief?: Json
          content_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          piece_id?: string
          reason?: string
          revision_number?: number
          source_references?: Json
          style_snapshot?: Json
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_piece_revisions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_piece_revisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_piece_revisions_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pieces: {
        Row: {
          ai_original: string | null
          body: string | null
          brain_context_snapshot_id: string | null
          brief: string | null
          client_id: string
          content_brief: Json
          content_type: string
          created_at: string | null
          created_by: string | null
          generation_kind: string
          id: string
          outcome: string | null
          outcome_at: string | null
          parent_piece_id: string | null
          project_id: string | null
          revision_reason: string | null
          source_references: Json
          status: string | null
          style_snapshot: Json
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_original?: string | null
          body?: string | null
          brain_context_snapshot_id?: string | null
          brief?: string | null
          client_id: string
          content_brief?: Json
          content_type: string
          created_at?: string | null
          created_by?: string | null
          generation_kind?: string
          id?: string
          outcome?: string | null
          outcome_at?: string | null
          parent_piece_id?: string | null
          project_id?: string | null
          revision_reason?: string | null
          source_references?: Json
          status?: string | null
          style_snapshot?: Json
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_original?: string | null
          body?: string | null
          brain_context_snapshot_id?: string | null
          brief?: string | null
          client_id?: string
          content_brief?: Json
          content_type?: string
          created_at?: string | null
          created_by?: string | null
          generation_kind?: string
          id?: string
          outcome?: string | null
          outcome_at?: string | null
          parent_piece_id?: string | null
          project_id?: string | null
          revision_reason?: string | null
          source_references?: Json
          status?: string | null
          style_snapshot?: Json
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_pieces_brain_context_snapshot_id_fkey"
            columns: ["brain_context_snapshot_id"]
            isOneToOne: false
            referencedRelation: "brain_context_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pieces_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pieces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pieces_parent_piece_id_fkey"
            columns: ["parent_piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pieces_project_client_fkey"
            columns: ["project_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      content_pilot_feedback: {
        Row: {
          client_id: string
          created_at: string
          differentiation_quality: number
          id: string
          idea_usefulness: number
          notes: string | null
          piece_id: string | null
          project_id: string
          reviewer_id: string
          source_trust: number
          updated_at: string
          voice_accuracy: number
          workflow_ease: number
        }
        Insert: {
          client_id: string
          created_at?: string
          differentiation_quality: number
          id?: string
          idea_usefulness: number
          notes?: string | null
          piece_id?: string | null
          project_id: string
          reviewer_id: string
          source_trust: number
          updated_at?: string
          voice_accuracy: number
          workflow_ease: number
        }
        Update: {
          client_id?: string
          created_at?: string
          differentiation_quality?: number
          id?: string
          idea_usefulness?: number
          notes?: string | null
          piece_id?: string | null
          project_id?: string
          reviewer_id?: string
          source_trust?: number
          updated_at?: string
          voice_accuracy?: number
          workflow_ease?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_pilot_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pilot_feedback_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pilot_feedback_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pilot_feedback_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_project_validations: {
        Row: {
          checks: Json
          client_id: string
          dna_updated_at: string
          id: string
          passed: boolean
          piece_id: string
          piece_updated_at: string
          project_id: string
          validated_at: string
          validated_by: string | null
        }
        Insert: {
          checks?: Json
          client_id: string
          dna_updated_at: string
          id?: string
          passed: boolean
          piece_id: string
          piece_updated_at: string
          project_id: string
          validated_at?: string
          validated_by?: string | null
        }
        Update: {
          checks?: Json
          client_id?: string
          dna_updated_at?: string
          id?: string
          passed?: boolean
          piece_id?: string
          piece_updated_at?: string
          project_id?: string
          validated_at?: string
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_project_validations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_project_validations_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_project_validations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_project_validations_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_projects: {
        Row: {
          brain_context_snapshot_id: string | null
          client_id: string
          competitor_signals: Json
          content_brief: Json
          created_at: string
          created_by: string | null
          current_piece_id: string | null
          current_step: string
          generation_lease_token: string | null
          generation_lease_until: string | null
          id: string
          idea_snapshot: Json
          last_error_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_generation_warnings: Json
          last_operation: string | null
          quick_create_key: string | null
          quick_create_request_hash: string | null
          status: string
          style_snapshot: Json
          title: string
          updated_at: string
          vault_source_ids: string[]
          vault_source_references: Json
        }
        Insert: {
          brain_context_snapshot_id?: string | null
          client_id: string
          competitor_signals?: Json
          content_brief?: Json
          created_at?: string
          created_by?: string | null
          current_piece_id?: string | null
          current_step?: string
          generation_lease_token?: string | null
          generation_lease_until?: string | null
          id?: string
          idea_snapshot?: Json
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_generation_warnings?: Json
          last_operation?: string | null
          quick_create_key?: string | null
          quick_create_request_hash?: string | null
          status?: string
          style_snapshot?: Json
          title: string
          updated_at?: string
          vault_source_ids?: string[]
          vault_source_references?: Json
        }
        Update: {
          brain_context_snapshot_id?: string | null
          client_id?: string
          competitor_signals?: Json
          content_brief?: Json
          created_at?: string
          created_by?: string | null
          current_piece_id?: string | null
          current_step?: string
          generation_lease_token?: string | null
          generation_lease_until?: string | null
          id?: string
          idea_snapshot?: Json
          last_error_at?: string | null
          last_error_code?: string | null
          last_error_message?: string | null
          last_generation_warnings?: Json
          last_operation?: string | null
          quick_create_key?: string | null
          quick_create_request_hash?: string | null
          status?: string
          style_snapshot?: Json
          title?: string
          updated_at?: string
          vault_source_ids?: string[]
          vault_source_references?: Json
        }
        Relationships: [
          {
            foreignKeyName: "content_projects_brain_context_snapshot_id_fkey"
            columns: ["brain_context_snapshot_id"]
            isOneToOne: false
            referencedRelation: "brain_context_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_projects_current_piece_client_fkey"
            columns: ["current_piece_id", "client_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      content_style_analyses: {
        Row: {
          analysed_at: string | null
          analysis: Json
          approved_at: string | null
          approved_by: string | null
          channel: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          model: string | null
          source_character_count: number
          source_count: number
          source_evidence: Json
          source_item_ids: string[]
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          analysed_at?: string | null
          analysis?: Json
          approved_at?: string | null
          approved_by?: string | null
          channel: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string | null
          source_character_count?: number
          source_count?: number
          source_evidence?: Json
          source_item_ids?: string[]
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          analysed_at?: string | null
          analysis?: Json
          approved_at?: string | null
          approved_by?: string | null
          channel?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          model?: string | null
          source_character_count?: number
          source_count?: number
          source_evidence?: Json
          source_item_ids?: string[]
          status?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_style_analyses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_style_analyses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_style_analyses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_style_analyses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_topics: {
        Row: {
          ai_fit_score: number | null
          ai_flagged: boolean
          approved_at: string | null
          approved_by: string | null
          brain_context_snapshot_id: string | null
          client_id: string
          content_type: string
          created_at: string | null
          created_by: string | null
          description: string | null
          flag_reason: string | null
          flagged: boolean
          id: string
          status: string
          title: string
          updated_at: string | null
          why: Json | null
        }
        Insert: {
          ai_fit_score?: number | null
          ai_flagged?: boolean
          approved_at?: string | null
          approved_by?: string | null
          brain_context_snapshot_id?: string | null
          client_id: string
          content_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          status?: string
          title: string
          updated_at?: string | null
          why?: Json | null
        }
        Update: {
          ai_fit_score?: number | null
          ai_flagged?: boolean
          approved_at?: string | null
          approved_by?: string | null
          brain_context_snapshot_id?: string | null
          client_id?: string
          content_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          status?: string
          title?: string
          updated_at?: string | null
          why?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "content_topics_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_topics_brain_context_snapshot_id_fkey"
            columns: ["brain_context_snapshot_id"]
            isOneToOne: false
            referencedRelation: "brain_context_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_topics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_topics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      content_voice_evaluations: {
        Row: {
          assignment: Json
          automated_evaluation: Json
          brief: Json
          channel: string
          client_id: string
          created_at: string
          created_by: string | null
          error: string | null
          golden_example_ids: string[]
          id: string
          model: string | null
          preferred_variant: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          style_analysis_id: string | null
          updated_at: string
          variant_a: string | null
          variant_b: string | null
        }
        Insert: {
          assignment?: Json
          automated_evaluation?: Json
          brief: Json
          channel: string
          client_id: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          golden_example_ids?: string[]
          id?: string
          model?: string | null
          preferred_variant?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          style_analysis_id?: string | null
          updated_at?: string
          variant_a?: string | null
          variant_b?: string | null
        }
        Update: {
          assignment?: Json
          automated_evaluation?: Json
          brief?: Json
          channel?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          error?: string | null
          golden_example_ids?: string[]
          id?: string
          model?: string | null
          preferred_variant?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string
          style_analysis_id?: string | null
          updated_at?: string
          variant_a?: string | null
          variant_b?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_voice_evaluations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_voice_evaluations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_voice_evaluations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_voice_evaluations_style_analysis_id_fkey"
            columns: ["style_analysis_id"]
            isOneToOne: false
            referencedRelation: "content_style_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      content_workflow_events: {
        Row: {
          actor_id: string | null
          client_id: string
          created_at: string
          event_type: string
          id: string
          metadata: Json
          piece_id: string | null
          project_id: string | null
          workflow_stage: string | null
        }
        Insert: {
          actor_id?: string | null
          client_id: string
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          piece_id?: string | null
          project_id?: string | null
          workflow_stage?: string | null
        }
        Update: {
          actor_id?: string | null
          client_id?: string
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          piece_id?: string | null
          project_id?: string | null
          workflow_stage?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_workflow_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_workflow_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_workflow_events_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_workflow_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      crawl_jobs: {
        Row: {
          client_id: string
          created_at: string | null
          created_by: string | null
          dossier_item_id: string | null
          error: string | null
          firecrawl_id: string | null
          id: string
          items_created: number
          lease_token: string | null
          lease_until: string | null
          meta: Json
          page_cap: number
          pages_done: number
          pages_dropped: number
          pages_total: number
          products_seen: number
          status: string
          tokens_used: number
          updated_at: string | null
          url: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          created_by?: string | null
          dossier_item_id?: string | null
          error?: string | null
          firecrawl_id?: string | null
          id?: string
          items_created?: number
          lease_token?: string | null
          lease_until?: string | null
          meta?: Json
          page_cap?: number
          pages_done?: number
          pages_dropped?: number
          pages_total?: number
          products_seen?: number
          status?: string
          tokens_used?: number
          updated_at?: string | null
          url: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          dossier_item_id?: string | null
          error?: string | null
          firecrawl_id?: string | null
          id?: string
          items_created?: number
          lease_token?: string | null
          lease_until?: string | null
          meta?: Json
          page_cap?: number
          pages_done?: number
          pages_dropped?: number
          pages_total?: number
          products_seen?: number
          status?: string
          tokens_used?: number
          updated_at?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "crawl_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crawl_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          archived_at: string | null
          client_id: string
          company: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          first_name: string
          id: string
          job_title: string | null
          last_name: string | null
          notes: string | null
          phone: string | null
          source: string | null
          status: string | null
          tags: string[] | null
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          client_id: string
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          first_name: string
          id?: string
          job_title?: string | null
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          company?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          first_name?: string
          id?: string
          job_title?: string | null
          last_name?: string | null
          notes?: string | null
          phone?: string | null
          source?: string | null
          status?: string | null
          tags?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_events: {
        Row: {
          body: string
          client_id: string
          contact_id: string
          created_at: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          body: string
          client_id: string
          contact_id: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          body?: string
          client_id?: string
          contact_id?: string
          created_at?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_events_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_notes: {
        Row: {
          body: string
          client_id: string
          contact_id: string
          created_at: string | null
          created_by: string | null
          id: string
        }
        Insert: {
          body: string
          client_id: string
          contact_id: string
          created_at?: string | null
          created_by?: string | null
          id?: string
        }
        Update: {
          body?: string
          client_id?: string
          contact_id?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cron_heartbeats: {
        Row: {
          detail: Json
          name: string
          ran_at: string
        }
        Insert: {
          detail?: Json
          name: string
          ran_at?: string
        }
        Update: {
          detail?: Json
          name?: string
          ran_at?: string
        }
        Relationships: []
      }
      daily_log_notes: {
        Row: {
          body: string
          client_id: string
          created_at: string | null
          id: string
          log_id: string
          user_id: string
        }
        Insert: {
          body: string
          client_id: string
          created_at?: string | null
          id?: string
          log_id: string
          user_id: string
        }
        Update: {
          body?: string
          client_id?: string
          created_at?: string | null
          id?: string
          log_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_log_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_log_notes_log_id_fkey"
            columns: ["log_id"]
            isOneToOne: false
            referencedRelation: "daily_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_log_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logs: {
        Row: {
          admin_feedback: string | null
          challenges: string | null
          client_id: string
          goals_achieved: string | null
          goals_tomorrow: string | null
          id: string
          log_date: string
          mood: string | null
          positives: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          tasks_done: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_feedback?: string | null
          challenges?: string | null
          client_id: string
          goals_achieved?: string | null
          goals_tomorrow?: string | null
          id?: string
          log_date: string
          mood?: string | null
          positives?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          tasks_done?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_feedback?: string | null
          challenges?: string | null
          client_id?: string
          goals_achieved?: string | null
          goals_tomorrow?: string | null
          id?: string
          log_date?: string
          mood?: string | null
          positives?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          tasks_done?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_learning_suggestions: {
        Row: {
          after_excerpt: string
          before_excerpt: string
          classification: string
          client_id: string
          confidence: number
          created_at: string
          created_by: string | null
          dimensions: string[]
          event_id: string
          explanation: string
          id: string
          lesson_content: string
          memory_id: string | null
          piece_id: string
          project_id: string | null
          proposed_outcome: string
          proposed_scope: Json
          reviewed_at: string | null
          reviewed_by: string | null
          signal_id: string | null
          status: string
          summary: string
          updated_at: string
        }
        Insert: {
          after_excerpt?: string
          before_excerpt?: string
          classification: string
          client_id: string
          confidence?: number
          created_at?: string
          created_by?: string | null
          dimensions?: string[]
          event_id: string
          explanation: string
          id?: string
          lesson_content: string
          memory_id?: string | null
          piece_id: string
          project_id?: string | null
          proposed_outcome: string
          proposed_scope?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          signal_id?: string | null
          status?: string
          summary: string
          updated_at?: string
        }
        Update: {
          after_excerpt?: string
          before_excerpt?: string
          classification?: string
          client_id?: string
          confidence?: number
          created_at?: string
          created_by?: string | null
          dimensions?: string[]
          event_id?: string
          explanation?: string
          id?: string
          lesson_content?: string
          memory_id?: string | null
          piece_id?: string
          project_id?: string | null
          proposed_outcome?: string
          proposed_scope?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          signal_id?: string | null
          status?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "editorial_learning_suggestions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_learning_suggestions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_learning_suggestions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "content_editorial_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_learning_suggestions_memory_id_fkey"
            columns: ["memory_id"]
            isOneToOne: false
            referencedRelation: "brain_memory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_learning_suggestions_piece_id_fkey"
            columns: ["piece_id"]
            isOneToOne: false
            referencedRelation: "content_pieces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_learning_suggestions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "content_projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_learning_suggestions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_learning_suggestions_signal_id_fkey"
            columns: ["signal_id"]
            isOneToOne: false
            referencedRelation: "brain_signals"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          archived_at: string | null
          cadence: string
          category: string
          created_at: string | null
          created_by: string | null
          currency: string
          id: string
          name: string
          next_due_date: string | null
          notes: string | null
          owner_id: string | null
          started_on: string | null
          status: string
          updated_at: string | null
          url: string | null
          vendor: string | null
        }
        Insert: {
          amount?: number
          archived_at?: string | null
          cadence?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          id?: string
          name: string
          next_due_date?: string | null
          notes?: string | null
          owner_id?: string | null
          started_on?: string | null
          status?: string
          updated_at?: string | null
          url?: string | null
          vendor?: string | null
        }
        Update: {
          amount?: number
          archived_at?: string | null
          cadence?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          id?: string
          name?: string
          next_due_date?: string | null
          notes?: string | null
          owner_id?: string | null
          started_on?: string | null
          status?: string
          updated_at?: string | null
          url?: string | null
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_videos: {
        Row: {
          loom_url: string
          slug: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          loom_url: string
          slug: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          loom_url?: string
          slug?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_videos_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      golden_questions: {
        Row: {
          client_id: string
          created_at: string | null
          created_by: string | null
          history: Json
          id: string
          last_checked_at: string | null
          last_status: string | null
          question: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          created_by?: string | null
          history?: Json
          id?: string
          last_checked_at?: string | null
          last_status?: string | null
          question: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          history?: Json
          id?: string
          last_checked_at?: string | null
          last_status?: string | null
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "golden_questions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "golden_questions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guides: {
        Row: {
          data: Json
          key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data: Json
          key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guides_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_log: {
        Row: {
          action: string
          actor_id: string
          created_at: string | null
          id: string
          target_email: string | null
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string | null
          id?: string
          target_email?: string | null
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string | null
          id?: string
          target_email?: string | null
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_log_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_entries: {
        Row: {
          answer: string
          category: string | null
          client_id: string
          fts: unknown
          generated_at: string | null
          id: string
          is_pinned: boolean
          question: string
          source_vault_ids: string[] | null
        }
        Insert: {
          answer: string
          category?: string | null
          client_id: string
          fts?: unknown
          generated_at?: string | null
          id?: string
          is_pinned?: boolean
          question: string
          source_vault_ids?: string[] | null
        }
        Update: {
          answer?: string
          category?: string | null
          client_id?: string
          fts?: unknown
          generated_at?: string | null
          id?: string
          is_pinned?: boolean
          question?: string
          source_vault_ids?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_generation_runs: {
        Row: {
          client_id: string
          completed_at: string | null
          entries_generated: number | null
          error_message: string | null
          id: string
          started_at: string | null
          status: string | null
          tokens_used: number | null
          triggered_by: string | null
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          entries_generated?: number | null
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          tokens_used?: number | null
          triggered_by?: string | null
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          entries_generated?: number | null
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string | null
          tokens_used?: number | null
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kb_generation_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kb_generation_runs_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_events: {
        Row: {
          body: string
          created_at: string | null
          id: string
          kind: string
          lead_id: string
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          kind?: string
          lead_id: string
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          kind?: string
          lead_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          archived_at: string | null
          company: string | null
          contact_name: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          name: string
          next_action: string | null
          next_action_date: string | null
          notes: string | null
          owner_id: string | null
          phone: string | null
          sort_order: number
          source: string | null
          stage: string
          updated_at: string | null
          value: number | null
        }
        Insert: {
          archived_at?: string | null
          company?: string | null
          contact_name?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          sort_order?: number
          source?: string | null
          stage?: string
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          archived_at?: string | null
          company?: string | null
          contact_name?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          next_action?: string | null
          next_action_date?: string | null
          notes?: string | null
          owner_id?: string | null
          phone?: string | null
          sort_order?: number
          source?: string | null
          stage?: string
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          audience: string
          body: string
          client_id: string
          created_at: string
          id: string
          read_by: string[]
          sender_id: string
          sender_name: string
          sender_role: string
        }
        Insert: {
          audience?: string
          body: string
          client_id: string
          created_at?: string
          id?: string
          read_by?: string[]
          sender_id: string
          sender_name?: string
          sender_role: string
        }
        Update: {
          audience?: string
          body?: string
          client_id?: string
          created_at?: string
          id?: string
          read_by?: string[]
          sender_id?: string
          sender_name?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notebook_activity: {
        Row: {
          actor_role: string
          created_at: string | null
          event: string
          id: string
          placement_id: string
        }
        Insert: {
          actor_role: string
          created_at?: string | null
          event: string
          id?: string
          placement_id: string
        }
        Update: {
          actor_role?: string
          created_at?: string | null
          event?: string
          id?: string
          placement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notebook_activity_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
        ]
      }
      notebook_page_revisions: {
        Row: {
          content: Json
          created_at: string | null
          edited_by: string | null
          id: string
          page_id: string
          title: string
        }
        Insert: {
          content: Json
          created_at?: string | null
          edited_by?: string | null
          id?: string
          page_id: string
          title: string
        }
        Update: {
          content?: Json
          created_at?: string | null
          edited_by?: string | null
          id?: string
          page_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notebook_page_revisions_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notebook_page_revisions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "notebook_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      notebook_pages: {
        Row: {
          content: Json
          created_at: string | null
          created_by: string | null
          id: string
          is_archived: boolean
          last_edited_by: string | null
          parent_page_id: string | null
          placement_id: string
          sort_order: number
          title: string
          updated_at: string | null
        }
        Insert: {
          content?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_archived?: boolean
          last_edited_by?: string | null
          parent_page_id?: string | null
          placement_id: string
          sort_order?: number
          title?: string
          updated_at?: string | null
        }
        Update: {
          content?: Json
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_archived?: boolean
          last_edited_by?: string | null
          parent_page_id?: string | null
          placement_id?: string
          sort_order?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notebook_pages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notebook_pages_last_edited_by_fkey"
            columns: ["last_edited_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notebook_pages_parent_page_id_fkey"
            columns: ["parent_page_id"]
            isOneToOne: false
            referencedRelation: "notebook_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notebook_pages_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          client_id: string | null
          created_at: string | null
          href: string | null
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          client_id?: string | null
          created_at?: string | null
          href?: string | null
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          client_id?: string | null
          created_at?: string | null
          href?: string | null
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      placements: {
        Row: {
          client_id: string
          client_user_id: string
          created_at: string | null
          id: string
          status: string
          updated_at: string | null
          va_user_id: string
        }
        Insert: {
          client_id: string
          client_user_id: string
          created_at?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          va_user_id: string
        }
        Update: {
          client_id?: string
          client_user_id?: string
          created_at?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          va_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "placements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_client_user_id_fkey"
            columns: ["client_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_va_user_id_fkey"
            columns: ["va_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_campaign_leads: {
        Row: {
          campaign_id: string
          client_id: string
          crm_contact_id: string | null
          discovered_at: string
          id: string
          job_id: string
          last_seen_at: string
          prospect_id: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          client_id: string
          crm_contact_id?: string | null
          discovered_at?: string
          id?: string
          job_id: string
          last_seen_at?: string
          prospect_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          client_id?: string
          crm_contact_id?: string | null
          discovered_at?: string
          id?: string
          job_id?: string
          last_seen_at?: string
          prospect_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_campaign_leads_campaign_id_client_id_fkey"
            columns: ["campaign_id", "client_id"]
            isOneToOne: false
            referencedRelation: "prospecting_campaigns"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "prospecting_campaign_leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_campaign_leads_crm_contact_id_fkey"
            columns: ["crm_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_campaign_leads_job_id_client_id_fkey"
            columns: ["job_id", "client_id"]
            isOneToOne: false
            referencedRelation: "prospecting_jobs"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "prospecting_campaign_leads_prospect_id_client_id_fkey"
            columns: ["prospect_id", "client_id"]
            isOneToOne: false
            referencedRelation: "prospecting_prospects"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      prospecting_campaigns: {
        Row: {
          archived_at: string | null
          client_id: string
          country_code: string
          created_at: string
          created_by: string | null
          id: string
          language_code: string
          last_job_id: string | null
          locations: string[]
          max_results: number
          name: string
          queries: string[]
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          client_id: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          language_code?: string
          last_job_id?: string | null
          locations?: string[]
          max_results?: number
          name: string
          queries: string[]
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          country_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          language_code?: string
          last_job_id?: string | null
          locations?: string[]
          max_results?: number
          name?: string
          queries?: string[]
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_campaigns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_campaigns_last_job_id_fkey"
            columns: ["last_job_id"]
            isOneToOne: false
            referencedRelation: "prospecting_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_jobs: {
        Row: {
          actor_build_id: string | null
          actor_dataset_id: string | null
          actor_id: string
          actor_run_id: string | null
          adapter_version: number
          campaign_id: string
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_results: number
          deduplicated_results: number
          error_code: string | null
          error_message: string | null
          id: string
          lease_token: string | null
          lease_until: string | null
          max_charge_usd: number
          provider_status: string | null
          requested_results: number
          returned_results: number
          source: string
          status: string
          updated_at: string
          usage_total_usd: number | null
        }
        Insert: {
          actor_build_id?: string | null
          actor_dataset_id?: string | null
          actor_id: string
          actor_run_id?: string | null
          adapter_version: number
          campaign_id: string
          client_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_results?: number
          deduplicated_results?: number
          error_code?: string | null
          error_message?: string | null
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          max_charge_usd: number
          provider_status?: string | null
          requested_results: number
          returned_results?: number
          source: string
          status?: string
          updated_at?: string
          usage_total_usd?: number | null
        }
        Update: {
          actor_build_id?: string | null
          actor_dataset_id?: string | null
          actor_id?: string
          actor_run_id?: string | null
          adapter_version?: number
          campaign_id?: string
          client_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_results?: number
          deduplicated_results?: number
          error_code?: string | null
          error_message?: string | null
          id?: string
          lease_token?: string | null
          lease_until?: string | null
          max_charge_usd?: number
          provider_status?: string | null
          requested_results?: number
          returned_results?: number
          source?: string
          status?: string
          updated_at?: string
          usage_total_usd?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_jobs_campaign_id_client_id_fkey"
            columns: ["campaign_id", "client_id"]
            isOneToOne: false
            referencedRelation: "prospecting_campaigns"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "prospecting_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospecting_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_prospects: {
        Row: {
          actor_build_id: string | null
          actor_id: string
          actor_run_id: string | null
          adapter_version: number
          address: string | null
          canonical_key: string
          captured_at: string
          client_id: string
          company_name: string | null
          country_code: string | null
          created_at: string
          dedupe_keys: string[]
          description: string | null
          email: string | null
          employee_count: number | null
          first_seen_at: string
          id: string
          industry: string | null
          job_title: string | null
          kind: string
          last_seen_at: string
          latitude: number | null
          linkedin_url: string | null
          locality: string | null
          longitude: number | null
          person_name: string | null
          phone: string | null
          rating: number | null
          raw_payload: Json
          region: string | null
          review_count: number | null
          source: string
          source_url: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          actor_build_id?: string | null
          actor_id: string
          actor_run_id?: string | null
          adapter_version: number
          address?: string | null
          canonical_key: string
          captured_at: string
          client_id: string
          company_name?: string | null
          country_code?: string | null
          created_at?: string
          dedupe_keys: string[]
          description?: string | null
          email?: string | null
          employee_count?: number | null
          first_seen_at?: string
          id?: string
          industry?: string | null
          job_title?: string | null
          kind: string
          last_seen_at?: string
          latitude?: number | null
          linkedin_url?: string | null
          locality?: string | null
          longitude?: number | null
          person_name?: string | null
          phone?: string | null
          rating?: number | null
          raw_payload?: Json
          region?: string | null
          review_count?: number | null
          source: string
          source_url?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          actor_build_id?: string | null
          actor_id?: string
          actor_run_id?: string | null
          adapter_version?: number
          address?: string | null
          canonical_key?: string
          captured_at?: string
          client_id?: string
          company_name?: string | null
          country_code?: string | null
          created_at?: string
          dedupe_keys?: string[]
          description?: string | null
          email?: string | null
          employee_count?: number | null
          first_seen_at?: string
          id?: string
          industry?: string | null
          job_title?: string | null
          kind?: string
          last_seen_at?: string
          latitude?: number | null
          linkedin_url?: string | null
          locality?: string | null
          longitude?: number | null
          person_name?: string | null
          phone?: string | null
          rating?: number | null
          raw_payload?: Json
          region?: string | null
          review_count?: number | null
          source?: string
          source_url?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_prospects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      prospecting_usage: {
        Row: {
          client_id: string
          reported_cost_usd: number
          results_reserved: number
          results_returned: number
          runs_started: number
          updated_at: string
          usage_date: string
        }
        Insert: {
          client_id: string
          reported_cost_usd?: number
          results_reserved?: number
          results_returned?: number
          runs_started?: number
          updated_at?: string
          usage_date?: string
        }
        Update: {
          client_id?: string
          reported_cost_usd?: number
          results_reserved?: number
          results_returned?: number
          runs_started?: number
          updated_at?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospecting_usage_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_migrations: {
        Row: {
          applied_at: string
          version: string
        }
        Insert: {
          applied_at?: string
          version: string
        }
        Update: {
          applied_at?: string
          version?: string
        }
        Relationships: []
      }
      sop_access: {
        Row: {
          created_at: string | null
          sop_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          sop_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          sop_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_access_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_categories: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          kind: string
          name: string
          parent: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          kind: string
          name: string
          parent?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          kind?: string
          name?: string
          parent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_categories_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_runs: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          sop_id: string
          sop_version: number | null
          status: string
          steps_done: number
          steps_total: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          sop_id: string
          sop_version?: number | null
          status?: string
          steps_done?: number
          steps_total?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          sop_id?: string
          sop_version?: number | null
          status?: string
          steps_done?: number
          steps_total?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_runs_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_suggestions: {
        Row: {
          category: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          scope: string | null
          status: string
          step_count: number | null
          title: string
        }
        Insert: {
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          scope?: string | null
          status?: string
          step_count?: number | null
          title: string
        }
        Update: {
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          scope?: string | null
          status?: string
          step_count?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_suggestions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_suggestions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      sops: {
        Row: {
          body: string
          category: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          forked_from: string | null
          forked_version: number | null
          fts: unknown
          id: string
          intro: string | null
          order_index: number | null
          prerequisites: string[] | null
          steps: Json | null
          subcategory: string | null
          title: string
          updated_at: string | null
          version: number
          visibility: string
        }
        Insert: {
          body?: string
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          forked_from?: string | null
          forked_version?: number | null
          fts?: unknown
          id?: string
          intro?: string | null
          order_index?: number | null
          prerequisites?: string[] | null
          steps?: Json | null
          subcategory?: string | null
          title: string
          updated_at?: string | null
          version?: number
          visibility?: string
        }
        Update: {
          body?: string
          category?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          forked_from?: string | null
          forked_version?: number | null
          fts?: unknown
          id?: string
          intro?: string | null
          order_index?: number | null
          prerequisites?: string[] | null
          steps?: Json | null
          subcategory?: string | null
          title?: string
          updated_at?: string | null
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "sops_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sops_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sops_forked_from_fkey"
            columns: ["forked_from"]
            isOneToOne: false
            referencedRelation: "sops"
            referencedColumns: ["id"]
          },
        ]
      }
      task_categories: {
        Row: {
          client_id: string
          color: string
          created_at: string | null
          id: string
          name: string
          order_index: number
        }
        Insert: {
          client_id: string
          color?: string
          created_at?: string | null
          id?: string
          name: string
          order_index?: number
        }
        Update: {
          client_id?: string
          color?: string
          created_at?: string | null
          id?: string
          name?: string
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_categories_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      task_events: {
        Row: {
          body: string
          client_id: string
          created_at: string | null
          id: string
          kind: string
          task_id: string
          user_id: string | null
        }
        Insert: {
          body: string
          client_id: string
          created_at?: string | null
          id?: string
          kind: string
          task_id: string
          user_id?: string | null
        }
        Update: {
          body?: string
          client_id?: string
          created_at?: string | null
          id?: string
          kind?: string
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      task_recurrences: {
        Row: {
          active: boolean
          assigned_to: string | null
          category_id: string | null
          client_id: string
          created_at: string | null
          created_by: string | null
          description: string
          frequency: string
          id: string
          interval: number
          last_spawned_at: string | null
          next_run_on: string
          priority: number
          title: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          assigned_to?: string | null
          category_id?: string | null
          client_id: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          frequency: string
          id?: string
          interval?: number
          last_spawned_at?: string | null
          next_run_on: string
          priority?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          assigned_to?: string | null
          category_id?: string | null
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          description?: string
          frequency?: string
          id?: string
          interval?: number
          last_spawned_at?: string | null
          next_run_on?: string
          priority?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_recurrences_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_recurrences_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "task_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_recurrences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_recurrences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          archived_at: string | null
          assigned_to: string | null
          category_id: string | null
          client_id: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string
          due_date: string | null
          id: string
          order_index: number
          priority: number
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          assigned_to?: string | null
          category_id?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          order_index?: number
          priority?: number
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          assigned_to?: string | null
          category_id?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          order_index?: number
          priority?: number
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "task_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          category: string | null
          client_id: string
          created_at: string | null
          ended_at: string | null
          id: string
          is_manual: boolean | null
          notes: string | null
          phase: string
          started_at: string
          user_id: string
          work_date: string
        }
        Insert: {
          category?: string | null
          client_id: string
          created_at?: string | null
          ended_at?: string | null
          id?: string
          is_manual?: boolean | null
          notes?: string | null
          phase: string
          started_at: string
          user_id: string
          work_date: string
        }
        Update: {
          category?: string | null
          client_id?: string
          created_at?: string | null
          ended_at?: string | null
          id?: string
          is_manual?: boolean | null
          notes?: string | null
          phase?: string
          started_at?: string
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_runs: {
        Row: {
          brain_context_snapshot_id: string | null
          client_id: string
          created_at: string | null
          id: string
          input_summary: string | null
          output: Json | null
          tokens_used: number
          tool: string
          user_id: string | null
        }
        Insert: {
          brain_context_snapshot_id?: string | null
          client_id: string
          created_at?: string | null
          id?: string
          input_summary?: string | null
          output?: Json | null
          tokens_used?: number
          tool: string
          user_id?: string | null
        }
        Update: {
          brain_context_snapshot_id?: string | null
          client_id?: string
          created_at?: string | null
          id?: string
          input_summary?: string | null
          output?: Json | null
          tokens_used?: number
          tool?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tool_runs_brain_context_snapshot_id_fkey"
            columns: ["brain_context_snapshot_id"]
            isOneToOne: false
            referencedRelation: "brain_context_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tool_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          address: string | null
          avatar_url: string | null
          birthday: string | null
          client_id: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          notification_prefs: Json
          payment_details: string | null
          payment_terms: string | null
          personal_email: string | null
          phone: string | null
          role: string
          salary: number | null
          skills: string[] | null
          timezone: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          avatar_url?: string | null
          birthday?: string | null
          client_id?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          notification_prefs?: Json
          payment_details?: string | null
          payment_terms?: string | null
          personal_email?: string | null
          phone?: string | null
          role: string
          salary?: number | null
          skills?: string[] | null
          timezone?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          avatar_url?: string | null
          birthday?: string | null
          client_id?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          notification_prefs?: Json
          payment_details?: string | null
          payment_terms?: string | null
          personal_email?: string | null
          phone?: string | null
          role?: string
          salary?: number | null
          skills?: string[] | null
          timezone?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      va_days_worked: {
        Row: {
          client_id: string | null
          created_at: string
          hours: number | null
          id: string
          note: string | null
          user_id: string
          work_date: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          hours?: number | null
          id?: string
          note?: string | null
          user_id: string
          work_date: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          hours?: number | null
          id?: string
          note?: string | null
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "va_days_worked_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "va_days_worked_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      va_issues: {
        Row: {
          category: string
          client_id: string | null
          created_at: string
          detail: string
          id: string
          status: string
          subject: string
          user_id: string
        }
        Insert: {
          category?: string
          client_id?: string | null
          created_at?: string
          detail: string
          id?: string
          status?: string
          subject: string
          user_id: string
        }
        Update: {
          category?: string
          client_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          status?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "va_issues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "va_issues_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      va_job_contracts: {
        Row: {
          annual_leave_days: number | null
          client_id: string | null
          contract_name: string | null
          contract_path: string | null
          currency: string
          next_review_date: string | null
          notice_period: string | null
          pay_period: string
          payment_method: string | null
          payment_schedule: string | null
          rate: number | null
          start_date: string | null
          updated_at: string
          updated_by: string | null
          user_id: string
          weekly_hours: number | null
        }
        Insert: {
          annual_leave_days?: number | null
          client_id?: string | null
          contract_name?: string | null
          contract_path?: string | null
          currency?: string
          next_review_date?: string | null
          notice_period?: string | null
          pay_period?: string
          payment_method?: string | null
          payment_schedule?: string | null
          rate?: number | null
          start_date?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id: string
          weekly_hours?: number | null
        }
        Update: {
          annual_leave_days?: number | null
          client_id?: string | null
          contract_name?: string | null
          contract_path?: string | null
          currency?: string
          next_review_date?: string | null
          notice_period?: string | null
          pay_period?: string
          payment_method?: string | null
          payment_schedule?: string | null
          rate?: number | null
          start_date?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          weekly_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "va_job_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "va_job_contracts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "va_job_contracts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      va_leave_requests: {
        Row: {
          client_id: string | null
          created_at: string
          end_date: string
          id: string
          leave_type: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          user_id: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          end_date: string
          id?: string
          leave_type?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          user_id: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          end_date?: string
          id?: string
          leave_type?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "va_leave_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "va_leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "va_leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      va_self_reports: {
        Row: {
          challenges: string | null
          client_id: string | null
          created_at: string
          delivered: string | null
          goals: string | null
          id: string
          report_month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          challenges?: string | null
          client_id?: string | null
          created_at?: string
          delivered?: string | null
          goals?: string | null
          id?: string
          report_month: string
          updated_at?: string
          user_id: string
        }
        Update: {
          challenges?: string | null
          client_id?: string | null
          created_at?: string
          delivered?: string | null
          goals?: string | null
          id?: string
          report_month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "va_self_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "va_self_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_analyses: {
        Row: {
          client_id: string
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          model: string | null
          source_url: string | null
          tokens_used: number
          updated_at: string | null
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          model?: string | null
          source_url?: string | null
          tokens_used?: number
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          model?: string | null
          source_url?: string | null
          tokens_used?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_analyses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_analyses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_chunks: {
        Row: {
          chunk_index: number
          client_id: string
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          item_id: string
        }
        Insert: {
          chunk_index: number
          client_id: string
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          item_id: string
        }
        Update: {
          chunk_index?: number
          client_id?: string
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_chunks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_chunks_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vault_items"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_feedback: {
        Row: {
          answer: string
          client_id: string
          created_at: string | null
          id: string
          question: string
          rating: number
          resolved: boolean
          sources: Json
          user_id: string | null
        }
        Insert: {
          answer: string
          client_id: string
          created_at?: string | null
          id?: string
          question: string
          rating: number
          resolved?: boolean
          sources?: Json
          user_id?: string | null
        }
        Update: {
          answer?: string
          client_id?: string
          created_at?: string | null
          id?: string
          question?: string
          rating?: number
          resolved?: boolean
          sources?: Json
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_item_versions: {
        Row: {
          authority_level: string
          captured_at: string
          captured_by: string | null
          client_id: string
          conflict_note: string | null
          content_hash: string | null
          has_conflict: boolean
          id: string
          item_id: string
          knowledge_status: string
          raw_content: string | null
          review_due_at: string | null
          source_url: string | null
          supersedes_item_id: string | null
          time_sensitive: boolean
          title: string
          valid_from: string | null
          valid_until: string | null
          version_number: number
        }
        Insert: {
          authority_level: string
          captured_at?: string
          captured_by?: string | null
          client_id: string
          conflict_note?: string | null
          content_hash?: string | null
          has_conflict: boolean
          id?: string
          item_id: string
          knowledge_status: string
          raw_content?: string | null
          review_due_at?: string | null
          source_url?: string | null
          supersedes_item_id?: string | null
          time_sensitive: boolean
          title: string
          valid_from?: string | null
          valid_until?: string | null
          version_number: number
        }
        Update: {
          authority_level?: string
          captured_at?: string
          captured_by?: string | null
          client_id?: string
          conflict_note?: string | null
          content_hash?: string | null
          has_conflict?: boolean
          id?: string
          item_id?: string
          knowledge_status?: string
          raw_content?: string | null
          review_due_at?: string | null
          source_url?: string | null
          supersedes_item_id?: string | null
          time_sensitive?: boolean
          title?: string
          valid_from?: string | null
          valid_until?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "vault_item_versions_captured_by_fkey"
            columns: ["captured_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_item_versions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_item_versions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "vault_items"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_items: {
        Row: {
          ai_summary: string | null
          authority_level: string
          category: string | null
          client_id: string
          conflict_note: string | null
          content_hash: string | null
          created_at: string | null
          created_by: string | null
          error_message: string | null
          evidence_role: string
          fts: unknown
          has_conflict: boolean
          id: string
          index_error: string | null
          indexed_at: string | null
          knowledge_status: string
          meta_curated: boolean
          origin_key: string | null
          raw_content: string | null
          review_due_at: string | null
          source_type: string
          source_url: string | null
          status: string | null
          storage_path: string | null
          supersedes_item_id: string | null
          tags: string[]
          time_sensitive: boolean
          title: string
          updated_at: string | null
          updated_by: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          ai_summary?: string | null
          authority_level?: string
          category?: string | null
          client_id: string
          conflict_note?: string | null
          content_hash?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          evidence_role?: string
          fts?: unknown
          has_conflict?: boolean
          id?: string
          index_error?: string | null
          indexed_at?: string | null
          knowledge_status?: string
          meta_curated?: boolean
          origin_key?: string | null
          raw_content?: string | null
          review_due_at?: string | null
          source_type: string
          source_url?: string | null
          status?: string | null
          storage_path?: string | null
          supersedes_item_id?: string | null
          tags?: string[]
          time_sensitive?: boolean
          title: string
          updated_at?: string | null
          updated_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          ai_summary?: string | null
          authority_level?: string
          category?: string | null
          client_id?: string
          conflict_note?: string | null
          content_hash?: string | null
          created_at?: string | null
          created_by?: string | null
          error_message?: string | null
          evidence_role?: string
          fts?: unknown
          has_conflict?: boolean
          id?: string
          index_error?: string | null
          indexed_at?: string | null
          knowledge_status?: string
          meta_curated?: boolean
          origin_key?: string | null
          raw_content?: string | null
          review_due_at?: string | null
          source_type?: string
          source_url?: string | null
          status?: string | null
          storage_path?: string | null
          supersedes_item_id?: string | null
          tags?: string[]
          time_sensitive?: boolean
          title?: string
          updated_at?: string | null
          updated_by?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_supersedes_item_id_fkey"
            columns: ["supersedes_item_id"]
            isOneToOne: false
            referencedRelation: "vault_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      vault_queries: {
        Row: {
          answered: boolean
          brain_gap_id: string | null
          client_id: string
          created_at: string | null
          dismissed: boolean
          gap_importance: string
          gap_key: string | null
          gap_status: string
          id: string
          mode: string
          owner_id: string | null
          question: string
          recommended_source: string | null
          resolved_at: string | null
          resolved_by: string | null
          resolved_by_kb_entry_id: string | null
          resolved_by_vault_item_id: string | null
          retention_until: string | null
          sources_count: number
          user_id: string | null
          visibility: string
        }
        Insert: {
          answered?: boolean
          brain_gap_id?: string | null
          client_id: string
          created_at?: string | null
          dismissed?: boolean
          gap_importance?: string
          gap_key?: string | null
          gap_status?: string
          id?: string
          mode?: string
          owner_id?: string | null
          question: string
          recommended_source?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_kb_entry_id?: string | null
          resolved_by_vault_item_id?: string | null
          retention_until?: string | null
          sources_count?: number
          user_id?: string | null
          visibility?: string
        }
        Update: {
          answered?: boolean
          brain_gap_id?: string | null
          client_id?: string
          created_at?: string | null
          dismissed?: boolean
          gap_importance?: string
          gap_key?: string | null
          gap_status?: string
          id?: string
          mode?: string
          owner_id?: string | null
          question?: string
          recommended_source?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_by_kb_entry_id?: string | null
          resolved_by_vault_item_id?: string | null
          retention_until?: string | null
          sources_count?: number
          user_id?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "vault_queries_brain_gap_id_fkey"
            columns: ["brain_gap_id"]
            isOneToOne: false
            referencedRelation: "brain_knowledge_gaps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_queries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_queries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_queries_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_queries_resolved_by_kb_entry_id_fkey"
            columns: ["resolved_by_kb_entry_id"]
            isOneToOne: false
            referencedRelation: "kb_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_queries_resolved_by_vault_item_id_fkey"
            columns: ["resolved_by_vault_item_id"]
            isOneToOne: false
            referencedRelation: "vault_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vault_queries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_client_overview: {
        Args: never
        Returns: {
          client_created_at: string
          client_id: string
          client_name: string
          done_recently: number
          has_dossier: boolean
          last_activity: string
          open_tasks: number
          user_count: number
          va_count: number
          vas_logged: number
          vault_error: number
          vault_ready: number
          vault_total: number
        }[]
      }
      approve_content_style_analysis: {
        Args: { p_actor_id: string; p_analysis_id: string; p_client_id: string }
        Returns: {
          analysed_at: string | null
          analysis: Json
          approved_at: string | null
          approved_by: string | null
          channel: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          model: string | null
          source_character_count: number
          source_count: number
          source_evidence: Json
          source_item_ids: string[]
          status: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "content_style_analyses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_editorial_learning_suggestion: {
        Args: {
          p_actor_id: string
          p_client_id: string
          p_scope?: Json
          p_suggestion_id: string
        }
        Returns: {
          after_excerpt: string
          before_excerpt: string
          classification: string
          client_id: string
          confidence: number
          created_at: string
          created_by: string | null
          dimensions: string[]
          event_id: string
          explanation: string
          id: string
          lesson_content: string
          memory_id: string | null
          piece_id: string
          project_id: string | null
          proposed_outcome: string
          proposed_scope: Json
          reviewed_at: string | null
          reviewed_by: string | null
          signal_id: string | null
          status: string
          summary: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "editorial_learning_suggestions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      brain_memory_scope_matches: {
        Args: {
          p_audience?: string
          p_channel?: string
          p_content_type?: string
          p_objective?: string
          p_scope: Json
          p_surface: string
        }
        Returns: boolean
      }
      calculate_fatality_risk: { Args: { p_inputs: Json }; Returns: Json }
      checkpoint_competitor_crawl_job: {
        Args: {
          p_error_message?: string
          p_items_captured?: number
          p_job_id: string
          p_lease_token: string
          p_meta?: Json
          p_pages_discovered?: number
          p_status: string
        }
        Returns: {
          cancel_requested_at: string | null
          client_id: string
          competitor_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          generation_id: string
          id: string
          items_captured: number
          lease_token: string | null
          lease_until: string | null
          meta: Json
          next_result_url: string | null
          pages_discovered: number
          provider: string
          provider_complete: boolean
          provider_job_id: string | null
          source_id: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "competitor_crawl_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      checkpoint_prospecting_job: {
        Args: {
          p_actor_build_id?: string
          p_actor_dataset_id?: string
          p_actor_run_id?: string
          p_error_code?: string
          p_error_message?: string
          p_job_id: string
          p_lease_token: string
          p_provider_status?: string
          p_status: string
          p_usage_total_usd?: number
        }
        Returns: {
          actor_build_id: string | null
          actor_dataset_id: string | null
          actor_id: string
          actor_run_id: string | null
          adapter_version: number
          campaign_id: string
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_results: number
          deduplicated_results: number
          error_code: string | null
          error_message: string | null
          id: string
          lease_token: string | null
          lease_until: string | null
          max_charge_usd: number
          provider_status: string | null
          requested_results: number
          returned_results: number
          source: string
          status: string
          updated_at: string
          usage_total_usd: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "prospecting_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_brain_signals: {
        Args: {
          p_client_id: string
          p_lease_seconds?: number
          p_limit?: number
          p_min_signals?: number
        }
        Returns: {
          artifact_id: string | null
          artifact_text: string
          channel: string | null
          client_id: string
          content_type: string | null
          context: Json
          created_at: string
          dimensions: string[]
          distill_claim_token: string | null
          distill_claim_until: string | null
          distilled_at: string | null
          editorial_event_id: string | null
          id: string
          learning_intent: string
          rating: number
          reason: string | null
          resolved: boolean
          retention_until: string | null
          surface: string
          user_id: string | null
          visibility: string
        }[]
        SetofOptions: {
          from: "*"
          to: "brain_signals"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_competitor_crawl_job: {
        Args: { p_job_id: string; p_lease_seconds?: number }
        Returns: {
          cancel_requested_at: string | null
          client_id: string
          competitor_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          generation_id: string
          id: string
          items_captured: number
          lease_token: string | null
          lease_until: string | null
          meta: Json
          next_result_url: string | null
          pages_discovered: number
          provider: string
          provider_complete: boolean
          provider_job_id: string | null
          source_id: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "competitor_crawl_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_content_project_generation: {
        Args: {
          p_actor_id: string
          p_client_id: string
          p_lease_seconds?: number
          p_project_id: string
        }
        Returns: {
          lease_token: string
          lease_until: string
        }[]
      }
      claim_crawl_job: {
        Args: { p_job_id: string; p_lease_seconds?: number }
        Returns: {
          client_id: string
          created_at: string | null
          created_by: string | null
          dossier_item_id: string | null
          error: string | null
          firecrawl_id: string | null
          id: string
          items_created: number
          lease_token: string | null
          lease_until: string | null
          meta: Json
          page_cap: number
          pages_done: number
          pages_dropped: number
          pages_total: number
          products_seen: number
          status: string
          tokens_used: number
          updated_at: string | null
          url: string
        }[]
        SetofOptions: {
          from: "*"
          to: "crawl_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_due_coach_check_ins: {
        Args: { p_limit?: number }
        Returns: {
          check_in_claim_token: string | null
          check_in_claimed_until: string | null
          check_in_interval_days: number | null
          client_id: string
          commitment: string
          completed_at: string | null
          created_at: string
          due_date: string | null
          goal_id: string | null
          id: string
          last_check_in_at: string | null
          next_check_in_at: string | null
          owner_id: string
          reminder_count: number
          retention_until: string | null
          source_turn_id: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "coach_commitments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_prospecting_job: {
        Args: {
          p_client_id: string
          p_job_id: string
          p_lease_seconds?: number
        }
        Returns: {
          actor_build_id: string | null
          actor_dataset_id: string | null
          actor_id: string
          actor_run_id: string | null
          adapter_version: number
          campaign_id: string
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_results: number
          deduplicated_results: number
          error_code: string | null
          error_message: string | null
          id: string
          lease_token: string | null
          lease_until: string | null
          max_charge_usd: number
          provider_status: string | null
          requested_results: number
          returned_results: number
          source: string
          status: string
          updated_at: string
          usage_total_usd: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "prospecting_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      commit_brain_distillation: {
        Args: {
          p_claim_token: string
          p_client_id: string
          p_operations: Json
          p_signal_ids: string[]
        }
        Returns: Json
      }
      commit_competitor_crawl_page: {
        Args: {
          p_author: string
          p_canonical_url: string
          p_content_hash: string
          p_content_type: string
          p_job_id: string
          p_lease_token: string
          p_metadata?: Json
          p_page_id: string
          p_platform: string
          p_published_at: string
          p_raw_content: string
          p_title: string
        }
        Returns: string
      }
      commit_content_piece_rewrite: {
        Args: {
          p_actor_id: string
          p_body: string
          p_client_id: string
          p_content_brief: Json
          p_expected_updated_at: string
          p_piece_id: string
          p_reason: string
          p_source_references: Json
          p_style_snapshot: Json
        }
        Returns: {
          ai_original: string | null
          body: string | null
          brain_context_snapshot_id: string | null
          brief: string | null
          client_id: string
          content_brief: Json
          content_type: string
          created_at: string | null
          created_by: string | null
          generation_kind: string
          id: string
          outcome: string | null
          outcome_at: string | null
          parent_piece_id: string | null
          project_id: string | null
          revision_reason: string | null
          source_references: Json
          status: string | null
          style_snapshot: Json
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "content_pieces"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      competitor_intelligence_evidence: {
        Args: {
          p_client_id: string
          p_competitor_ids: string[]
          p_limit_per_competitor?: number
          p_window_end: string
          p_window_start: string
        }
        Returns: {
          canonical_url: string
          capture_version_id: string
          captured_at: string
          competitor_id: string
          content_hash: string
          content_type: string
          date_basis: string
          effective_at: string
          id: string
          platform: string
          published_at: string
          raw_content: string
          title: string
        }[]
      }
      competitor_intelligence_readiness: {
        Args: { p_client_id: string }
        Returns: {
          article_count: number
          captured_items: number
          collectable_source_count: number
          competitor_id: string
          content_characters: number
          distinct_platforms: number
          latest_capture: string
          readiness_score: number
          ready: boolean
          social_post_count: number
          source_count: number
        }[]
      }
      complete_coach_check_in: {
        Args: {
          p_claim_token: string
          p_commitment_id: string
          p_delivered: boolean
        }
        Returns: boolean
      }
      complete_competitor_intelligence_job: {
        Args: {
          p_analysis: Json
          p_company_evidence: Json
          p_job_id: string
          p_lease_token: string
          p_model: string
          p_source_character_count: number
          p_source_evidence: Json
        }
        Returns: {
          analysis: Json
          analysis_hash: string
          client_id: string
          company_evidence: Json
          competitor_ids: string[]
          created_at: string
          created_by: string | null
          fallback_date_count: number
          id: string
          job_id: string | null
          market_model_version: number
          model: string
          prompt_version: string
          schema_version: number
          source_character_count: number
          source_count: number
          source_evidence: Json
          source_item_ids: string[]
          status: string
          updated_at: string
          window_end: string
          window_start: string
        }
        SetofOptions: {
          from: "*"
          to: "competitor_intelligence_runs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      content_analysis_total_cost: {
        Args: { p_client_id: string }
        Returns: number
      }
      content_campaign_project_status: {
        Args: { p_project_status: string; p_project_step: string }
        Returns: string
      }
      content_contains_phrase: {
        Args: { p_body: string; p_phrase: string }
        Returns: boolean
      }
      content_project_validation_is_current: {
        Args: { p_client_id: string; p_piece_id: string; p_project_id: string }
        Returns: boolean
      }
      create_coach_commitment: {
        Args: {
          p_check_in_date?: string
          p_client_id: string
          p_commitment: string
          p_due_date?: string
          p_goal_id?: string
          p_owner_id: string
          p_source_turn_id?: string
        }
        Returns: Json
      }
      create_coach_goal: {
        Args: {
          p_client_id: string
          p_outcome?: string
          p_owner_id: string
          p_source_turn_id?: string
          p_target_date?: string
          p_title: string
        }
        Returns: Json
      }
      create_coach_memory: {
        Args: {
          p_client_id: string
          p_content: string
          p_kind: string
          p_owner_id: string
          p_source_turn_id?: string
        }
        Returns: Json
      }
      create_competitor_crawl_job: {
        Args: {
          p_client_id: string
          p_competitor_id: string
          p_created_by: string
          p_daily_crawl_limit?: number
          p_daily_page_limit?: number
          p_pages_requested: number
          p_source_id: string
        }
        Returns: {
          cancel_requested_at: string | null
          client_id: string
          competitor_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          generation_id: string
          id: string
          items_captured: number
          lease_token: string | null
          lease_until: string | null
          meta: Json
          next_result_url: string | null
          pages_discovered: number
          provider: string
          provider_complete: boolean
          provider_job_id: string | null
          source_id: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "competitor_crawl_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_competitor_with_source: {
        Args: {
          p_actor_id: string
          p_client_id: string
          p_crawl_scope: string
          p_description: string
          p_max_pages: number
          p_name: string
          p_normalized_url: string
          p_path_prefix: string
          p_platform: string
          p_refresh_cadence: string
          p_source_status: string
          p_source_type: string
          p_website_url: string
        }
        Returns: string
      }
      create_content_project_derived_draft: {
        Args: {
          p_actor_id: string
          p_body: string
          p_client_id: string
          p_content_brief: Json
          p_content_type: string
          p_generation_kind: string
          p_parent_piece_id: string
          p_project_id: string
          p_source_references: Json
          p_style_snapshot: Json
          p_title: string
        }
        Returns: {
          ai_original: string | null
          body: string | null
          brain_context_snapshot_id: string | null
          brief: string | null
          client_id: string
          content_brief: Json
          content_type: string
          created_at: string | null
          created_by: string | null
          generation_kind: string
          id: string
          outcome: string | null
          outcome_at: string | null
          parent_piece_id: string | null
          project_id: string | null
          revision_reason: string | null
          source_references: Json
          status: string | null
          style_snapshot: Json
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "content_pieces"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_content_project_draft: {
        Args: {
          p_actor_id: string
          p_body: string
          p_client_id: string
          p_content_brief: Json
          p_content_type: string
          p_generation_kind?: string
          p_generation_lease_token?: string
          p_parent_piece_id?: string
          p_project_id: string
          p_source_references: Json
          p_style_snapshot: Json
          p_title: string
        }
        Returns: {
          ai_original: string | null
          body: string | null
          brain_context_snapshot_id: string | null
          brief: string | null
          client_id: string
          content_brief: Json
          content_type: string
          created_at: string | null
          created_by: string | null
          generation_kind: string
          id: string
          outcome: string | null
          outcome_at: string | null
          parent_piece_id: string | null
          project_id: string | null
          revision_reason: string | null
          source_references: Json
          status: string | null
          style_snapshot: Json
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "content_pieces"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      current_user_client_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      dashboard_stats: { Args: never; Returns: Json }
      decay_brain_memories: { Args: { p_client_id: string }; Returns: number }
      deliver_coach_check_in: {
        Args: {
          p_claim_token: string
          p_commitment_id: string
          p_message?: string
        }
        Returns: boolean
      }
      execute_coach_action: {
        Args: {
          p_action: Json
          p_client_id: string
          p_idempotency_key: string
          p_owner_id: string
          p_snapshot_id: string
          p_turn_id: string
        }
        Returns: Json
      }
      execute_coach_memory_action: {
        Args: {
          p_action: Json
          p_client_id: string
          p_idempotency_key: string
          p_owner_id: string
          p_snapshot_id: string
          p_turn_id: string
        }
        Returns: Json
      }
      execute_coach_progress_action: {
        Args: {
          p_action: Json
          p_client_id: string
          p_idempotency_key: string
          p_owner_id: string
          p_snapshot_id: string
          p_turn_id: string
        }
        Returns: Json
      }
      expire_stale_content_analysis_attempts: { Args: never; Returns: number }
      fail_competitor_intelligence_job:
        | {
            Args: {
              p_error_message: string
              p_job_id: string
              p_lease_token: string
            }
            Returns: boolean
          }
        | {
            Args: {
              p_error_code: string
              p_error_message: string
              p_job_id: string
              p_lease_token: string
            }
            Returns: boolean
          }
      finalize_competitor_crawl_job: {
        Args: {
          p_authoritative: boolean
          p_job_id: string
          p_lease_token: string
          p_next_refresh_at: string
        }
        Returns: {
          cancel_requested_at: string | null
          client_id: string
          competitor_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          generation_id: string
          id: string
          items_captured: number
          lease_token: string | null
          lease_until: string | null
          meta: Json
          next_result_url: string | null
          pages_discovered: number
          provider: string
          provider_complete: boolean
          provider_job_id: string | null
          source_id: string
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "competitor_crawl_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      finish_content_analysis_attempt: {
        Args: {
          p_attempt_id: string
          p_error_code?: string
          p_error_message?: string
          p_estimated_cost_usd?: number
          p_input_tokens?: number
          p_lease_token: string
          p_model?: string
          p_output_tokens?: number
          p_provider?: string
          p_related_id?: string
          p_result_summary?: Json
          p_status: string
        }
        Returns: {
          actor_id: string | null
          analysis_kind: string
          client_id: string
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          estimated_cost_usd: number
          id: string
          input_summary: Json
          input_tokens: number
          lease_token: string
          lease_until: string
          model: string | null
          output_tokens: number
          provider: string | null
          related_id: string | null
          result_summary: Json
          started_at: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "content_analysis_attempts"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_interaction_multiplier: {
        Args: { p_factor_name_1: string; p_factor_name_2: string }
        Returns: number
      }
      get_risk_multiplier: {
        Args: { p_factor_names: string[] }
        Returns: number
      }
      health_schema_check: { Args: never; Returns: Json }
      health_vault_tallies: {
        Args: never
        Returns: {
          client_id: string
          errored: number
          indexed: number
          ready: number
          total: number
        }[]
      }
      ingest_prospecting_job_results: {
        Args: {
          p_job_id: string
          p_lease_token: string
          p_results: Json
          p_usage_total_usd?: number
        }
        Returns: {
          actor_build_id: string | null
          actor_dataset_id: string | null
          actor_id: string
          actor_run_id: string | null
          adapter_version: number
          campaign_id: string
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_results: number
          deduplicated_results: number
          error_code: string | null
          error_message: string | null
          id: string
          lease_token: string | null
          lease_until: string | null
          max_charge_usd: number
          provider_status: string | null
          requested_results: number
          returned_results: number
          source: string
          status: string
          updated_at: string
          usage_total_usd: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "prospecting_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      match_brain_memories: {
        Args: {
          p_audience?: string
          p_channel?: string
          p_client_id: string
          p_content_type?: string
          p_limit?: number
          p_objective?: string
          p_query_embedding: string
          p_surface: string
        }
        Returns: {
          confidence: number
          content: string
          id: string
          kind: string
          pinned: boolean
          rank_score: number
          scope: Json
          scope_specificity: number
          selection_reason: string
          semantic_relevance: number
          source_count: number
        }[]
      }
      match_business_library_chunks: {
        Args: {
          p_audience?: string
          p_channel?: string
          p_match_count?: number
          p_query: string
        }
        Returns: {
          category: string
          chunk_id: string
          content: string
          entry_id: string
          rank: number
          source_url: string
          summary: string
          tags: string[]
          title: string
          version_id: string
          version_number: number
        }[]
      }
      match_business_library_chunks_hybrid: {
        Args: {
          p_audience?: string
          p_channel?: string
          p_coach_role?: string
          p_match_count?: number
          p_query: string
          p_query_embedding: string
        }
        Returns: {
          category: string
          chunk_id: string
          content: string
          entry_id: string
          rank: number
          retrieval_method: string
          source_url: string
          summary: string
          tags: string[]
          title: string
          version_id: string
          version_number: number
        }[]
      }
      match_vault_chunks: {
        Args: {
          p_client_id: string
          p_match_count?: number
          p_query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          id: string
          item_id: string
          similarity: number
        }[]
      }
      normalise_vault_gap_key: { Args: { p_question: string }; Returns: string }
      notebook_actor_role: { Args: { p_placement: string }; Returns: string }
      notebook_is_participant: {
        Args: { p_placement: string }
        Returns: boolean
      }
      notebook_page_is_participant: {
        Args: { p_page: string }
        Returns: boolean
      }
      prepare_quick_content_project: {
        Args: {
          p_actor_id: string
          p_client_id: string
          p_content_brief: Json
          p_idea: Json
          p_idempotency_key: string
          p_request_hash: string
          p_style_snapshot: Json
          p_title: string
          p_vault_source_ids: string[]
          p_vault_source_references: Json
        }
        Returns: {
          brain_context_snapshot_id: string | null
          client_id: string
          competitor_signals: Json
          content_brief: Json
          created_at: string
          created_by: string | null
          current_piece_id: string | null
          current_step: string
          generation_lease_token: string | null
          generation_lease_until: string | null
          id: string
          idea_snapshot: Json
          last_error_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_generation_warnings: Json
          last_operation: string | null
          quick_create_key: string | null
          quick_create_request_hash: string | null
          status: string
          style_snapshot: Json
          title: string
          updated_at: string
          vault_source_ids: string[]
          vault_source_references: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "content_projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      promote_content_campaign_slot: {
        Args: { p_actor_id: string; p_client_id: string; p_slot_id: string }
        Returns: {
          brain_context_snapshot_id: string | null
          client_id: string
          competitor_signals: Json
          content_brief: Json
          created_at: string
          created_by: string | null
          current_piece_id: string | null
          current_step: string
          generation_lease_token: string | null
          generation_lease_until: string | null
          id: string
          idea_snapshot: Json
          last_error_at: string | null
          last_error_code: string | null
          last_error_message: string | null
          last_generation_warnings: Json
          last_operation: string | null
          quick_create_key: string | null
          quick_create_request_hash: string | null
          status: string
          style_snapshot: Json
          title: string
          updated_at: string
          vault_source_ids: string[]
          vault_source_references: Json
        }[]
        SetofOptions: {
          from: "*"
          to: "content_projects"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      promote_prospecting_lead_to_crm: {
        Args: {
          p_actor_id: string
          p_campaign_lead_id: string
          p_client_id: string
        }
        Returns: string
      }
      purge_expired_coach_private_data: { Args: never; Returns: number }
      question_analytics: {
        Args: { p_role_id?: string }
        Returns: {
          correct: number
          question_id: string
          total: number
        }[]
      }
      record_coach_question_metric: {
        Args: {
          p_answer_mode: string
          p_answered: boolean
          p_client_id: string
          p_coach_role: string
          p_timezone?: string
        }
        Returns: undefined
      }
      record_content_project_validation: {
        Args: {
          p_actor_id: string
          p_checks: Json
          p_client_id: string
          p_expected_piece_updated_at: string
          p_passed: boolean
          p_piece_id: string
          p_project_id: string
        }
        Returns: {
          checks: Json
          client_id: string
          dna_updated_at: string
          id: string
          passed: boolean
          piece_id: string
          piece_updated_at: string
          project_id: string
          validated_at: string
          validated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "content_project_validations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      record_meaningful_brain_event: {
        Args: {
          p_artifact_id?: string
          p_channel?: string
          p_client_id: string
          p_event_key?: string
          p_event_type: string
          p_meta?: Json
          p_summary: string
        }
        Returns: string
      }
      refresh_aggregates: { Args: never; Returns: undefined }
      release_brain_signal_claim: {
        Args: { p_claim_token: string; p_client_id: string }
        Returns: number
      }
      release_content_project_generation: {
        Args: {
          p_actor_id: string
          p_client_id: string
          p_lease_token: string
          p_project_id: string
        }
        Returns: boolean
      }
      renew_content_project_generation: {
        Args: {
          p_actor_id: string
          p_client_id: string
          p_lease_seconds?: number
          p_lease_token: string
          p_project_id: string
        }
        Returns: string
      }
      reserve_prospecting_job: {
        Args: {
          p_actor_id: string
          p_actor_identifier: string
          p_adapter_version: number
          p_campaign_id: string
          p_client_id: string
          p_daily_result_limit?: number
          p_daily_run_limit?: number
          p_max_charge_usd: number
        }
        Returns: {
          actor_build_id: string | null
          actor_dataset_id: string | null
          actor_id: string
          actor_run_id: string | null
          adapter_version: number
          campaign_id: string
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_results: number
          deduplicated_results: number
          error_code: string | null
          error_message: string | null
          id: string
          lease_token: string | null
          lease_until: string | null
          max_charge_usd: number
          provider_status: string | null
          requested_results: number
          returned_results: number
          source: string
          status: string
          updated_at: string
          usage_total_usd: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "prospecting_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      resolve_brain_memory_conflict: {
        Args: {
          p_action: string
          p_actor_id: string
          p_client_id: string
          p_memory_id: string
          p_resolution?: Json
        }
        Returns: Json
      }
      resolve_vault_gap_with_answer: {
        Args: {
          p_actor_id: string
          p_answer: string
          p_client_id: string
          p_gap_id: string
        }
        Returns: string
      }
      resolve_vault_gap_with_item: {
        Args: {
          p_actor_id: string
          p_client_id: string
          p_gap_id: string
          p_vault_item_id: string
        }
        Returns: undefined
      }
      review_content_voice_evaluation: {
        Args: {
          p_actor_id: string
          p_client_id: string
          p_evaluation_id: string
          p_preferred_variant: string
          p_reviewer_notes: string
        }
        Returns: {
          assignment: Json
          automated_evaluation: Json
          brief: Json
          channel: string
          client_id: string
          created_at: string
          created_by: string | null
          error: string | null
          golden_example_ids: string[]
          id: string
          model: string | null
          preferred_variant: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string
          style_analysis_id: string | null
          updated_at: string
          variant_a: string | null
          variant_b: string | null
        }
        SetofOptions: {
          from: "*"
          to: "content_voice_evaluations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      stage_competitor_crawl_pages: {
        Args: {
          p_job_id: string
          p_lease_token: string
          p_next_result_url: string
          p_pages: Json
          p_pages_discovered: number
          p_provider_complete: boolean
        }
        Returns: number
      }
      start_competitor_intelligence_job: {
        Args: {
          p_actor_id: string
          p_client_id: string
          p_competitor_ids: string[]
          p_window_end: string
          p_window_start: string
        }
        Returns: {
          client_id: string
          competitor_ids: string[]
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          id: string
          lease_token: string
          lease_until: string
          started_at: string
          status: string
          updated_at: string
          window_end: string
          window_start: string
        }
        SetofOptions: {
          from: "*"
          to: "competitor_intelligence_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      sync_admin_company_profile: {
        Args: {
          p_actor_id: string
          p_address: string
          p_client_id: string
          p_client_type: string
          p_company_description: string
          p_company_name: string
          p_email: string
          p_founders: string
          p_location: string
          p_phone: string
          p_services: string
          p_social_links: Json
          p_target_demographic: string
          p_website: string
        }
        Returns: string
      }
      transition_brain_opportunity: {
        Args: {
          p_action: string
          p_actor_id: string
          p_client_id: string
          p_opportunity_id: string
          p_outcome?: Json
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          brain_context_snapshot_id: string
          client_id: string
          company_provenance: Json
          completed_at: string | null
          completed_by: string | null
          created_at: string
          diagnostic_run_id: string
          dismissed_at: string | null
          dismissed_by: string | null
          effectiveness_status: string
          effort: string
          fingerprint: string
          id: string
          impact: string
          kind: string
          library_provenance: Json
          measured_at: string | null
          outcome: Json
          priority_score: number
          rationale: string
          recommended_action: string
          source_layers: string[]
          started_at: string | null
          status: string
          summary: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "brain_opportunities"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_business_library_version: {
        Args: {
          p_action: string
          p_actor_id: string
          p_entry_id: string
          p_version_id: string
        }
        Returns: string
      }
      update_coach_commitment: {
        Args: {
          p_check_in_date?: string
          p_client_id: string
          p_commitment_id: string
          p_due_date?: string
          p_owner_id: string
          p_status: string
        }
        Returns: Json
      }
      update_coach_goal: {
        Args: {
          p_client_id: string
          p_goal_id: string
          p_owner_id: string
          p_progress: number
          p_status: string
          p_target_date?: string
        }
        Returns: Json
      }
      update_content_piece_atomic: {
        Args: {
          p_actor_id: string
          p_body?: string
          p_client_id: string
          p_expected_dna_updated_at?: string
          p_expected_piece_updated_at?: string
          p_piece_id: string
          p_status?: string
          p_style_snapshot?: Json
          p_title?: string
          p_update_body?: boolean
          p_update_title?: boolean
        }
        Returns: {
          ai_original: string | null
          body: string | null
          brain_context_snapshot_id: string | null
          brief: string | null
          client_id: string
          content_brief: Json
          content_type: string
          created_at: string | null
          created_by: string | null
          generation_kind: string
          id: string
          outcome: string | null
          outcome_at: string | null
          parent_piece_id: string | null
          project_id: string | null
          revision_reason: string | null
          source_references: Json
          status: string | null
          style_snapshot: Json
          title: string
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "content_pieces"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      upsert_competitor_content_item: {
        Args: {
          p_author: string
          p_canonical_url: string
          p_client_id: string
          p_competitor_id: string
          p_content_hash: string
          p_content_type: string
          p_metadata?: Json
          p_platform: string
          p_published_at: string
          p_raw_content: string
          p_source_id: string
          p_title: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
