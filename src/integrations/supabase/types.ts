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
      beneficiaries: {
        Row: {
          created_at: string
          display_order: number
          full_name: string
          id: string
          percentage: number | null
          policy_id: string
          relationship: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          full_name: string
          id?: string
          percentage?: number | null
          policy_id: string
          relationship?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          full_name?: string
          id?: string
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
          program_id: string
          status: Database["public"]["Enums"]["client_program_status"]
        }
        Insert: {
          cancelled_at?: string | null
          client_id: string
          created_at?: string
          enrolled_at?: string
          id?: string
          program_id: string
          status?: Database["public"]["Enums"]["client_program_status"]
        }
        Update: {
          cancelled_at?: string | null
          client_id?: string
          created_at?: string
          enrolled_at?: string
          id?: string
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
          number: string | null
          phone: string | null
          referral_source_id: string | null
          rfc: string | null
          sales_rep_id: string | null
          state: string | null
          street: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
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
          number?: string | null
          phone?: string | null
          referral_source_id?: string | null
          rfc?: string | null
          sales_rep_id?: string | null
          state?: string | null
          street?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
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
          number?: string | null
          phone?: string | null
          referral_source_id?: string | null
          rfc?: string | null
          sales_rep_id?: string | null
          state?: string | null
          street?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      dependents: {
        Row: {
          created_at: string
          date_of_birth: string | null
          full_name: string
          id: string
          policy_id: string
          relationship: string | null
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          full_name: string
          id?: string
          policy_id: string
          relationship?: string | null
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          full_name?: string
          id?: string
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
          approved_at: string | null
          approved_by: string | null
          client_id: string
          created_at: string
          created_by: string | null
          description: string | null
          hospital: string | null
          id: string
          location_description: string | null
          occurred_at: string
          policy_id: string
          status: Database["public"]["Enums"]["incident_status"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          hospital?: string | null
          id?: string
          location_description?: string | null
          occurred_at: string
          policy_id: string
          status?: Database["public"]["Enums"]["incident_status"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          hospital?: string | null
          id?: string
          location_description?: string | null
          occurred_at?: string
          policy_id?: string
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
          director_signature_url: string | null
          id: string
          incident_id: string
          pdf_url: string | null
          policy_id: string
          snapshot: Json
          valid_from: string
          valid_until: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          director_signature_url?: string | null
          id?: string
          incident_id: string
          pdf_url?: string | null
          policy_id: string
          snapshot: Json
          valid_from?: string
          valid_until: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          director_signature_url?: string | null
          id?: string
          incident_id?: string
          pdf_url?: string | null
          policy_id?: string
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
      payment_schedules: {
        Row: {
          amount: number
          auto_charge: boolean
          created_at: string
          frequency: Database["public"]["Enums"]["payment_frequency"]
          id: string
          is_recurring: boolean
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
          created_at: string
          created_by: string | null
          due_date: string | null
          failure_reason: string | null
          id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          paid_at: string | null
          policy_id: string
          provider: string | null
          provider_transaction_id: string | null
          reconciled: boolean
          status: Database["public"]["Enums"]["payment_status"]
        }
        Insert: {
          amount: number
          bank_reference?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          failure_reason?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          paid_at?: string | null
          policy_id: string
          provider?: string | null
          provider_transaction_id?: string | null
          reconciled?: boolean
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Update: {
          amount?: number
          bank_reference?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          failure_reason?: string | null
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          paid_at?: string | null
          policy_id?: string
          provider?: string | null
          provider_transaction_id?: string | null
          reconciled?: boolean
          status?: Database["public"]["Enums"]["payment_status"]
        }
        Relationships: [
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
          policy_number: string | null
          premium: number | null
          program_id: string
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
          policy_number?: string | null
          premium?: number | null
          program_id: string
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
          policy_number?: string | null
          premium?: number | null
          program_id?: string
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
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
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
      [_ in never]: never
    }
    Functions: {
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
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      next_policy_folio: { Args: { _program_id: string }; Returns: string }
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
