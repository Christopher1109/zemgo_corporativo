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
      _secret_keys: {
        Row: {
          created_at: string
          name: string
          value: string
        }
        Insert: {
          created_at?: string
          name: string
          value: string
        }
        Update: {
          created_at?: string
          name?: string
          value?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          program_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          program_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          program_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliation_log: {
        Row: {
          amount: number | null
          error_message: string | null
          id: string
          payment_id: string | null
          raw_payload: Json | null
          received_at: string
          reference: string | null
          source_ip: string | null
          status: string
        }
        Insert: {
          amount?: number | null
          error_message?: string | null
          id?: string
          payment_id?: string | null
          raw_payload?: Json | null
          received_at?: string
          reference?: string | null
          source_ip?: string | null
          status: string
        }
        Update: {
          amount?: number | null
          error_message?: string | null
          id?: string
          payment_id?: string | null
          raw_payload?: Json | null
          received_at?: string
          reference?: string | null
          source_ip?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliation_log_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      beneficiaries: {
        Row: {
          created_at: string
          display_order: number
          full_name: string
          id: string
          metadata: Json
          percentage: number | null
          policy_id: string
          relationship: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          full_name: string
          id?: string
          metadata?: Json
          percentage?: number | null
          policy_id: string
          relationship?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          full_name?: string
          id?: string
          metadata?: Json
          percentage?: number | null
          policy_id?: string
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "beneficiaries_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      client_programs: {
        Row: {
          cancelled_at: string | null
          client_id: string
          created_at: string
          enrolled_at: string
          id: string
          metadata: Json
          program_id: string
          status: Database["public"]["Enums"]["client_program_status"]
        }
        Insert: {
          cancelled_at?: string | null
          client_id: string
          created_at?: string
          enrolled_at?: string
          id?: string
          metadata?: Json
          program_id: string
          status?: Database["public"]["Enums"]["client_program_status"]
        }
        Update: {
          cancelled_at?: string | null
          client_id?: string
          created_at?: string
          enrolled_at?: string
          id?: string
          metadata?: Json
          program_id?: string
          status?: Database["public"]["Enums"]["client_program_status"]
        }
        Relationships: [
          {
            foreignKeyName: "client_programs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_programs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address_full: string | null
          city: string | null
          colonia: string | null
          created_at: string
          created_by: string | null
          curp: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          gender: string | null
          id: string
          last_name: string
          marital_status: string | null
          metadata: Json
          number: string | null
          phone: string | null
          phone_alt: string | null
          referral_source_id: string | null
          rfc: string | null
          sales_rep_id: string | null
          state: string | null
          street: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address_full?: string | null
          city?: string | null
          colonia?: string | null
          created_at?: string
          created_by?: string | null
          curp: string
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          gender?: string | null
          id?: string
          last_name: string
          marital_status?: string | null
          metadata?: Json
          number?: string | null
          phone?: string | null
          phone_alt?: string | null
          referral_source_id?: string | null
          rfc?: string | null
          sales_rep_id?: string | null
          state?: string | null
          street?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address_full?: string | null
          city?: string | null
          colonia?: string | null
          created_at?: string
          created_by?: string | null
          curp?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          last_name?: string
          marital_status?: string | null
          metadata?: Json
          number?: string | null
          phone?: string | null
          phone_alt?: string | null
          referral_source_id?: string | null
          rfc?: string | null
          sales_rep_id?: string | null
          state?: string | null
          street?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
        ]
      }
      dependents: {
        Row: {
          created_at: string
          date_of_birth: string | null
          full_name: string
          id: string
          metadata: Json
          policy_id: string
          relationship: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          id?: string
          metadata?: Json
          policy_id: string
          relationship?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          id?: string
          metadata?: Json
          policy_id?: string
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dependents_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          file_name: string | null
          file_url: string
          id: string
          kind: string | null
          mime_type: string | null
          owner_id: string
          owner_type: Database["public"]["Enums"]["document_owner_type"]
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_url: string
          id?: string
          kind?: string | null
          mime_type?: string | null
          owner_id: string
          owner_type: Database["public"]["Enums"]["document_owner_type"]
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_url?: string
          id?: string
          kind?: string | null
          mime_type?: string | null
          owner_id?: string
          owner_type?: Database["public"]["Enums"]["document_owner_type"]
          uploaded_by?: string | null
        }
        Relationships: []
      }
      incidents: {
        Row: {
          accident_date: string | null
          accident_time: string | null
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          created_by: string | null
          description: string | null
          hospital: string | null
          id: string
          location_description: string | null
          metadata: Json
          occurred_at: string
          policy_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          reported_at: string
          status: Database["public"]["Enums"]["incident_status"]
          updated_at: string
        }
        Insert: {
          accident_date?: string | null
          accident_time?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          hospital?: string | null
          id?: string
          location_description?: string | null
          metadata?: Json
          occurred_at: string
          policy_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reported_at?: string
          status?: Database["public"]["Enums"]["incident_status"]
          updated_at?: string
        }
        Update: {
          accident_date?: string | null
          accident_time?: string | null
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          hospital?: string | null
          id?: string
          location_description?: string | null
          metadata?: Json
          occurred_at?: string
          policy_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reported_at?: string
          status?: Database["public"]["Enums"]["incident_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      medical_passes: {
        Row: {
          created_at: string
          created_by: string | null
          director_id: string | null
          director_name: string | null
          director_signature_url: string | null
          id: string
          incident_id: string
          issued_by: string | null
          metadata: Json
          pdf_url: string | null
          policy_id: string
          revocation_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          snapshot: Json
          valid_from: string
          valid_until: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          director_id?: string | null
          director_name?: string | null
          director_signature_url?: string | null
          id?: string
          incident_id: string
          issued_by?: string | null
          metadata?: Json
          pdf_url?: string | null
          policy_id: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          snapshot: Json
          valid_from?: string
          valid_until: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          director_id?: string | null
          director_name?: string | null
          director_signature_url?: string | null
          id?: string
          incident_id?: string
          issued_by?: string | null
          metadata?: Json
          pdf_url?: string | null
          policy_id?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          snapshot?: Json
          valid_from?: string
          valid_until?: string
        }
        Relationships: [
          {
            foreignKeyName: "medical_passes_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medical_passes_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          code: string
          created_at: string
          id: string
          subject: string | null
        }
        Insert: {
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          code: string
          created_at?: string
          id?: string
          subject?: string | null
        }
        Update: {
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          code?: string
          created_at?: string
          id?: string
          subject?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: string
          payload: Json | null
          recipient: string
          sent_at: string | null
          status: string
          template_code: string | null
        }
        Insert: {
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          payload?: Json | null
          recipient: string
          sent_at?: string | null
          status?: string
          template_code?: string | null
        }
        Update: {
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: string
          payload?: Json | null
          recipient?: string
          sent_at?: string | null
          status?: string
          template_code?: string | null
        }
        Relationships: []
      }
      payment_reconciliations: {
        Row: {
          amount: number
          created_at: string
          external_id: string | null
          id: string
          paid_at: string
          payment_id: string
          raw_payload: Json | null
          reference: string
          source: string
        }
        Insert: {
          amount: number
          created_at?: string
          external_id?: string | null
          id?: string
          paid_at?: string
          payment_id: string
          raw_payload?: Json | null
          reference: string
          source: string
        }
        Update: {
          amount?: number
          created_at?: string
          external_id?: string | null
          id?: string
          paid_at?: string
          payment_id?: string
          raw_payload?: Json | null
          reference?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reconciliations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_schedules: {
        Row: {
          amount: number
          auto_charge: boolean
          created_at: string
          frequency: Database["public"]["Enums"]["payment_frequency"]
          id: string
          is_recurring: boolean
          metadata: Json
          next_due_date: string | null
          policy_id: string
          reminder_days_before: number
        }
        Insert: {
          amount: number
          auto_charge?: boolean
          created_at?: string
          frequency?: Database["public"]["Enums"]["payment_frequency"]
          id?: string
          is_recurring?: boolean
          metadata?: Json
          next_due_date?: string | null
          policy_id: string
          reminder_days_before?: number
        }
        Update: {
          amount?: number
          auto_charge?: boolean
          created_at?: string
          frequency?: Database["public"]["Enums"]["payment_frequency"]
          id?: string
          is_recurring?: boolean
          metadata?: Json
          next_due_date?: string | null
          policy_id?: string
          reminder_days_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "payment_schedules_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_reference: string | null
          bank_reference_expires_at: string | null
          cancellation_reason: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          failure_reason: string | null
          id: string
          metadata: Json
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          paid_amount: number | null
          paid_at: string | null
          payment_schedule_id: string | null
          policy_id: string
          provider: string | null
          provider_transaction_id: string | null
          reconciled: boolean
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          bank_reference?: string | null
          bank_reference_expires_at?: string | null
          cancellation_reason?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_schedule_id?: string | null
          policy_id: string
          provider?: string | null
          provider_transaction_id?: string | null
          reconciled?: boolean
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_reference?: string | null
          bank_reference_expires_at?: string | null
          cancellation_reason?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          failure_reason?: string | null
          id?: string
          metadata?: Json
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          payment_schedule_id?: string | null
          policy_id?: string
          provider?: string | null
          provider_transaction_id?: string | null
          reconciled?: boolean
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_payment_schedule_id_fkey"
            columns: ["payment_schedule_id"]
            isOneToOne: false
            referencedRelation: "payment_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      policies: {
        Row: {
          certificate_number: string | null
          certificate_pdf_url: string | null
          client_id: string
          contracting_party: string | null
          created_at: string
          created_by: string | null
          deductible: number | null
          end_date: string | null
          folio: string
          id: string
          issue_date: string | null
          metadata: Json
          policy_number: string | null
          premium: number | null
          program_id: string
          renewed_from_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["policy_status"]
          sum_insured: number | null
          updated_at: string
        }
        Insert: {
          certificate_number?: string | null
          certificate_pdf_url?: string | null
          client_id: string
          contracting_party?: string | null
          created_at?: string
          created_by?: string | null
          deductible?: number | null
          end_date?: string | null
          folio: string
          id?: string
          issue_date?: string | null
          metadata?: Json
          policy_number?: string | null
          premium?: number | null
          program_id: string
          renewed_from_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["policy_status"]
          sum_insured?: number | null
          updated_at?: string
        }
        Update: {
          certificate_number?: string | null
          certificate_pdf_url?: string | null
          client_id?: string
          contracting_party?: string | null
          created_at?: string
          created_by?: string | null
          deductible?: number | null
          end_date?: string | null
          folio?: string
          id?: string
          issue_date?: string | null
          metadata?: Json
          policy_number?: string | null
          premium?: number | null
          program_id?: string
          renewed_from_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["policy_status"]
          sum_insured?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "policies_renewed_from_id_fkey"
            columns: ["renewed_from_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_folio_counters: {
        Row: {
          last_number: number
          program_id: string
          updated_at: string
          year: number
        }
        Insert: {
          last_number?: number
          program_id: string
          updated_at?: string
          year: number
        }
        Update: {
          last_number?: number
          program_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "policy_folio_counters_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: true
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_revisions: {
        Row: {
          created_at: string
          edited_at: string
          edited_by: string | null
          fields_changed: Json
          id: string
          new_values: Json
          policy_id: string
          previous_values: Json
        }
        Insert: {
          created_at?: string
          edited_at?: string
          edited_by?: string | null
          fields_changed?: Json
          id?: string
          new_values?: Json
          policy_id: string
          previous_values?: Json
        }
        Update: {
          created_at?: string
          edited_at?: string
          edited_by?: string | null
          fields_changed?: Json
          id?: string
          new_values?: Json
          policy_id?: string
          previous_values?: Json
        }
        Relationships: [
          {
            foreignKeyName: "policy_revisions_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_access_codes: {
        Row: {
          attempts: number
          client_id: string
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          ip_address: unknown
          used_at: string | null
        }
        Insert: {
          attempts?: number
          client_id: string
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: unknown
          used_at?: string | null
        }
        Update: {
          attempts?: number
          client_id?: string
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: unknown
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_access_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      portal_login_attempts: {
        Row: {
          blocked_until: string | null
          curp: string
          failed_count: number
          last_attempt_at: string
          updated_at: string
        }
        Insert: {
          blocked_until?: string | null
          curp: string
          failed_count?: number
          last_attempt_at?: string
          updated_at?: string
        }
        Update: {
          blocked_until?: string | null
          curp?: string
          failed_count?: number
          last_attempt_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      portal_login_attempts_by_ip: {
        Row: {
          blocked_until: string | null
          failed_count: number
          ip: unknown
          last_attempt_at: string
          updated_at: string
        }
        Insert: {
          blocked_until?: string | null
          failed_count?: number
          ip: unknown
          last_attempt_at?: string
          updated_at?: string
        }
        Update: {
          blocked_until?: string | null
          failed_count?: number
          ip?: unknown
          last_attempt_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      portal_sessions: {
        Row: {
          client_id: string
          created_at: string
          expires_at: string
          id: string
          ip_address: unknown
          revoked_at: string | null
          token_hash: string
          user_agent: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          expires_at: string
          id?: string
          ip_address?: unknown
          revoked_at?: string | null
          token_hash: string
          user_agent?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: unknown
          revoked_at?: string | null
          token_hash?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portal_sessions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          metadata: Json
          phone: string | null
          signature_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          metadata?: Json
          phone?: string | null
          signature_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          metadata?: Json
          phone?: string | null
          signature_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      program_coverages: {
        Row: {
          code: string
          description: string
          display_order: number
          id: string
          is_included: boolean
          note: string | null
          program_id: string
          sum_insured: number | null
        }
        Insert: {
          code: string
          description: string
          display_order?: number
          id?: string
          is_included?: boolean
          note?: string | null
          program_id: string
          sum_insured?: number | null
        }
        Update: {
          code?: string
          description?: string
          display_order?: number
          id?: string
          is_included?: boolean
          note?: string | null
          program_id?: string
          sum_insured?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "program_coverages_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          billing_note: string | null
          code: string
          color_accent: string
          color_primary: string
          color_secondary: string
          created_at: string
          id: string
          insurance_branch: string
          is_active: boolean
          name: string
          payment_alert_offsets: number[]
        }
        Insert: {
          billing_note?: string | null
          code: string
          color_accent: string
          color_primary: string
          color_secondary: string
          created_at?: string
          id?: string
          insurance_branch: string
          is_active?: boolean
          name: string
          payment_alert_offsets?: number[]
        }
        Update: {
          billing_note?: string | null
          code?: string
          color_accent?: string
          color_primary?: string
          color_secondary?: string
          created_at?: string
          id?: string
          insurance_branch?: string
          is_active?: boolean
          name?: string
          payment_alert_offsets?: number[]
        }
        Relationships: []
      }
      renewal_contacts: {
        Row: {
          contacted_at: string
          contacted_by: string
          created_at: string
          id: string
          metadata: Json | null
          notes: string | null
          policy_id: string
        }
        Insert: {
          contacted_at?: string
          contacted_by: string
          created_at?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          policy_id: string
        }
        Update: {
          contacted_at?: string
          contacted_by?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          policy_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_contacts_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          accessible_to_roles: Database["public"]["Enums"]["app_role"][] | null
          admin_only: boolean
          code: string
          created_at: string
          default_filters: Json | null
          description: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          accessible_to_roles?: Database["public"]["Enums"]["app_role"][] | null
          admin_only?: boolean
          code: string
          created_at?: string
          default_filters?: Json | null
          description?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          accessible_to_roles?: Database["public"]["Enums"]["app_role"][] | null
          admin_only?: boolean
          code?: string
          created_at?: string
          default_filters?: Json | null
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      roles: {
        Row: {
          code: Database["public"]["Enums"]["app_role"]
          description: string | null
          name: string
        }
        Insert: {
          code: Database["public"]["Enums"]["app_role"]
          description?: string | null
          name: string
        }
        Update: {
          code?: Database["public"]["Enums"]["app_role"]
          description?: string | null
          name?: string
        }
        Relationships: []
      }
      sales_reps: {
        Row: {
          code: string | null
          commission_rate: number | null
          created_at: string
          created_by_sheet_sync: boolean
          full_name: string
          id: string
          is_active: boolean
          metadata: Json | null
          referral_source: string | null
          updated_at: string
        }
        Insert: {
          code?: string | null
          commission_rate?: number | null
          created_at?: string
          created_by_sheet_sync?: boolean
          full_name: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          referral_source?: string | null
          updated_at?: string
        }
        Update: {
          code?: string | null
          commission_rate?: number | null
          created_at?: string
          created_by_sheet_sync?: boolean
          full_name?: string
          id?: string
          is_active?: boolean
          metadata?: Json | null
          referral_source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      saved_report_filters: {
        Row: {
          created_at: string
          filters_json: Json
          id: string
          name: string
          report_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters_json?: Json
          id?: string
          name: string
          report_code: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters_json?: Json
          id?: string
          name?: string
          report_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_report_filters_report_code_fkey"
            columns: ["report_code"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["code"]
          },
        ]
      }
      sheet_sync_log: {
        Row: {
          details: Json
          duration_ms: number | null
          ended_at: string | null
          error: string | null
          id: string
          rows_detected: number | null
          rows_failed: number
          rows_imported: number | null
          rows_new: number
          rows_skipped: number | null
          rows_updated: number
          sheet_id: string
          sheet_program: string | null
          started_at: string
          status: string
          warnings: Json
        }
        Insert: {
          details?: Json
          duration_ms?: number | null
          ended_at?: string | null
          error?: string | null
          id?: string
          rows_detected?: number | null
          rows_failed?: number
          rows_imported?: number | null
          rows_new?: number
          rows_skipped?: number | null
          rows_updated?: number
          sheet_id: string
          sheet_program?: string | null
          started_at?: string
          status?: string
          warnings?: Json
        }
        Update: {
          details?: Json
          duration_ms?: number | null
          ended_at?: string | null
          error?: string | null
          id?: string
          rows_detected?: number | null
          rows_failed?: number
          rows_imported?: number | null
          rows_new?: number
          rows_skipped?: number | null
          rows_updated?: number
          sheet_id?: string
          sheet_program?: string | null
          started_at?: string
          status?: string
          warnings?: Json
        }
        Relationships: []
      }
      sheet_synced_rows: {
        Row: {
          client_id: string | null
          created_at: string
          error_message: string | null
          folio: string | null
          id: string
          last_synced_at: string
          policy_id: string | null
          raw_data: Json
          row_hash: string
          row_number: number
          sheet_id: string
          sheet_program: string
          status: string
          updated_at: string
          warnings: Json
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          folio?: string | null
          id?: string
          last_synced_at?: string
          policy_id?: string | null
          raw_data?: Json
          row_hash: string
          row_number: number
          sheet_id: string
          sheet_program: string
          status?: string
          updated_at?: string
          warnings?: Json
        }
        Update: {
          client_id?: string | null
          created_at?: string
          error_message?: string | null
          folio?: string | null
          id?: string
          last_synced_at?: string
          policy_id?: string | null
          raw_data?: Json
          row_hash?: string
          row_number?: number
          sheet_id?: string
          sheet_program?: string
          status?: string
          updated_at?: string
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sheet_synced_rows_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sheet_synced_rows_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "policies"
            referencedColumns: ["id"]
          },
        ]
      }
      system_config: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      user_program_access: {
        Row: {
          created_at: string
          id: string
          program_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          program_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          program_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_program_access_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mv_monthly_collection: {
        Row: {
          month: string | null
          payment_count: number | null
          program_id: string | null
          total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "policies_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_monthly_new_clients: {
        Row: {
          count: number | null
          month: string | null
          program_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_programs_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_invite_access_matrix: {
        Args: { _access: Json; _phone: string; _user_id: string }
        Returns: Json
      }
      cancel_payment: {
        Args: { _payment_id: string; _reason: string }
        Returns: undefined
      }
      create_payment_schedule_for_policy: {
        Args: { _policy_id: string }
        Returns: string
      }
      deactivate_user: {
        Args: { _reason: string; _user_id: string }
        Returns: undefined
      }
      finish_sheet_sync: {
        Args: {
          _details?: Json
          _detected: number
          _error?: string
          _failed: number
          _log_id: string
          _new: number
          _skipped: number
          _updated: number
          _warnings?: Json
        }
        Returns: undefined
      }
      generate_bank_reference: { Args: { _payment_id: string }; Returns: Json }
      get_action_items: { Args: { _program_id: string }; Returns: Json }
      get_dashboard_kpis: { Args: { _program_id: string }; Returns: Json }
      get_google_sheets_credentials: { Args: never; Returns: Json }
      get_google_sheets_credentials_meta: { Args: never; Returns: Json }
      get_policies_by_state: {
        Args: { _program_id: string }
        Returns: {
          active: number
          expired: number
          state: string
          suspended: number
          total: number
        }[]
      }
      get_policy_distribution: {
        Args: never
        Returns: {
          code: string
          color: string
          count: number
          name: string
          program_id: string
        }[]
      }
      get_portal_dashboard: { Args: { _token: string }; Returns: Json }
      get_portal_incidents: { Args: { _token: string }; Returns: Json }
      get_portal_payments: { Args: { _token: string }; Returns: Json }
      get_portal_policies: { Args: { _token: string }; Returns: Json }
      get_recent_activity: {
        Args: { _limit?: number; _program_id: string }
        Returns: {
          action: string
          created_at: string
          diff: Json
          entity_id: string
          entity_type: string
          id: string
          program_code: string
          program_id: string
          user_name: string
        }[]
      }
      get_top_debtors: {
        Args: { _limit?: number; _program_id: string }
        Returns: {
          client_id: string
          full_name: string
          oldest_due: string
          program_code: string
          total_overdue: number
        }[]
      }
      has_program_access: {
        Args: { _program_id: string; _user_id: string }
        Returns: boolean
      }
      has_program_role: {
        Args: {
          _program_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      is_last_admin_in_program: {
        Args: { _program_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_valid_curp: { Args: { _curp: string }; Returns: boolean }
      issue_medical_pass: {
        Args: { _director_id: string; _hospital: string; _incident_id: string }
        Returns: string
      }
      log_renewal_contact: {
        Args: { _notes: string; _policy_id: string }
        Returns: string
      }
      mark_payment_paid: {
        Args: {
          _amount_change_reason: string
          _method: Database["public"]["Enums"]["payment_method"]
          _notes: string
          _paid_amount: number
          _paid_at: string
          _payment_id: string
          _reference: string
        }
        Returns: Json
      }
      next_policy_folio: { Args: { _program_id: string }; Returns: string }
      process_sheet_row: {
        Args: {
          _program: string
          _row_data: Json
          _row_hash: string
          _row_number: number
          _sheet_id: string
        }
        Returns: Json
      }
      reactivate_user: { Args: { _user_id: string }; Returns: undefined }
      reconcile_payment_by_reference: {
        Args: {
          _amount: number
          _external_id: string
          _paid_at: string
          _raw: Json
          _reference: string
          _source?: string
        }
        Returns: Json
      }
      refresh_dashboard_mvs: { Args: never; Returns: Json }
      refund_payment: {
        Args: { _payment_id: string; _reason: string }
        Returns: undefined
      }
      reject_incident: {
        Args: { _incident_id: string; _reason: string }
        Returns: undefined
      }
      renew_policy: {
        Args: { _overrides?: Json; _source_id: string }
        Returns: Json
      }
      report_incident: {
        Args: {
          _accident_date: string
          _accident_time: string
          _description: string
          _hospital: string
          _location: string
          _policy_id: string
        }
        Returns: string
      }
      report_portal_incident: {
        Args: {
          _accident_date: string
          _accident_time: string
          _description: string
          _hospital: string
          _location: string
          _policy_id: string
          _token: string
        }
        Returns: string
      }
      request_portal_access: {
        Args: { _curp: string; _full_name: string }
        Returns: Json
      }
      resolve_portal_session: { Args: { _token: string }; Returns: string }
      revoke_medical_pass: {
        Args: { _pass_id: string; _reason: string }
        Returns: undefined
      }
      revoke_portal_session: { Args: { _token: string }; Returns: undefined }
      run_pass_expiration_check: { Args: never; Returns: Json }
      run_payment_housekeeping: { Args: never; Returns: Json }
      save_google_sheets_credentials: {
        Args: { _json: Json }
        Returns: undefined
      }
      set_medical_pass_pdf_url: {
        Args: { _pass_id: string; _pdf_url: string }
        Returns: undefined
      }
      start_sheet_sync: {
        Args: { _program: string; _sheet_id: string }
        Returns: string
      }
      unaccent: { Args: { "": string }; Returns: string }
      update_policy: {
        Args: { _changes: Json; _policy_id: string }
        Returns: Json
      }
      update_portal_profile: {
        Args: { _changes: Json; _token: string }
        Returns: Json
      }
      update_program_alert_offsets: {
        Args: { _offsets: number[]; _program_id: string }
        Returns: Json
      }
      update_user_program_access: {
        Args: { _program_id: string; _role_text: string; _user_id: string }
        Returns: Json
      }
      upsert_sales_rep_by_name: { Args: { _name: string }; Returns: string }
      verify_portal_code: {
        Args: { _client_id: string; _code: string; _ip: string; _ua: string }
        Returns: Json
      }
      verify_portal_login: {
        Args: { _curp: string; _ip: string; _phone_last4: string; _ua: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "operator" | "claims" | "sales" | "viewer"
      client_program_status: "prospect" | "active" | "inactive" | "cancelled"
      document_owner_type: "client" | "policy" | "incident"
      incident_status:
        | "reported"
        | "pending_review"
        | "pass_issued"
        | "in_treatment"
        | "closed"
        | "rejected"
        | "pass_expired"
      notification_channel: "email" | "whatsapp" | "sms" | "in_app"
      payment_frequency: "monthly" | "yearly" | "one_time"
      payment_method:
        | "bank_reference"
        | "bank_transfer"
        | "cash"
        | "card"
        | "oxxo"
        | "manual"
      payment_status:
        | "pending"
        | "processing"
        | "paid"
        | "failed"
        | "refunded"
        | "cancelled"
        | "overdue"
      policy_status:
        | "draft"
        | "pending_payment"
        | "active"
        | "expired"
        | "cancelled"
        | "suspended"
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
      app_role: ["admin", "manager", "operator", "claims", "sales", "viewer"],
      client_program_status: ["prospect", "active", "inactive", "cancelled"],
      document_owner_type: ["client", "policy", "incident"],
      incident_status: [
        "reported",
        "pending_review",
        "pass_issued",
        "in_treatment",
        "closed",
        "rejected",
        "pass_expired",
      ],
      notification_channel: ["email", "whatsapp", "sms", "in_app"],
      payment_frequency: ["monthly", "yearly", "one_time"],
      payment_method: [
        "bank_reference",
        "bank_transfer",
        "cash",
        "card",
        "oxxo",
        "manual",
      ],
      payment_status: [
        "pending",
        "processing",
        "paid",
        "failed",
        "refunded",
        "cancelled",
        "overdue",
      ],
      policy_status: [
        "draft",
        "pending_payment",
        "active",
        "expired",
        "cancelled",
        "suspended",
      ],
    },
  },
} as const
