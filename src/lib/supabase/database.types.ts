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
    PostgrestVersion: "14.5"
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
      appointments: {
        Row: {
          appointment_type: string
          checked_in_at: string | null
          clinic_id: string
          clinician_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          notes: string | null
          operatory_id: string | null
          patient_id: string | null
          reason: string | null
          reminder_at: string | null
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          appointment_type?: string
          checked_in_at?: string | null
          clinic_id: string
          clinician_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          operatory_id?: string | null
          patient_id?: string | null
          reason?: string | null
          reminder_at?: string | null
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_type?: string
          checked_in_at?: string | null
          clinic_id?: string
          clinician_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          operatory_id?: string | null
          patient_id?: string | null
          reason?: string | null
          reminder_at?: string | null
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_clinician_same_clinic"
            columns: ["clinician_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "appointments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_creator_same_clinic"
            columns: ["created_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "appointments_operatory_id_fkey"
            columns: ["operatory_id"]
            isOneToOne: false
            referencedRelation: "operatories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_operatory_same_clinic"
            columns: ["operatory_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "operatories"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
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
      consent_records: {
        Row: {
          clinic_id: string
          consent_type: string
          content_snapshot: string
          created_at: string
          created_by: string | null
          encounter_id: string | null
          id: string
          language_code: string
          patient_id: string
          revoked_at: string | null
          signed_at: string | null
          signed_name: string | null
          status: string
          template_version: string | null
          treatment_plan_id: string | null
          updated_at: string
          witness_name: string | null
        }
        Insert: {
          clinic_id: string
          consent_type: string
          content_snapshot: string
          created_at?: string
          created_by?: string | null
          encounter_id?: string | null
          id?: string
          language_code?: string
          patient_id: string
          revoked_at?: string | null
          signed_at?: string | null
          signed_name?: string | null
          status?: string
          template_version?: string | null
          treatment_plan_id?: string | null
          updated_at?: string
          witness_name?: string | null
        }
        Update: {
          clinic_id?: string
          consent_type?: string
          content_snapshot?: string
          created_at?: string
          created_by?: string | null
          encounter_id?: string | null
          id?: string
          language_code?: string
          patient_id?: string
          revoked_at?: string | null
          signed_at?: string | null
          signed_name?: string | null
          status?: string
          template_version?: string | null
          treatment_plan_id?: string | null
          updated_at?: string
          witness_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_creator_same_clinic"
            columns: ["created_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "consent_records_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_encounter_same_clinic"
            columns: ["encounter_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "consent_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "consent_records_plan_same_clinic"
            columns: ["treatment_plan_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "consent_records_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
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
          practice_role: Database["public"]["Enums"]["practice_role"]
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
          practice_role?: Database["public"]["Enums"]["practice_role"]
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
          practice_role?: Database["public"]["Enums"]["practice_role"]
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
      encounter_procedures: {
        Row: {
          arch: Database["public"]["Enums"]["dental_arch"] | null
          catalogue_id: string | null
          clinic_id: string
          encounter_id: string
          id: string
          needs_review: boolean
          notes: string | null
          plan_item_id: string | null
          position: number
          procedure_name: string
          quadrant: number | null
          scope: Database["public"]["Enums"]["dental_scope"]
          sitting_number: number | null
          status: string
          surfaces: string[]
          tooth_fdi: number | null
          total_sittings: number | null
        }
        Insert: {
          arch?: Database["public"]["Enums"]["dental_arch"] | null
          catalogue_id?: string | null
          clinic_id: string
          encounter_id: string
          id?: string
          needs_review?: boolean
          notes?: string | null
          plan_item_id?: string | null
          position?: number
          procedure_name: string
          quadrant?: number | null
          scope?: Database["public"]["Enums"]["dental_scope"]
          sitting_number?: number | null
          status?: string
          surfaces?: string[]
          tooth_fdi?: number | null
          total_sittings?: number | null
        }
        Update: {
          arch?: Database["public"]["Enums"]["dental_arch"] | null
          catalogue_id?: string | null
          clinic_id?: string
          encounter_id?: string
          id?: string
          needs_review?: boolean
          notes?: string | null
          plan_item_id?: string | null
          position?: number
          procedure_name?: string
          quadrant?: number | null
          scope?: Database["public"]["Enums"]["dental_scope"]
          sitting_number?: number | null
          status?: string
          surfaces?: string[]
          tooth_fdi?: number | null
          total_sittings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "encounter_procedures_catalogue_same_clinic"
            columns: ["catalogue_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "procedure_catalogue"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "encounter_procedures_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounter_procedures_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encounter_procedures_encounter_same_clinic"
            columns: ["encounter_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "encounter_procedures_plan_item_same_clinic"
            columns: ["plan_item_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_items"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      encounters: {
        Row: {
          age_years: number | null
          appointment_id: string | null
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
          appointment_id?: string | null
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
          appointment_id?: string | null
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
            foreignKeyName: "encounters_appointment_same_clinic"
            columns: ["appointment_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "clinic_id"]
          },
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
      estimate_items: {
        Row: {
          clinic_id: string
          created_at: string
          description: string
          discount_paise: number
          estimate_id: string
          id: string
          quantity: number
          sort_order: number
          tax_paise: number
          treatment_plan_item_id: string | null
          unit_price_paise: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          description: string
          discount_paise?: number
          estimate_id: string
          id?: string
          quantity?: number
          sort_order?: number
          tax_paise?: number
          treatment_plan_item_id?: string | null
          unit_price_paise?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          description?: string
          discount_paise?: number
          estimate_id?: string
          id?: string
          quantity?: number
          sort_order?: number
          tax_paise?: number
          treatment_plan_item_id?: string | null
          unit_price_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "estimate_items_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimate_items_estimate_same_clinic"
            columns: ["estimate_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "estimate_items_plan_item_same_clinic"
            columns: ["treatment_plan_item_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_items"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "estimate_items_treatment_plan_item_id_fkey"
            columns: ["treatment_plan_item_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      estimates: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          number: number
          patient_id: string
          status: string
          treatment_plan_id: string | null
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          number?: never
          patient_id: string
          status?: string
          treatment_plan_id?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          number?: never
          patient_id?: string
          status?: string
          treatment_plan_id?: string | null
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "estimates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_creator_same_clinic"
            columns: ["created_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "estimates_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estimates_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "estimates_plan_same_clinic"
            columns: ["treatment_plan_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "estimates_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
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
      imaging_links: {
        Row: {
          added_by: string | null
          clinic_id: string
          created_at: string
          encounter_id: string | null
          id: string
          label: string
          modality: string
          note: string | null
          patient_id: string
          taken_at: string | null
          updated_at: string
          url: string
        }
        Insert: {
          added_by?: string | null
          clinic_id: string
          created_at?: string
          encounter_id?: string | null
          id?: string
          label: string
          modality?: string
          note?: string | null
          patient_id: string
          taken_at?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          added_by?: string | null
          clinic_id?: string
          created_at?: string
          encounter_id?: string | null
          id?: string
          label?: string
          modality?: string
          note?: string | null
          patient_id?: string
          taken_at?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "imaging_links_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imaging_links_adder_same_clinic"
            columns: ["added_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "imaging_links_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imaging_links_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imaging_links_encounter_same_clinic"
            columns: ["encounter_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "imaging_links_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imaging_links_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_number: string | null
          clinic_id: string
          created_at: string
          expiry_date: string | null
          id: string
          item_id: string
          received_at: string
          supplier_name: string | null
          unit_cost_paise: number | null
        }
        Insert: {
          batch_number?: string | null
          clinic_id: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id: string
          received_at?: string
          supplier_name?: string | null
          unit_cost_paise?: number | null
        }
        Update: {
          batch_number?: string | null
          clinic_id?: string
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id?: string
          received_at?: string
          supplier_name?: string | null
          unit_cost_paise?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_item_same_clinic"
            columns: ["item_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "inventory_batches_item_same_clinic"
            columns: ["item_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          category: string
          clinic_id: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          note: string | null
          reorder_level: number
          sku: string | null
          supplier_name: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string
          clinic_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          note?: string | null
          reorder_level?: number
          sku?: string | null
          supplier_name?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          note?: string | null
          reorder_level?: number
          sku?: string | null
          supplier_name?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          appointment_id: string | null
          batch_id: string | null
          clinic_id: string
          created_at: string
          encounter_id: string | null
          id: string
          item_id: string
          kind: string
          note: string | null
          occurred_at: string
          quantity: number
          recorded_by: string | null
        }
        Insert: {
          appointment_id?: string | null
          batch_id?: string | null
          clinic_id: string
          created_at?: string
          encounter_id?: string | null
          id?: string
          item_id: string
          kind: string
          note?: string | null
          occurred_at?: string
          quantity: number
          recorded_by?: string | null
        }
        Update: {
          appointment_id?: string | null
          batch_id?: string | null
          clinic_id?: string
          created_at?: string
          encounter_id?: string | null
          id?: string
          item_id?: string
          kind?: string
          note?: string | null
          occurred_at?: string
          quantity?: number
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_appointment_same_clinic"
            columns: ["appointment_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_batch_same_clinic"
            columns: ["batch_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "inventory_movements_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_encounter_same_clinic"
            columns: ["encounter_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_item_same_clinic"
            columns: ["item_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "inventory_movements_item_same_clinic"
            columns: ["item_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "inventory_stock"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "inventory_movements_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_recorder_same_clinic"
            columns: ["recorded_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          clinic_id: string
          created_at: string
          description: string
          discount_paise: number
          id: string
          invoice_id: string
          quantity: number
          sort_order: number
          tax_paise: number
          treatment_plan_item_id: string | null
          unit_price_paise: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          description: string
          discount_paise?: number
          id?: string
          invoice_id: string
          quantity?: number
          sort_order?: number
          tax_paise?: number
          treatment_plan_item_id?: string | null
          unit_price_paise?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          description?: string
          discount_paise?: number
          id?: string
          invoice_id?: string
          quantity?: number
          sort_order?: number
          tax_paise?: number
          treatment_plan_item_id?: string | null
          unit_price_paise?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_same_clinic"
            columns: ["invoice_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "invoice_items_plan_item_same_clinic"
            columns: ["treatment_plan_item_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_items"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "invoice_items_treatment_plan_item_id_fkey"
            columns: ["treatment_plan_item_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          due_at: string | null
          encounter_id: string | null
          estimate_id: string | null
          id: string
          issued_at: string | null
          note: string | null
          number: number
          patient_id: string
          status: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          encounter_id?: string | null
          estimate_id?: string | null
          id?: string
          issued_at?: string | null
          note?: string | null
          number?: never
          patient_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          encounter_id?: string | null
          estimate_id?: string | null
          id?: string
          issued_at?: string | null
          note?: string | null
          number?: never
          patient_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_creator_same_clinic"
            columns: ["created_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "invoices_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_encounter_same_clinic"
            columns: ["encounter_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "invoices_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_estimate_same_clinic"
            columns: ["estimate_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "estimates"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "invoices_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      lab_cases: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          due_at: string | null
          fitted_at: string | null
          id: string
          lab_name: string
          note: string | null
          patient_id: string
          received_at: string | null
          sent_at: string | null
          shade: string | null
          status: string
          tooth_notation: string | null
          tracking_reference: string | null
          treatment_plan_item_id: string | null
          updated_at: string
          work_type: string
        }
        Insert: {
          appointment_id?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          fitted_at?: string | null
          id?: string
          lab_name: string
          note?: string | null
          patient_id: string
          received_at?: string | null
          sent_at?: string | null
          shade?: string | null
          status?: string
          tooth_notation?: string | null
          tracking_reference?: string | null
          treatment_plan_item_id?: string | null
          updated_at?: string
          work_type: string
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          fitted_at?: string | null
          id?: string
          lab_name?: string
          note?: string | null
          patient_id?: string
          received_at?: string | null
          sent_at?: string | null
          shade?: string | null
          status?: string
          tooth_notation?: string | null
          tracking_reference?: string | null
          treatment_plan_item_id?: string | null
          updated_at?: string
          work_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_cases_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_cases_appointment_same_clinic"
            columns: ["appointment_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "lab_cases_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_cases_creator_same_clinic"
            columns: ["created_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "lab_cases_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lab_cases_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "lab_cases_plan_item_same_clinic"
            columns: ["treatment_plan_item_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_items"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "lab_cases_treatment_plan_item_id_fkey"
            columns: ["treatment_plan_item_id"]
            isOneToOne: false
            referencedRelation: "treatment_plan_items"
            referencedColumns: ["id"]
          },
        ]
      }
      operatories: {
        Row: {
          clinic_id: string
          code: string | null
          colour: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          code?: string | null
          colour?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          code?: string | null
          colour?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operatories_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_alerts: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          is_active: boolean
          kind: string
          label: string
          note: string | null
          patient_id: string
          recorded_by: string | null
          severity: string
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind: string
          label: string
          note?: string | null
          patient_id: string
          recorded_by?: string | null
          severity?: string
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          label?: string
          note?: string | null
          patient_id?: string
          recorded_by?: string | null
          severity?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_alerts_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_alerts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_alerts_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "patient_alerts_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_alerts_recorder_same_clinic"
            columns: ["recorded_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      patient_medical_history: {
        Row: {
          category: string
          clinic_id: string
          created_at: string
          detail: string | null
          id: string
          name: string
          onset_date: string | null
          patient_id: string
          recorded_by: string | null
          resolved_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          category: string
          clinic_id: string
          created_at?: string
          detail?: string | null
          id?: string
          name: string
          onset_date?: string | null
          patient_id: string
          recorded_by?: string | null
          resolved_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          category?: string
          clinic_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          name?: string
          onset_date?: string | null
          patient_id?: string
          recorded_by?: string | null
          resolved_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_medical_history_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_medical_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_medical_history_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "patient_medical_history_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_medical_history_recorder_same_clinic"
            columns: ["recorded_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      patient_specialty_records: {
        Row: {
          clinic_id: string
          created_at: string
          data: Json
          effective_at: string
          encounter_id: string | null
          id: string
          patient_id: string
          record_type: string
          recorded_by: string | null
          schema_version: number
          specialty: string
          supersedes_id: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          data?: Json
          effective_at?: string
          encounter_id?: string | null
          id?: string
          patient_id: string
          record_type: string
          recorded_by?: string | null
          schema_version?: number
          specialty: string
          supersedes_id?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          data?: Json
          effective_at?: string
          encounter_id?: string | null
          id?: string
          patient_id?: string
          record_type?: string
          recorded_by?: string | null
          schema_version?: number
          specialty?: string
          supersedes_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_specialty_records_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_specialty_records_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_specialty_records_encounter_same_clinic"
            columns: ["encounter_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "patient_specialty_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_specialty_records_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "patient_specialty_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_specialty_records_recorder_same_clinic"
            columns: ["recorded_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "patient_specialty_records_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "patient_specialty_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_specialty_records_supersedes_same_clinic"
            columns: ["supersedes_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patient_specialty_records"
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
      payments: {
        Row: {
          amount_paise: number
          clinic_id: string
          created_at: string
          id: string
          invoice_id: string
          method: string
          note: string | null
          patient_id: string
          received_at: string
          recorded_by: string | null
          reference: string | null
        }
        Insert: {
          amount_paise: number
          clinic_id: string
          created_at?: string
          id?: string
          invoice_id: string
          method: string
          note?: string | null
          patient_id: string
          received_at?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Update: {
          amount_paise?: number
          clinic_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          method?: string
          note?: string | null
          patient_id?: string
          received_at?: string
          recorded_by?: string | null
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_same_clinic"
            columns: ["invoice_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorder_same_clinic"
            columns: ["recorded_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      periodontal_measurements: {
        Row: {
          bleeding: boolean
          clinic_id: string
          created_at: string
          encounter_id: string | null
          furcation: number | null
          id: string
          measured_at: string
          mobility: number | null
          patient_id: string
          pocket_depth_mm: number | null
          recession_mm: number | null
          recorded_by: string | null
          site: string
          suppuration: boolean
          tooth_fdi: number
        }
        Insert: {
          bleeding?: boolean
          clinic_id: string
          created_at?: string
          encounter_id?: string | null
          furcation?: number | null
          id?: string
          measured_at?: string
          mobility?: number | null
          patient_id: string
          pocket_depth_mm?: number | null
          recession_mm?: number | null
          recorded_by?: string | null
          site: string
          suppuration?: boolean
          tooth_fdi: number
        }
        Update: {
          bleeding?: boolean
          clinic_id?: string
          created_at?: string
          encounter_id?: string | null
          furcation?: number | null
          id?: string
          measured_at?: string
          mobility?: number | null
          patient_id?: string
          pocket_depth_mm?: number | null
          recession_mm?: number | null
          recorded_by?: string | null
          site?: string
          suppuration?: boolean
          tooth_fdi?: number
        }
        Relationships: [
          {
            foreignKeyName: "periodontal_encounter_same_clinic"
            columns: ["encounter_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "periodontal_measurements_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodontal_measurements_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodontal_measurements_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodontal_measurements_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periodontal_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "periodontal_recorder_same_clinic"
            columns: ["recorded_by", "clinic_id"]
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
      procedure_catalogue: {
        Row: {
          clinic_id: string
          code: string
          created_at: string
          default_price_paise: number
          default_scope: Database["public"]["Enums"]["dental_scope"]
          default_sittings: number
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tooth_effect: Database["public"]["Enums"]["tooth_effect"]
          updated_at: string
        }
        Insert: {
          clinic_id: string
          code: string
          created_at?: string
          default_price_paise?: number
          default_scope?: Database["public"]["Enums"]["dental_scope"]
          default_sittings?: number
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          tooth_effect?: Database["public"]["Enums"]["tooth_effect"]
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          code?: string
          created_at?: string
          default_price_paise?: number
          default_scope?: Database["public"]["Enums"]["dental_scope"]
          default_sittings?: number
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          tooth_effect?: Database["public"]["Enums"]["tooth_effect"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "procedure_catalogue_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
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
      refunds: {
        Row: {
          amount_paise: number
          clinic_id: string
          created_at: string
          id: string
          payment_id: string
          reason: string
          recorded_by: string | null
          refunded_at: string
        }
        Insert: {
          amount_paise: number
          clinic_id: string
          created_at?: string
          id?: string
          payment_id: string
          reason: string
          recorded_by?: string | null
          refunded_at?: string
        }
        Update: {
          amount_paise?: number
          clinic_id?: string
          created_at?: string
          id?: string
          payment_id?: string
          reason?: string
          recorded_by?: string | null
          refunded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_same_clinic"
            columns: ["payment_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "refunds_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_recorder_same_clinic"
            columns: ["recorded_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      tooth_findings: {
        Row: {
          clinic_id: string
          created_at: string
          encounter_id: string | null
          finding: string
          id: string
          note: string | null
          observed_at: string
          patient_id: string
          recorded_by: string | null
          resolved_at: string | null
          severity: string | null
          state: string
          surfaces: string[]
          tooth_fdi: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          encounter_id?: string | null
          finding: string
          id?: string
          note?: string | null
          observed_at?: string
          patient_id: string
          recorded_by?: string | null
          resolved_at?: string | null
          severity?: string | null
          state?: string
          surfaces?: string[]
          tooth_fdi: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          encounter_id?: string | null
          finding?: string
          id?: string
          note?: string | null
          observed_at?: string
          patient_id?: string
          recorded_by?: string | null
          resolved_at?: string | null
          severity?: string | null
          state?: string
          surfaces?: string[]
          tooth_fdi?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tooth_findings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tooth_findings_encounter_id_fkey"
            columns: ["encounter_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tooth_findings_encounter_same_clinic"
            columns: ["encounter_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "encounters"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "tooth_findings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tooth_findings_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "tooth_findings_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tooth_findings_recorder_same_clinic"
            columns: ["recorded_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
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
      treatment_plan_items: {
        Row: {
          arch: Database["public"]["Enums"]["dental_arch"] | null
          catalogue_id: string | null
          clinic_id: string
          completed_at: string | null
          created_at: string
          discount_paise: number
          id: string
          note: string | null
          phase: number
          plan_id: string
          planned_sittings: number | null
          procedure_name: string
          quadrant: number | null
          quantity: number
          scope: Database["public"]["Enums"]["dental_scope"]
          sort_order: number
          status: string
          surfaces: string[]
          tooth_fdi: number | null
          unit_price_paise: number
          updated_at: string
        }
        Insert: {
          arch?: Database["public"]["Enums"]["dental_arch"] | null
          catalogue_id?: string | null
          clinic_id: string
          completed_at?: string | null
          created_at?: string
          discount_paise?: number
          id?: string
          note?: string | null
          phase?: number
          plan_id: string
          planned_sittings?: number | null
          procedure_name: string
          quadrant?: number | null
          quantity?: number
          scope?: Database["public"]["Enums"]["dental_scope"]
          sort_order?: number
          status?: string
          surfaces?: string[]
          tooth_fdi?: number | null
          unit_price_paise?: number
          updated_at?: string
        }
        Update: {
          arch?: Database["public"]["Enums"]["dental_arch"] | null
          catalogue_id?: string | null
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          discount_paise?: number
          id?: string
          note?: string | null
          phase?: number
          plan_id?: string
          planned_sittings?: number | null
          procedure_name?: string
          quadrant?: number | null
          quantity?: number
          scope?: Database["public"]["Enums"]["dental_scope"]
          sort_order?: number
          status?: string
          surfaces?: string[]
          tooth_fdi?: number | null
          unit_price_paise?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_items_catalogue_id_fkey"
            columns: ["catalogue_id"]
            isOneToOne: false
            referencedRelation: "procedure_catalogue"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_items_catalogue_same_clinic"
            columns: ["catalogue_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "procedure_catalogue"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "treatment_plan_items_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_items_plan_same_clinic"
            columns: ["plan_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
      treatment_plans: {
        Row: {
          accepted_at: string | null
          clinic_id: string
          clinician_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          diagnosis: string | null
          id: string
          patient_id: string
          priority: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          clinic_id: string
          clinician_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          id?: string
          patient_id: string
          priority?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          clinic_id?: string
          clinician_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          diagnosis?: string | null
          id?: string
          patient_id?: string
          priority?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plans_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_clinician_id_fkey"
            columns: ["clinician_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_clinician_same_clinic"
            columns: ["clinician_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "treatment_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_creator_same_clinic"
            columns: ["created_by", "clinic_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id", "clinic_id"]
          },
          {
            foreignKeyName: "treatment_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_patient_same_clinic"
            columns: ["patient_id", "clinic_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id", "clinic_id"]
          },
        ]
      }
    }
    Views: {
      inventory_stock: {
        Row: {
          category: string | null
          clinic_id: string | null
          id: string | null
          is_active: boolean | null
          name: string | null
          nearest_expiry: string | null
          on_hand: number | null
          reorder_level: number | null
          sku: string | null
          supplier_name: string | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
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
          practice_role: Database["public"]["Enums"]["practice_role"]
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
      audio_retention_health: {
        Args: { p_limit?: number }
        Returns: {
          detail: string
          outcome: string
          ran_at: string
          status_code: number
        }[]
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
          appointment_id: string | null
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
      create_manual_dental_draft: {
        Args: {
          p_encounter_id: string
          p_prescription?: Json
          p_procedures?: Json
          p_values: Json
        }
        Returns: {
          age_years: number | null
          appointment_id: string | null
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
      create_manual_draft: {
        Args: { p_encounter_id: string; p_prescription?: Json; p_values: Json }
        Returns: {
          age_years: number | null
          appointment_id: string | null
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
      current_practice_role: {
        Args: never
        Returns: Database["public"]["Enums"]["practice_role"]
      }
      decline_clinic_member: {
        Args: { p_doctor_id: string }
        Returns: undefined
      }
      discard_draft_workflow: {
        Args: { p_encounter_id: string; p_expected_version?: number }
        Returns: {
          age_years: number | null
          appointment_id: string | null
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
      ensure_procedure_catalogue: { Args: never; Returns: undefined }
      expired_audio_paths: {
        Args: { p_limit?: number }
        Returns: {
          audio_path: string
          id: string
        }[]
      }
      has_practice_access: {
        Args: { p_area: string; p_write?: boolean }
        Returns: boolean
      }
      is_fdi_tooth: { Args: { p_tooth: number }; Returns: boolean }
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
        Args: {
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_since?: string
        }
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
      list_procedure_catalogue: {
        Args: { p_include_inactive?: boolean }
        Returns: {
          clinic_id: string
          code: string
          created_at: string
          default_price_paise: number
          default_scope: Database["public"]["Enums"]["dental_scope"]
          default_sittings: number
          id: string
          is_active: boolean
          name: string
          sort_order: number
          tooth_effect: Database["public"]["Enums"]["tooth_effect"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "procedure_catalogue"
          isOneToOne: false
          isSetofReturn: true
        }
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
      patient_tooth_procedures: {
        Args: { p_patient_id: string }
        Returns: {
          encounter_id: string
          occurred_at: string
          procedure_name: string
          sitting_number: number
          status: string
          surfaces: string[]
          tooth_effect: Database["public"]["Enums"]["tooth_effect"]
          tooth_fdi: number
          total_sittings: number
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
          procedures: string[]
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
      replace_procedure_items_internal: {
        Args: { p_clinic_id: string; p_encounter_id: string; p_items: Json }
        Returns: undefined
      }
      restore_discarded_draft_workflow: {
        Args: { p_encounter_id: string; p_expected_version?: number }
        Returns: {
          age_years: number | null
          appointment_id: string | null
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
      run_audio_retention: { Args: never; Returns: number }
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
          appointment_id: string | null
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
      save_dental_draft: {
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
          p_procedures?: Json
          p_transcript_id: string
          p_treatment: string
        }
        Returns: {
          age_years: number | null
          appointment_id: string | null
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
          appointment_id: string | null
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
      seed_clinic_procedure_catalogue: {
        Args: { p_clinic_id: string }
        Returns: undefined
      }
      set_retention_secret: { Args: { p_secret: string }; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      surfaces_are_distinct: {
        Args: { p_surfaces: string[] }
        Returns: boolean
      }
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
      update_dental_draft_workflow: {
        Args: {
          p_consultation_fee_inr?: number
          p_encounter_id: string
          p_expected_version?: number
          p_patch: Json
          p_prescription?: Json
          p_procedures?: Json
          p_set_consultation_fee?: boolean
          p_tooth_findings?: Json
        }
        Returns: {
          age_years: number | null
          appointment_id: string | null
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
          practice_role: Database["public"]["Enums"]["practice_role"]
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
          appointment_id: string | null
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
          appointment_id: string | null
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
      dental_arch: "upper" | "lower"
      dental_scope: "tooth" | "quadrant" | "arch" | "full_mouth" | "other"
      encounter_status: "draft" | "committed" | "discarded"
      membership_status: "pending" | "active"
      practice_role:
        | "owner"
        | "dentist"
        | "hygienist"
        | "assistant"
        | "receptionist"
        | "accountant"
        | "stock_manager"
      stt_provider: "sarvam" | "elevenlabs" | "indicconformer" | "mock"
      tooth_effect:
        | "none"
        | "restores"
        | "root_treats"
        | "crowns"
        | "extracts"
        | "implants"
        | "seals"
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
      dental_arch: ["upper", "lower"],
      dental_scope: ["tooth", "quadrant", "arch", "full_mouth", "other"],
      encounter_status: ["draft", "committed", "discarded"],
      membership_status: ["pending", "active"],
      practice_role: [
        "owner",
        "dentist",
        "hygienist",
        "assistant",
        "receptionist",
        "accountant",
        "stock_manager",
      ],
      stt_provider: ["sarvam", "elevenlabs", "indicconformer", "mock"],
      tooth_effect: [
        "none",
        "restores",
        "root_treats",
        "crowns",
        "extracts",
        "implants",
        "seals",
      ],
    },
  },
} as const
