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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      account_entries: {
        Row: {
          amount_paise: number
          category: string
          clinic_id: string
          counterparty: string | null
          created_at: string
          currency: string
          doctor_id: string
          encounter_id: string | null
          id: string
          kind: string
          note: string | null
          occurred_at: string
          patient_id: string | null
          payment_method: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          category: string
          clinic_id: string
          counterparty?: string | null
          created_at?: string
          currency?: string
          doctor_id: string
          encounter_id?: string | null
          id?: string
          kind: string
          note?: string | null
          occurred_at?: string
          patient_id?: string | null
          payment_method?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          category?: string
          clinic_id?: string
          counterparty?: string | null
          created_at?: string
          currency?: string
          doctor_id?: string
          encounter_id?: string | null
          id?: string
          kind?: string
          note?: string | null
          occurred_at?: string
          patient_id?: string | null
          payment_method?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_entries_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_entries_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_entries_doctor_same_clinic"
            columns: ["doctor_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "account_entries_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_emails: {
        Row: {
          added_at: string
          email: string
          note: string | null
        }
        Insert: {
          added_at?: string
          email: string
          note?: string | null
        }
        Update: {
          added_at?: string
          email?: string
          note?: string | null
        }
        Relationships: []
      }
      app_private_settings: {
        Row: {
          created_at: string
          key: string
          value: string
        }
        Insert: {
          created_at?: string
          key: string
          value: string
        }
        Update: {
          created_at?: string
          key?: string
          value?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          at: string
          changed: string[]
          clinic_id: string
          detail: Json | null
          entity: string
          entity_id: string | null
          id: number
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          at?: string
          changed?: string[]
          clinic_id: string
          detail?: Json | null
          entity: string
          entity_id?: string | null
          id?: number
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          at?: string
          changed?: string[]
          clinic_id?: string
          detail?: Json | null
          entity?: string
          entity_id?: string | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_invites: {
        Row: {
          clinic_id: string
          consumed_at: string | null
          consumed_by: string | null
          created_at: string
          created_by: string
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["clinic_role"]
          token_digest: string
        }
        Insert: {
          clinic_id: string
          consumed_at?: string | null
          consumed_by?: string | null
          created_at?: string
          created_by: string
          email: string
          expires_at: string
          id?: string
          role?: Database["public"]["Enums"]["clinic_role"]
          token_digest: string
        }
        Update: {
          clinic_id?: string
          consumed_at?: string | null
          consumed_by?: string | null
          created_at?: string
          created_by?: string
          email?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["clinic_role"]
          token_digest?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_invites_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_invites_consumer_fkey"
            columns: ["consumed_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_invites_consumer_same_clinic"
            columns: ["consumed_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "clinic_invites_creator_same_clinic"
            columns: ["created_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      clinics: {
        Row: {
          city: string | null
          created_at: string
          id: string
          name: string
          name_normalized: string
          timezone: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          name: string
          name_normalized: string
          timezone?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          name?: string
          name_normalized?: string
          timezone?: string
        }
        Relationships: []
      }
      doctors: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          clinic_id: string
          created_at: string
          dictation_langs: string[]
          full_name: string
          id: string
          membership_status: Database["public"]["Enums"]["membership_status"]
          registration_no: string | null
          requested_at: string
          role: Database["public"]["Enums"]["clinic_role"]
          speciality: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          clinic_id: string
          created_at?: string
          dictation_langs?: string[]
          full_name: string
          id: string
          membership_status?: Database["public"]["Enums"]["membership_status"]
          registration_no?: string | null
          requested_at?: string
          role?: Database["public"]["Enums"]["clinic_role"]
          speciality?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          clinic_id?: string
          created_at?: string
          dictation_langs?: string[]
          full_name?: string
          id?: string
          membership_status?: Database["public"]["Enums"]["membership_status"]
          registration_no?: string | null
          requested_at?: string
          role?: Database["public"]["Enums"]["clinic_role"]
          speciality?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      encounter_amendments: {
        Row: {
          after_values: Json
          author_id: string
          before_values: Json
          clinic_id: string
          created_at: string
          encounter_id: string
          id: string
          reason: string
          revision: number
        }
        Insert: {
          after_values: Json
          author_id: string
          before_values: Json
          clinic_id: string
          created_at?: string
          encounter_id: string
          id?: string
          reason: string
          revision: number
        }
        Update: {
          after_values?: Json
          author_id?: string
          before_values?: Json
          clinic_id?: string
          created_at?: string
          encounter_id?: string
          id?: string
          reason?: string
          revision?: number
        }
        Relationships: [
          {
            foreignKeyName: "encounter_amendments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounter_amendments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounter_amendments_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
        ]
      }
      encounters: {
        Row: {
          age_years: number | null
          capture_source: string
          clinic_id: string
          committed_at: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string
          draft_version: number
          edited_by_doctor: boolean
          extracted_raw: Json | null
          extraction_confidence: number | null
          extraction_model: string | null
          fees_inr: number | null
          id: string
          idempotency_key: string | null
          is_new_patient: boolean | null
          low_confidence_fields: string[]
          occurred_at: string
          patient_id: string | null
          patient_name_spoken: string | null
          status: Database["public"]["Enums"]["encounter_status"]
          transcript_id: string | null
          treatment: string | null
          visit_number: number | null
        }
        Insert: {
          age_years?: number | null
          capture_source?: string
          clinic_id: string
          committed_at?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_id: string
          draft_version?: number
          edited_by_doctor?: boolean
          extracted_raw?: Json | null
          extraction_confidence?: number | null
          extraction_model?: string | null
          fees_inr?: number | null
          id?: string
          idempotency_key?: string | null
          is_new_patient?: boolean | null
          low_confidence_fields?: string[]
          occurred_at?: string
          patient_id?: string | null
          patient_name_spoken?: string | null
          status?: Database["public"]["Enums"]["encounter_status"]
          transcript_id?: string | null
          treatment?: string | null
          visit_number?: number | null
        }
        Update: {
          age_years?: number | null
          capture_source?: string
          clinic_id?: string
          committed_at?: string | null
          created_at?: string
          diagnosis?: string | null
          doctor_id?: string
          draft_version?: number
          edited_by_doctor?: boolean
          extracted_raw?: Json | null
          extraction_confidence?: number | null
          extraction_model?: string | null
          fees_inr?: number | null
          id?: string
          idempotency_key?: string | null
          is_new_patient?: boolean | null
          low_confidence_fields?: string[]
          occurred_at?: string
          patient_id?: string | null
          patient_name_spoken?: string | null
          status?: Database["public"]["Enums"]["encounter_status"]
          transcript_id?: string | null
          treatment?: string | null
          visit_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "encounters_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_doctor_same_clinic"
            columns: ["doctor_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "encounters_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "encounters_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounters_transcript_same_clinic_doctor"
            columns: ["transcript_id", "clinic_id", "doctor_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id", "clinic_id", "doctor_id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          clinic_id: string
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          created_at: string
          created_by: string
          due_at: string
          encounter_id: string | null
          id: string
          idempotency_key: string | null
          notes: string | null
          patient_id: string
          reason: string
          status: string
        }
        Insert: {
          clinic_id: string
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by: string
          due_at: string
          encounter_id?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          patient_id: string
          reason: string
          status?: string
        }
        Update: {
          clinic_id?: string
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string
          created_by?: string
          due_at?: string
          encounter_id?: string | null
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          patient_id?: string
          reason?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_completer_same_clinic"
            columns: ["completed_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "follow_ups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_creator_same_clinic"
            columns: ["created_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "follow_ups_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_encounter_same_clinic"
            columns: ["encounter_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "follow_ups_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      patients: {
        Row: {
          abha_id: string | null
          age_years: number | null
          clinic_id: string
          created_at: string
          created_by: string | null
          first_seen_at: string
          full_name: string
          id: string
          name_normalized: string
          notes: string | null
          phone: string | null
          sex: string | null
        }
        Insert: {
          abha_id?: string | null
          age_years?: number | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          first_seen_at?: string
          full_name: string
          id?: string
          name_normalized: string
          notes?: string | null
          phone?: string | null
          sex?: string | null
        }
        Update: {
          abha_id?: string | null
          age_years?: number | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          first_seen_at?: string
          full_name?: string
          id?: string
          name_normalized?: string
          notes?: string | null
          phone?: string | null
          sex?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_creator_same_clinic"
            columns: ["created_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      prescription_items: {
        Row: {
          clinic_id: string
          corrected: boolean
          drug_name: string
          duration: string | null
          encounter_id: string
          form: string | null
          frequency_code: string | null
          frequency_label: string | null
          frequency_spoken: string | null
          id: string
          instructions: string | null
          needs_review: boolean
          position: number
          route: string | null
          strength: string | null
        }
        Insert: {
          clinic_id: string
          corrected?: boolean
          drug_name: string
          duration?: string | null
          encounter_id: string
          form?: string | null
          frequency_code?: string | null
          frequency_label?: string | null
          frequency_spoken?: string | null
          id?: string
          instructions?: string | null
          needs_review?: boolean
          position?: number
          route?: string | null
          strength?: string | null
        }
        Update: {
          clinic_id?: string
          corrected?: boolean
          drug_name?: string
          duration?: string | null
          encounter_id?: string
          form?: string | null
          frequency_code?: string | null
          frequency_label?: string | null
          frequency_spoken?: string | null
          id?: string
          instructions?: string | null
          needs_review?: boolean
          position?: number
          route?: string | null
          strength?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prescription_items_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_items_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_items_encounter_same_clinic"
            columns: ["encounter_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      rate_limit_policies: {
        Row: {
          action: string
          max_requests: number
          window_seconds: number
        }
        Insert: {
          action: string
          max_requests: number
          window_seconds: number
        }
        Update: {
          action?: string
          max_requests?: number
          window_seconds?: number
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket_key: string
          hits: number
          window_start: string
        }
        Insert: {
          bucket_key: string
          hits?: number
          window_start: string
        }
        Update: {
          bucket_key?: string
          hits?: number
          window_start?: string
        }
        Relationships: []
      }
      transcripts: {
        Row: {
          audio_deleted_at: string | null
          audio_expires_at: string | null
          audio_mime: string | null
          audio_path: string | null
          clinic_id: string
          confidence: number | null
          created_at: string
          degraded: boolean
          doctor_id: string
          duration_ms: number | null
          id: string
          language_code: string | null
          language_hint: string | null
          live_text: string | null
          model: string | null
          provider: Database["public"]["Enums"]["stt_provider"]
          raw_text: string
          roman_text: string | null
        }
        Insert: {
          audio_deleted_at?: string | null
          audio_expires_at?: string | null
          audio_mime?: string | null
          audio_path?: string | null
          clinic_id: string
          confidence?: number | null
          created_at?: string
          degraded?: boolean
          doctor_id: string
          duration_ms?: number | null
          id?: string
          language_code?: string | null
          language_hint?: string | null
          live_text?: string | null
          model?: string | null
          provider: Database["public"]["Enums"]["stt_provider"]
          raw_text: string
          roman_text?: string | null
        }
        Update: {
          audio_deleted_at?: string | null
          audio_expires_at?: string | null
          audio_mime?: string | null
          audio_path?: string | null
          clinic_id?: string
          confidence?: number | null
          created_at?: string
          degraded?: boolean
          doctor_id?: string
          duration_ms?: number | null
          id?: string
          language_code?: string | null
          language_hint?: string | null
          live_text?: string | null
          model?: string | null
          provider?: Database["public"]["Enums"]["stt_provider"]
          raw_text?: string
          roman_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_doctor_same_clinic"
            columns: ["doctor_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      account_entries_search: {
        Args: {
          p_from: string
          p_kind?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: string
          p_to: string
        }
        Returns: {
          amount_paise: number
          category: string
          counterparty: string
          created_at: string
          currency: string
          encounter_id: string
          id: string
          kind: string
          note: string
          occurred_at: string
          patient_id: string
          payment_method: string
          source: string
          status: string
          total_count: number
          updated_at: string
        }[]
      }
      account_entries_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          expenses_paise: number
          net_paise: number
          pending_paise: number
          received_paise: number
        }[]
      }
      append_encounter_amendment: {
        Args: { p_changes: Json; p_encounter_id: string; p_reason: string }
        Returns: {
          after_values: Json
          author_id: string
          before_values: Json
          created_at: string
          encounter_id: string
          id: string
          reason: string
          revision: number
        }[]
      }
      approve_clinic_member: {
        Args: { p_doctor_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          clinic_id: string
          created_at: string
          dictation_langs: string[]
          full_name: string
          id: string
          membership_status: Database["public"]["Enums"]["membership_status"]
          registration_no: string | null
          requested_at: string
          role: Database["public"]["Enums"]["clinic_role"]
          speciality: string | null
        }
        SetofOptions: {
          from: "*"
          to: "doctors"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auth_clinic_id: { Args: never; Returns: string }
      clinic_daily_stats: {
        Args: { p_doctor_id?: string; p_from: string; p_to: string }
        Returns: {
          day: string
          new_patients: number
          patient_count: number
          returning_patients: number
        }[]
      }
      commit_encounter: {
        Args: { p_encounter_id: string; p_patient_id: string }
        Returns: {
          age_years: number | null
          capture_source: string
          clinic_id: string
          committed_at: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string
          draft_version: number
          edited_by_doctor: boolean
          extracted_raw: Json | null
          extraction_confidence: number | null
          extraction_model: string | null
          fees_inr: number | null
          id: string
          idempotency_key: string | null
          is_new_patient: boolean | null
          low_confidence_fields: string[]
          occurred_at: string
          patient_id: string | null
          patient_name_spoken: string | null
          status: Database["public"]["Enums"]["encounter_status"]
          transcript_id: string | null
          treatment: string | null
          visit_number: number | null
        }
        SetofOptions: {
          from: "*"
          to: "encounters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      commit_encounter_with_income_workflow: {
        Args: {
          p_amount_paise?: number
          p_encounter_id: string
          p_idempotency_key?: string
          p_new_patient?: Json
          p_patient_id?: string
        }
        Returns: {
          account_entry_id: string
          already_committed: boolean
          encounter_id: string
          is_new_patient: boolean
          patient_id: string
          visit_number: number
        }[]
      }
      commit_encounter_workflow: {
        Args: {
          p_encounter_id: string
          p_idempotency_key?: string
          p_new_patient?: Json
          p_patient_id?: string
        }
        Returns: {
          already_committed: boolean
          encounter_id: string
          is_new_patient: boolean
          patient_id: string
          visit_number: number
        }[]
      }
      complete_follow_up: {
        Args: { p_completion_notes?: string; p_follow_up_id: string }
        Returns: {
          clinic_id: string
          completed_at: string
          completed_by: string
          completion_notes: string
          created_at: string
          created_by: string
          due_at: string
          encounter_id: string
          id: string
          notes: string
          patient_id: string
          reason: string
          status: string
        }[]
      }
      complete_follow_up_workflow: {
        Args: { p_completion_notes?: string; p_follow_up_id: string }
        Returns: {
          clinic_id: string
          completed_at: string
          completed_by: string
          completion_notes: string
          created_at: string
          created_by: string
          due_at: string
          encounter_id: string
          id: string
          notes: string
          patient_id: string
          reason: string
          status: string
        }[]
      }
      consume_rate_limit: { Args: { p_action: string }; Returns: boolean }
      create_account_entry: {
        Args: {
          p_amount_paise: number
          p_category: string
          p_counterparty?: string
          p_encounter_id?: string
          p_idempotency_key?: string
          p_kind: string
          p_note?: string
          p_occurred_at?: string
          p_patient_id?: string
          p_payment_method?: string
          p_status: string
        }
        Returns: {
          amount_paise: number
          category: string
          clinic_id: string
          counterparty: string | null
          created_at: string
          currency: string
          doctor_id: string
          encounter_id: string | null
          id: string
          kind: string
          note: string | null
          occurred_at: string
          patient_id: string | null
          payment_method: string | null
          source: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "account_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_follow_up: {
        Args: {
          p_due_at: string
          p_encounter_id?: string
          p_idempotency_key?: string
          p_notes?: string
          p_patient_id: string
          p_reason: string
        }
        Returns: {
          clinic_id: string
          completed_at: string
          completed_by: string
          completion_notes: string
          created_at: string
          created_by: string
          due_at: string
          encounter_id: string
          id: string
          notes: string
          patient_id: string
          reason: string
          status: string
        }[]
      }
      create_follow_up_workflow: {
        Args: {
          p_due_at: string
          p_encounter_id?: string
          p_idempotency_key?: string
          p_notes?: string
          p_patient_id: string
          p_reason: string
        }
        Returns: {
          clinic_id: string
          completed_at: string
          completed_by: string
          completion_notes: string
          created_at: string
          created_by: string
          due_at: string
          encounter_id: string
          id: string
          notes: string
          patient_id: string
          reason: string
          status: string
        }[]
      }
      create_manual_draft: {
        Args: { p_encounter_id: string; p_prescription?: Json; p_values: Json }
        Returns: {
          age_years: number | null
          capture_source: string
          clinic_id: string
          committed_at: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string
          draft_version: number
          edited_by_doctor: boolean
          extracted_raw: Json | null
          extraction_confidence: number | null
          extraction_model: string | null
          fees_inr: number | null
          id: string
          idempotency_key: string | null
          is_new_patient: boolean | null
          low_confidence_fields: string[]
          occurred_at: string
          patient_id: string | null
          patient_name_spoken: string | null
          status: Database["public"]["Enums"]["encounter_status"]
          transcript_id: string | null
          treatment: string | null
          visit_number: number | null
        }
        SetofOptions: {
          from: "*"
          to: "encounters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_patient_workflow: {
        Args: {
          p_abha_id?: string
          p_age_years?: number
          p_full_name: string
          p_notes?: string
          p_phone?: string
          p_sex?: string
        }
        Returns: {
          abha_id: string | null
          age_years: number | null
          clinic_id: string
          created_at: string
          created_by: string | null
          first_seen_at: string
          full_name: string
          id: string
          name_normalized: string
          notes: string | null
          phone: string | null
          sex: string | null
        }
        SetofOptions: {
          from: "*"
          to: "patients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_transcript_workflow: {
        Args: {
          p_audio_mime: string
          p_audio_path: string
          p_confidence: number
          p_degraded: boolean
          p_duration_ms: number
          p_id: string
          p_language_code: string
          p_language_hint: string
          p_live_text: string
          p_model: string
          p_provider: Database["public"]["Enums"]["stt_provider"]
          p_raw_text: string
          p_roman_text: string
        }
        Returns: string
      }
      decline_clinic_member: {
        Args: { p_doctor_id: string }
        Returns: undefined
      }
      discard_draft_workflow: {
        Args: { p_encounter_id: string; p_expected_version?: number }
        Returns: {
          age_years: number | null
          capture_source: string
          clinic_id: string
          committed_at: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string
          draft_version: number
          edited_by_doctor: boolean
          extracted_raw: Json | null
          extraction_confidence: number | null
          extraction_model: string | null
          fees_inr: number | null
          id: string
          idempotency_key: string | null
          is_new_patient: boolean | null
          low_confidence_fields: string[]
          occurred_at: string
          patient_id: string | null
          patient_name_spoken: string | null
          status: Database["public"]["Enums"]["encounter_status"]
          transcript_id: string | null
          treatment: string | null
          visit_number: number | null
        }
        SetofOptions: {
          from: "*"
          to: "encounters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      doctor_top_drugs: {
        Args: { p_doctor_id: string; p_limit?: number }
        Returns: {
          drug_name: string
          uses: number
        }[]
      }
      expired_audio_paths: {
        Args: { p_limit?: number }
        Returns: {
          audio_path: string
          id: string
        }[]
      }
      is_platform_admin: { Args: never; Returns: boolean }
      issue_clinic_invite: {
        Args: {
          p_email: string
          p_expires_in?: string
          p_role?: Database["public"]["Enums"]["clinic_role"]
        }
        Returns: {
          expires_at: string
          invite_id: string
          invite_token: string
        }[]
      }
      list_follow_ups: {
        Args: { p_limit?: number; p_status?: string }
        Returns: {
          clinic_id: string
          completed_at: string
          completed_by: string
          completer_name: string
          completion_notes: string
          created_at: string
          created_by: string
          creator_name: string
          due_at: string
          encounter_id: string
          id: string
          notes: string
          patient_id: string
          patient_name: string
          patient_phone: string
          reason: string
          status: string
        }[]
      }
      list_patients: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          age_years: number
          full_name: string
          id: string
          last_visit: string
          phone: string
          total_count: number
          visit_count: number
        }[]
      }
      log_sensitive_access: {
        Args: {
          p_action: Database["public"]["Enums"]["audit_action"]
          p_detail?: Json
          p_entity: string
          p_entity_id?: string
        }
        Returns: undefined
      }
      mark_audio_deleted: { Args: { p_ids: string[] }; Returns: number }
      match_patients: {
        Args: { p_limit?: number; p_name: string; p_phone?: string }
        Returns: {
          age_years: number
          full_name: string
          id: string
          last_visit: string
          phone: string
          similarity: number
          visit_count: number
        }[]
      }
      pending_clinic_name: { Args: { p_clinic_id: string }; Returns: string }
      prune_rate_limits: { Args: never; Returns: undefined }
      register_search: {
        Args: {
          p_doctor_id: string
          p_from: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_status?: string
        }
        Returns: {
          age_years: number
          committed_count: number
          diagnosis: string
          discarded_count: number
          draft_count: number
          drugs: string[]
          id: string
          is_new_patient: boolean
          occurred_at: string
          patient_id: string
          patient_name: string
          status: string
          total_count: number
          treatment: string
          visit_number: number
        }[]
      }
      register_totals: {
        Args: { p_doctor_id: string; p_from: string; p_query?: string }
        Returns: {
          committed_count: number
          discarded_count: number
          draft_count: number
          total_count: number
        }[]
      }
      replace_prescription_items_internal: {
        Args: { p_clinic_id: string; p_encounter_id: string; p_items: Json }
        Returns: undefined
      }
      restore_discarded_draft_workflow: {
        Args: { p_encounter_id: string; p_expected_version?: number }
        Returns: {
          age_years: number | null
          capture_source: string
          clinic_id: string
          committed_at: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string
          draft_version: number
          edited_by_doctor: boolean
          extracted_raw: Json | null
          extraction_confidence: number | null
          extraction_model: string | null
          fees_inr: number | null
          id: string
          idempotency_key: string | null
          is_new_patient: boolean | null
          low_confidence_fields: string[]
          occurred_at: string
          patient_id: string | null
          patient_name_spoken: string | null
          status: Database["public"]["Enums"]["encounter_status"]
          transcript_id: string | null
          treatment: string | null
          visit_number: number | null
        }
        SetofOptions: {
          from: "*"
          to: "encounters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_clinical_draft: {
        Args: {
          p_age_years: number
          p_diagnosis: string
          p_encounter_id: string
          p_extracted_raw: Json
          p_extraction_confidence: number
          p_extraction_model: string
          p_low_confidence_fields: string[]
          p_patient_name_spoken: string
          p_prescription: Json
          p_transcript_id: string
          p_treatment: string
        }
        Returns: {
          age_years: number | null
          capture_source: string
          clinic_id: string
          committed_at: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string
          draft_version: number
          edited_by_doctor: boolean
          extracted_raw: Json | null
          extraction_confidence: number | null
          extraction_model: string | null
          fees_inr: number | null
          id: string
          idempotency_key: string | null
          is_new_patient: boolean | null
          low_confidence_fields: string[]
          occurred_at: string
          patient_id: string | null
          patient_name_spoken: string | null
          status: Database["public"]["Enums"]["encounter_status"]
          transcript_id: string | null
          treatment: string | null
          visit_number: number | null
        }
        SetofOptions: {
          from: "*"
          to: "encounters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_extracted_draft: {
        Args: {
          p_age_years: number
          p_diagnosis: string
          p_encounter_id: string
          p_extracted_raw: Json
          p_extraction_confidence: number
          p_extraction_model: string
          p_fees_inr: number
          p_low_confidence_fields: string[]
          p_patient_name_spoken: string
          p_prescription: Json
          p_transcript_id: string
          p_treatment: string
        }
        Returns: {
          age_years: number | null
          capture_source: string
          clinic_id: string
          committed_at: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string
          draft_version: number
          edited_by_doctor: boolean
          extracted_raw: Json | null
          extraction_confidence: number | null
          extraction_model: string | null
          fees_inr: number | null
          id: string
          idempotency_key: string | null
          is_new_patient: boolean | null
          low_confidence_fields: string[]
          occurred_at: string
          patient_id: string | null
          patient_name_spoken: string | null
          status: Database["public"]["Enums"]["encounter_status"]
          transcript_id: string | null
          treatment: string | null
          visit_number: number | null
        }
        SetofOptions: {
          from: "*"
          to: "encounters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
      update_account_entry_status: {
        Args: { p_entry_id: string; p_status: string }
        Returns: {
          amount_paise: number
          category: string
          clinic_id: string
          counterparty: string | null
          created_at: string
          currency: string
          doctor_id: string
          encounter_id: string | null
          id: string
          kind: string
          note: string | null
          occurred_at: string
          patient_id: string | null
          payment_method: string | null
          source: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "account_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_doctor_profile_workflow: {
        Args: {
          p_dictation_langs: string[]
          p_full_name: string
          p_registration_no: string
          p_speciality: string
        }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          clinic_id: string
          created_at: string
          dictation_langs: string[]
          full_name: string
          id: string
          membership_status: Database["public"]["Enums"]["membership_status"]
          registration_no: string | null
          requested_at: string
          role: Database["public"]["Enums"]["clinic_role"]
          speciality: string | null
        }
        SetofOptions: {
          from: "*"
          to: "doctors"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_draft_with_consultation_fee_workflow: {
        Args: {
          p_consultation_fee_inr?: number
          p_encounter_id: string
          p_expected_version?: number
          p_patch: Json
          p_prescription?: Json
        }
        Returns: {
          age_years: number | null
          capture_source: string
          clinic_id: string
          committed_at: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string
          draft_version: number
          edited_by_doctor: boolean
          extracted_raw: Json | null
          extraction_confidence: number | null
          extraction_model: string | null
          fees_inr: number | null
          id: string
          idempotency_key: string | null
          is_new_patient: boolean | null
          low_confidence_fields: string[]
          occurred_at: string
          patient_id: string | null
          patient_name_spoken: string | null
          status: Database["public"]["Enums"]["encounter_status"]
          transcript_id: string | null
          treatment: string | null
          visit_number: number | null
        }
        SetofOptions: {
          from: "*"
          to: "encounters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_draft_workflow: {
        Args: {
          p_encounter_id: string
          p_expected_version?: number
          p_patch: Json
          p_prescription?: Json
        }
        Returns: {
          age_years: number | null
          capture_source: string
          clinic_id: string
          committed_at: string | null
          created_at: string
          diagnosis: string | null
          doctor_id: string
          draft_version: number
          edited_by_doctor: boolean
          extracted_raw: Json | null
          extraction_confidence: number | null
          extraction_model: string | null
          fees_inr: number | null
          id: string
          idempotency_key: string | null
          is_new_patient: boolean | null
          low_confidence_fields: string[]
          occurred_at: string
          patient_id: string | null
          patient_name_spoken: string | null
          status: Database["public"]["Enums"]["encounter_status"]
          transcript_id: string | null
          treatment: string | null
          visit_number: number | null
        }
        SetofOptions: {
          from: "*"
          to: "encounters"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_patient_workflow: {
        Args: { p_patch: Json; p_patient_id: string }
        Returns: {
          abha_id: string | null
          age_years: number | null
          clinic_id: string
          created_at: string
          created_by: string | null
          first_seen_at: string
          full_name: string
          id: string
          name_normalized: string
          notes: string | null
          phone: string | null
          sex: string | null
        }
        SetofOptions: {
          from: "*"
          to: "patients"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      audit_action:
        | "insert"
        | "update"
        | "delete"
        | "read"
        | "export"
        | "commit"
      clinic_role: "owner" | "doctor" | "staff"
      encounter_status: "draft" | "committed" | "discarded"
      membership_status: "pending" | "active"
      stt_provider: "sarvam" | "elevenlabs" | "indicconformer" | "mock"
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
  public: {
    Enums: {
      audit_action: ["insert", "update", "delete", "read", "export", "commit"],
      clinic_role: ["owner", "doctor", "staff"],
      encounter_status: ["draft", "committed", "discarded"],
      membership_status: ["pending", "active"],
      stt_provider: ["sarvam", "elevenlabs", "indicconformer", "mock"],
    },
  },
} as const
