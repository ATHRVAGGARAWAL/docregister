/**
 * Generated from the live schema — do not edit by hand.
 *
 * Regenerate with the Supabase MCP `generate_typescript_types`, or
 * `npx supabase gen types typescript --project-id xjgripplgueozzftxbaw`.
 *
 * Before this existed, every reader hand-wrote its own row interface and reached
 * the database through `as unknown as` — which is how `[...row.prescription_items]`
 * came to be a runtime crash waiting on a null embed, with no compile-time warning.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      admin_emails: {
        Row: { added_at: string; email: string; note: string | null };
        Insert: { added_at?: string; email: string; note?: string | null };
        Update: { added_at?: string; email?: string; note?: string | null };
        Relationships: [];
      };
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"];
          actor_id: string | null;
          at: string;
          changed: string[];
          clinic_id: string;
          detail: Json | null;
          entity: string;
          entity_id: string | null;
          id: number;
        };
        Insert: {
          action: Database["public"]["Enums"]["audit_action"];
          actor_id?: string | null;
          at?: string;
          changed?: string[];
          clinic_id: string;
          detail?: Json | null;
          entity: string;
          entity_id?: string | null;
          id?: number;
        };
        Update: {
          action?: Database["public"]["Enums"]["audit_action"];
          actor_id?: string | null;
          at?: string;
          changed?: string[];
          clinic_id?: string;
          detail?: Json | null;
          entity?: string;
          entity_id?: string | null;
          id?: number;
        };
        Relationships: [];
      };
      account_entries: {
        Row: {
          amount_paise: number;
          category: string;
          clinic_id: string;
          counterparty: string | null;
          created_at: string;
          currency: string;
          doctor_id: string;
          encounter_id: string | null;
          id: string;
          kind: string;
          note: string | null;
          occurred_at: string;
          patient_id: string | null;
          payment_method: string | null;
          source: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_paise: number;
          category: string;
          clinic_id: string;
          counterparty?: string | null;
          created_at?: string;
          currency?: string;
          doctor_id: string;
          encounter_id?: string | null;
          id?: string;
          kind: string;
          note?: string | null;
          occurred_at?: string;
          patient_id?: string | null;
          payment_method?: string | null;
          source?: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_paise?: number;
          category?: string;
          clinic_id?: string;
          counterparty?: string | null;
          created_at?: string;
          currency?: string;
          doctor_id?: string;
          encounter_id?: string | null;
          id?: string;
          kind?: string;
          note?: string | null;
          occurred_at?: string;
          patient_id?: string | null;
          payment_method?: string | null;
          source?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_entries_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_entries_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_entries_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "encounters";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "account_entries_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
        ];
      };
      clinics: {
        Row: {
          city: string | null;
          created_at: string;
          id: string;
          name: string;
          timezone: string;
        };
        Insert: {
          city?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          timezone?: string;
        };
        Update: {
          city?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      doctors: {
        Row: {
          clinic_id: string;
          created_at: string;
          dictation_langs: string[];
          full_name: string;
          id: string;
          registration_no: string | null;
          role: Database["public"]["Enums"]["clinic_role"];
          speciality: string | null;
        };
        Insert: {
          clinic_id: string;
          created_at?: string;
          dictation_langs?: string[];
          full_name: string;
          id: string;
          registration_no?: string | null;
          role?: Database["public"]["Enums"]["clinic_role"];
          speciality?: string | null;
        };
        Update: {
          clinic_id?: string;
          created_at?: string;
          dictation_langs?: string[];
          full_name?: string;
          id?: string;
          registration_no?: string | null;
          role?: Database["public"]["Enums"]["clinic_role"];
          speciality?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "doctors_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
        ];
      };
      encounters: {
        Row: {
          age_years: number | null;
          clinic_id: string;
          committed_at: string | null;
          created_at: string;
          diagnosis: string | null;
          doctor_id: string;
          edited_by_doctor: boolean;
          extracted_raw: Json | null;
          extraction_confidence: number | null;
          extraction_model: string | null;
          fees_inr: number | null;
          id: string;
          idempotency_key: string | null;
          is_new_patient: boolean | null;
          low_confidence_fields: string[];
          occurred_at: string;
          patient_id: string | null;
          patient_name_spoken: string | null;
          status: Database["public"]["Enums"]["encounter_status"];
          transcript_id: string | null;
          treatment: string | null;
          visit_number: number | null;
        };
        Insert: {
          age_years?: number | null;
          clinic_id: string;
          committed_at?: string | null;
          created_at?: string;
          diagnosis?: string | null;
          doctor_id: string;
          edited_by_doctor?: boolean;
          extracted_raw?: Json | null;
          extraction_confidence?: number | null;
          extraction_model?: string | null;
          fees_inr?: number | null;
          id?: string;
          idempotency_key?: string | null;
          is_new_patient?: boolean | null;
          low_confidence_fields?: string[];
          occurred_at?: string;
          patient_id?: string | null;
          patient_name_spoken?: string | null;
          status?: Database["public"]["Enums"]["encounter_status"];
          transcript_id?: string | null;
          treatment?: string | null;
          visit_number?: number | null;
        };
        Update: {
          age_years?: number | null;
          clinic_id?: string;
          committed_at?: string | null;
          created_at?: string;
          diagnosis?: string | null;
          doctor_id?: string;
          edited_by_doctor?: boolean;
          extracted_raw?: Json | null;
          extraction_confidence?: number | null;
          extraction_model?: string | null;
          fees_inr?: number | null;
          id?: string;
          idempotency_key?: string | null;
          is_new_patient?: boolean | null;
          low_confidence_fields?: string[];
          occurred_at?: string;
          patient_id?: string | null;
          patient_name_spoken?: string | null;
          status?: Database["public"]["Enums"]["encounter_status"];
          transcript_id?: string | null;
          treatment?: string | null;
          visit_number?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "encounters_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "encounters_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "encounters_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "encounters_transcript_id_fkey";
            columns: ["transcript_id"];
            isOneToOne: false;
            referencedRelation: "transcripts";
            referencedColumns: ["id"];
          },
        ];
      };
      patients: {
        Row: {
          abha_id: string | null;
          age_years: number | null;
          clinic_id: string;
          created_at: string;
          created_by: string | null;
          first_seen_at: string;
          full_name: string;
          id: string;
          name_normalized: string;
          notes: string | null;
          phone: string | null;
          sex: string | null;
        };
        Insert: {
          abha_id?: string | null;
          age_years?: number | null;
          clinic_id: string;
          created_at?: string;
          created_by?: string | null;
          first_seen_at?: string;
          full_name: string;
          id?: string;
          name_normalized?: string;
          notes?: string | null;
          phone?: string | null;
          sex?: string | null;
        };
        Update: {
          abha_id?: string | null;
          age_years?: number | null;
          clinic_id?: string;
          created_at?: string;
          created_by?: string | null;
          first_seen_at?: string;
          full_name?: string;
          id?: string;
          name_normalized?: string;
          notes?: string | null;
          phone?: string | null;
          sex?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "patients_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
        ];
      };
      prescription_items: {
        Row: {
          clinic_id: string;
          corrected: boolean;
          drug_name: string;
          duration: string | null;
          encounter_id: string;
          form: string | null;
          frequency_code: string | null;
          frequency_label: string | null;
          frequency_spoken: string | null;
          id: string;
          instructions: string | null;
          needs_review: boolean;
          position: number;
          route: string | null;
          strength: string | null;
        };
        Insert: {
          clinic_id: string;
          corrected?: boolean;
          drug_name: string;
          duration?: string | null;
          encounter_id: string;
          form?: string | null;
          frequency_code?: string | null;
          frequency_label?: string | null;
          frequency_spoken?: string | null;
          id?: string;
          instructions?: string | null;
          needs_review?: boolean;
          position?: number;
          route?: string | null;
          strength?: string | null;
        };
        Update: {
          clinic_id?: string;
          corrected?: boolean;
          drug_name?: string;
          duration?: string | null;
          encounter_id?: string;
          form?: string | null;
          frequency_code?: string | null;
          frequency_label?: string | null;
          frequency_spoken?: string | null;
          id?: string;
          instructions?: string | null;
          needs_review?: boolean;
          position?: number;
          route?: string | null;
          strength?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "prescription_items_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prescription_items_encounter_id_fkey";
            columns: ["encounter_id"];
            isOneToOne: false;
            referencedRelation: "encounters";
            referencedColumns: ["id"];
          },
        ];
      };
      rate_limit_policies: {
        Row: { action: string; max_requests: number; window_seconds: number };
        Insert: { action: string; max_requests: number; window_seconds: number };
        Update: { action?: string; max_requests?: number; window_seconds?: number };
        Relationships: [];
      };
      rate_limits: {
        Row: { bucket_key: string; hits: number; window_start: string };
        Insert: { bucket_key: string; hits?: number; window_start: string };
        Update: { bucket_key?: string; hits?: number; window_start?: string };
        Relationships: [];
      };
      transcripts: {
        Row: {
          audio_deleted_at: string | null;
          audio_expires_at: string | null;
          audio_mime: string | null;
          audio_path: string | null;
          clinic_id: string;
          confidence: number | null;
          created_at: string;
          degraded: boolean;
          doctor_id: string;
          duration_ms: number | null;
          id: string;
          language_code: string | null;
          language_hint: string | null;
          live_text: string | null;
          model: string | null;
          provider: Database["public"]["Enums"]["stt_provider"];
          raw_text: string;
          roman_text: string | null;
        };
        Insert: {
          audio_deleted_at?: string | null;
          audio_expires_at?: string | null;
          audio_mime?: string | null;
          audio_path?: string | null;
          clinic_id: string;
          confidence?: number | null;
          created_at?: string;
          degraded?: boolean;
          doctor_id: string;
          duration_ms?: number | null;
          id?: string;
          language_code?: string | null;
          language_hint?: string | null;
          live_text?: string | null;
          model?: string | null;
          provider: Database["public"]["Enums"]["stt_provider"];
          raw_text: string;
          roman_text?: string | null;
        };
        Update: {
          audio_deleted_at?: string | null;
          audio_expires_at?: string | null;
          audio_mime?: string | null;
          audio_path?: string | null;
          clinic_id?: string;
          confidence?: number | null;
          created_at?: string;
          degraded?: boolean;
          doctor_id?: string;
          duration_ms?: number | null;
          id?: string;
          language_code?: string | null;
          language_hint?: string | null;
          live_text?: string | null;
          model?: string | null;
          provider?: Database["public"]["Enums"]["stt_provider"];
          raw_text?: string;
          roman_text?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "transcripts_clinic_id_fkey";
            columns: ["clinic_id"];
            isOneToOne: false;
            referencedRelation: "clinics";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transcripts_doctor_id_fkey";
            columns: ["doctor_id"];
            isOneToOne: false;
            referencedRelation: "doctors";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<never, never>;
    Functions: {
      auth_clinic_id: { Args: never; Returns: string };
      clinic_daily_stats: {
        Args: { p_doctor_id?: string | null; p_from: string; p_to: string };
        Returns: {
          day: string;
          new_patients: number;
          patient_count: number;
          returning_patients: number;
        }[];
      };
      commit_encounter: {
        Args: { p_encounter_id: string; p_patient_id: string };
        Returns: Database["public"]["Tables"]["encounters"]["Row"];
      };
      consume_rate_limit: { Args: { p_action: string }; Returns: boolean };
      doctor_top_drugs: {
        Args: { p_doctor_id: string; p_limit?: number };
        Returns: { drug_name: string; uses: number }[];
      };
      expired_audio_paths: {
        Args: { p_limit?: number };
        Returns: { audio_path: string; id: string }[];
      };
      is_platform_admin: { Args: never; Returns: boolean };
      mark_audio_deleted: { Args: { p_ids: string[] }; Returns: number };
      match_patients: {
        Args: { p_limit?: number; p_name: string | null; p_phone?: string | null };
        Returns: {
          age_years: number;
          full_name: string;
          id: string;
          last_visit: string;
          phone: string;
          similarity: number;
          visit_count: number;
        }[];
      };
      prune_rate_limits: { Args: never; Returns: undefined };
      register_search: {
        Args: {
          p_doctor_id: string;
          p_from: string;
          p_limit?: number;
          p_offset?: number;
          p_query?: string | null;
          p_status?: string | null;
        };
        Returns: {
          age_years: number;
          diagnosis: string;
          drugs: string[];
          id: string;
          is_new_patient: boolean;
          occurred_at: string;
          patient_id: string;
          patient_name: string;
          status: string;
          total_count: number;
          treatment: string;
          visit_number: number;
          committed_count: number;
          draft_count: number;
        }[];
      };
      account_entries_search: {
        Args: {
          p_from: string;
          p_kind?: string | null;
          p_limit?: number;
          p_offset?: number;
          p_query?: string | null;
          p_status?: string | null;
          p_to: string;
        };
        Returns: {
          amount_paise: number;
          category: string;
          counterparty: string | null;
          created_at: string;
          currency: string;
          encounter_id: string | null;
          id: string;
          kind: string;
          note: string | null;
          occurred_at: string;
          patient_id: string | null;
          payment_method: string | null;
          source: string;
          status: string;
          total_count: number;
          updated_at: string;
        }[];
      };
      account_entries_summary: {
        Args: { p_from: string; p_to: string };
        Returns: {
          expenses_paise: number;
          net_paise: number;
          pending_paise: number;
          received_paise: number;
        }[];
      };
      show_limit: { Args: never; Returns: number };
      unaccent: { Args: { "": string }; Returns: string };
    };
    Enums: {
      audit_action: "insert" | "update" | "delete" | "read" | "export" | "commit";
      clinic_role: "owner" | "doctor" | "staff";
      encounter_status: "draft" | "committed" | "discarded";
      stt_provider: "sarvam" | "elevenlabs" | "indicconformer" | "mock";
    };
    CompositeTypes: Record<never, never>;
  };
};

/** The row shape of a table, e.g. `Tables<"encounters">`. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];

export type Enums<T extends keyof Database["public"]["Enums"]> =
  Database["public"]["Enums"][T];
