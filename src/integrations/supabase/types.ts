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
      attom_call_log: {
        Row: {
          address_normalized: string | null
          cache_hit: boolean
          cost_cents: number
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          requested_by: string | null
          revenue_source: string | null
          status: number | null
        }
        Insert: {
          address_normalized?: string | null
          cache_hit?: boolean
          cost_cents?: number
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          requested_by?: string | null
          revenue_source?: string | null
          status?: number | null
        }
        Update: {
          address_normalized?: string | null
          cache_hit?: boolean
          cost_cents?: number
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          requested_by?: string | null
          revenue_source?: string | null
          status?: number | null
        }
        Relationships: []
      }
      attom_monthly_budget: {
        Row: {
          cache_only_mode: boolean
          calls_used: number
          cost_cents_used: number
          created_at: string
          id: string
          month: string
          notes: string | null
          soft_cap_pct: number
          tier_calls_included: number
          tier_cost_cents: number
          updated_at: string
        }
        Insert: {
          cache_only_mode?: boolean
          calls_used?: number
          cost_cents_used?: number
          created_at?: string
          id?: string
          month: string
          notes?: string | null
          soft_cap_pct?: number
          tier_calls_included?: number
          tier_cost_cents?: number
          updated_at?: string
        }
        Update: {
          cache_only_mode?: boolean
          calls_used?: number
          cost_cents_used?: number
          created_at?: string
          id?: string
          month?: string
          notes?: string | null
          soft_cap_pct?: number
          tier_calls_included?: number
          tier_cost_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      claims: {
        Row: {
          created_at: string
          id: string
          message: string | null
          pro_id: string
          quote: number | null
          request_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string | null
          pro_id: string
          quote?: number | null
          request_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string | null
          pro_id?: string
          quote?: number | null
          request_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claims_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pros_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "claims_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      fello_events: {
        Row: {
          event_type: string
          fello_contact_id: string | null
          id: string
          payload: Json
          processed_at: string | null
          received_at: string
          user_id: string | null
        }
        Insert: {
          event_type: string
          fello_contact_id?: string | null
          id?: string
          payload: Json
          processed_at?: string | null
          received_at?: string
          user_id?: string | null
        }
        Update: {
          event_type?: string
          fello_contact_id?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          received_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      fello_webhook_subscriptions: {
        Row: {
          created_at: string
          event_type: string
          id: string
          status: string
          subscription_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          status?: string
          subscription_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          status?: string
          subscription_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      ghl_sync_queue: {
        Row: {
          attempts: number
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          last_error: string | null
          op: string
          processed_at: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          last_error?: string | null
          op: string
          processed_at?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          last_error?: string | null
          op?: string
          processed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ghl_sync_state: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          ghl_contact_id: string | null
          ghl_opportunity_id: string | null
          id: string
          last_synced_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string | null
          id?: string
          last_synced_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          ghl_contact_id?: string | null
          ghl_opportunity_id?: string | null
          id?: string
          last_synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      home_documents: {
        Row: {
          created_at: string
          id: string
          kind: string
          original_filename: string | null
          size_bytes: number | null
          storage_path: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          original_filename?: string | null
          size_bytes?: number | null
          storage_path: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          original_filename?: string | null
          size_bytes?: number | null
          storage_path?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      homeowner_lender_consents: {
        Row: {
          created_at: string
          granted_at: string | null
          homeowner_id: string
          id: string
          lender_org_id: string
          revoked_at: string | null
          scope: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          granted_at?: string | null
          homeowner_id: string
          id?: string
          lender_org_id: string
          revoked_at?: string | null
          scope?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          granted_at?: string | null
          homeowner_id?: string
          id?: string
          lender_org_id?: string
          revoked_at?: string | null
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homeowner_lender_consents_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignments: {
        Row: {
          claimed_at: string
          created_at: string
          ghl_opportunity_id: string | null
          id: string
          pro_id: string
          service_request_id: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string
          created_at?: string
          ghl_opportunity_id?: string | null
          id?: string
          pro_id: string
          service_request_id: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string
          created_at?: string
          ghl_opportunity_id?: string | null
          id?: string
          pro_id?: string
          service_request_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignments_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_assignments_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pros_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_assignments_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: true
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_offers: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          offered_at: string
          position: number
          pro_id: string
          responded_at: string | null
          service_request_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          offered_at?: string
          position?: number
          pro_id: string
          responded_at?: string | null
          service_request_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          offered_at?: string
          position?: number
          pro_id?: string
          responded_at?: string | null
          service_request_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_offers_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_offers_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pros_directory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_offers_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_activity: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          detail: string | null
          id: string
          lender_org_id: string
          portfolio_client_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          lender_org_id: string
          portfolio_client_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
          lender_org_id?: string
          portfolio_client_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_activity_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lender_activity_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_members: {
        Row: {
          created_at: string
          id: string
          lender_org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lender_org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lender_org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_members_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_orgs: {
        Row: {
          active: boolean
          created_at: string
          id: string
          license_number: string | null
          name: string
          plan: string
          primary_contact_email: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          license_number?: string | null
          name: string
          plan?: string
          primary_contact_email?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          license_number?: string | null
          name?: string
          plan?: string
          primary_contact_email?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lender_portfolio_clients: {
        Row: {
          address_line1: string
          city: string | null
          client_email: string | null
          client_name: string | null
          client_phone: string | null
          close_date: string | null
          created_at: string
          homeowner_id: string | null
          id: string
          last_intel_refreshed_at: string | null
          loan_amount_at_close_cents: number | null
          notes: string | null
          portfolio_id: string
          rate_at_close: number | null
          state: string | null
          term_months: number | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address_line1: string
          city?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          close_date?: string | null
          created_at?: string
          homeowner_id?: string | null
          id?: string
          last_intel_refreshed_at?: string | null
          loan_amount_at_close_cents?: number | null
          notes?: string | null
          portfolio_id: string
          rate_at_close?: number | null
          state?: string | null
          term_months?: number | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address_line1?: string
          city?: string | null
          client_email?: string | null
          client_name?: string | null
          client_phone?: string | null
          close_date?: string | null
          created_at?: string
          homeowner_id?: string | null
          id?: string
          last_intel_refreshed_at?: string | null
          loan_amount_at_close_cents?: number | null
          notes?: string | null
          portfolio_id?: string
          rate_at_close?: number | null
          state?: string | null
          term_months?: number | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lender_portfolio_clients_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      lender_portfolios: {
        Row: {
          created_at: string
          id: string
          lender_org_id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lender_org_id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lender_org_id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_portfolios_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      pro_coverage: {
        Row: {
          category: string
          created_at: string
          id: string
          metro: string | null
          pro_id: string
          zip: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          metro?: string | null
          pro_id: string
          zip?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          metro?: string | null
          pro_id?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pro_coverage_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pro_coverage_pro_id_fkey"
            columns: ["pro_id"]
            isOneToOne: false
            referencedRelation: "pros_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          fello_contact_id: string | null
          fello_equity_cents: number | null
          fello_estimated_value_cents: number | null
          fello_last_synced_at: string | null
          fello_lead_score: number | null
          full_name: string | null
          ghl_last_synced_at: string | null
          id: string
          last_activity_at: string
          lifecycle_stage: Database["public"]["Enums"]["lifecycle_stage"]
          phone: string | null
          state: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          fello_contact_id?: string | null
          fello_equity_cents?: number | null
          fello_estimated_value_cents?: number | null
          fello_last_synced_at?: string | null
          fello_lead_score?: number | null
          full_name?: string | null
          ghl_last_synced_at?: string | null
          id: string
          last_activity_at?: string
          lifecycle_stage?: Database["public"]["Enums"]["lifecycle_stage"]
          phone?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          fello_contact_id?: string | null
          fello_equity_cents?: number | null
          fello_estimated_value_cents?: number | null
          fello_last_synced_at?: string | null
          fello_lead_score?: number | null
          full_name?: string | null
          ghl_last_synced_at?: string | null
          id?: string
          last_activity_at?: string
          lifecycle_stage?: Database["public"]["Enums"]["lifecycle_stage"]
          phone?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      property_intel: {
        Row: {
          address_line1: string
          address_normalized: string
          attom_id: string | null
          avm: Json | null
          avm_fetched_at: string | null
          city: string | null
          created_at: string
          detail: Json | null
          detail_fetched_at: string | null
          id: string
          mortgage: Json | null
          mortgage_fetched_at: string | null
          neighborhood: Json | null
          neighborhood_fetched_at: string | null
          owner: Json | null
          owner_fetched_at: string | null
          permits: Json | null
          permits_fetched_at: string | null
          risk: Json | null
          risk_fetched_at: string | null
          sales: Json | null
          sales_fetched_at: string | null
          state: string | null
          tax: Json | null
          tax_fetched_at: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address_line1: string
          address_normalized: string
          attom_id?: string | null
          avm?: Json | null
          avm_fetched_at?: string | null
          city?: string | null
          created_at?: string
          detail?: Json | null
          detail_fetched_at?: string | null
          id?: string
          mortgage?: Json | null
          mortgage_fetched_at?: string | null
          neighborhood?: Json | null
          neighborhood_fetched_at?: string | null
          owner?: Json | null
          owner_fetched_at?: string | null
          permits?: Json | null
          permits_fetched_at?: string | null
          risk?: Json | null
          risk_fetched_at?: string | null
          sales?: Json | null
          sales_fetched_at?: string | null
          state?: string | null
          tax?: Json | null
          tax_fetched_at?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address_line1?: string
          address_normalized?: string
          attom_id?: string | null
          avm?: Json | null
          avm_fetched_at?: string | null
          city?: string | null
          created_at?: string
          detail?: Json | null
          detail_fetched_at?: string | null
          id?: string
          mortgage?: Json | null
          mortgage_fetched_at?: string | null
          neighborhood?: Json | null
          neighborhood_fetched_at?: string | null
          owner?: Json | null
          owner_fetched_at?: string | null
          permits?: Json | null
          permits_fetched_at?: string | null
          risk?: Json | null
          risk_fetched_at?: string | null
          sales?: Json | null
          sales_fetched_at?: string | null
          state?: string | null
          tax?: Json | null
          tax_fetched_at?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      pros: {
        Row: {
          accepting_leads: boolean
          active: boolean
          business_name: string
          category: string
          claimed_count: number
          created_at: string
          email: string | null
          id: string
          is_founding_partner: boolean
          monthly_price_cents: number
          phone: string | null
          plan: string
          rating: number | null
          reviews_count: number
          service_area: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepting_leads?: boolean
          active?: boolean
          business_name: string
          category: string
          claimed_count?: number
          created_at?: string
          email?: string | null
          id?: string
          is_founding_partner?: boolean
          monthly_price_cents?: number
          phone?: string | null
          plan?: string
          rating?: number | null
          reviews_count?: number
          service_area?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepting_leads?: boolean
          active?: boolean
          business_name?: string
          category?: string
          claimed_count?: number
          created_at?: string
          email?: string | null
          id?: string
          is_founding_partner?: boolean
          monthly_price_cents?: number
          phone?: string | null
          plan?: string
          rating?: number | null
          reviews_count?: number
          service_area?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      rr_cursor: {
        Row: {
          category: string
          last_pro_id: string | null
          metro: string | null
          updated_at: string
          zip: string
        }
        Insert: {
          category: string
          last_pro_id?: string | null
          metro?: string | null
          updated_at?: string
          zip: string
        }
        Update: {
          category?: string
          last_pro_id?: string | null
          metro?: string | null
          updated_at?: string
          zip?: string
        }
        Relationships: [
          {
            foreignKeyName: "rr_cursor_last_pro_id_fkey"
            columns: ["last_pro_id"]
            isOneToOne: false
            referencedRelation: "pros"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rr_cursor_last_pro_id_fkey"
            columns: ["last_pro_id"]
            isOneToOne: false
            referencedRelation: "pros_directory"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          address: string | null
          amount_cents: number | null
          budget_max: number | null
          budget_min: number | null
          category: string
          city: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          homeowner_id: string
          id: string
          metro: string | null
          notes: string | null
          receipt_path: string | null
          routing_status: string
          source: string
          state: string | null
          status: string
          timeline: string | null
          updated_at: string
          vendor_name: string | null
          zip: string | null
        }
        Insert: {
          address?: string | null
          amount_cents?: number | null
          budget_max?: number | null
          budget_min?: number | null
          category: string
          city?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          homeowner_id: string
          id?: string
          metro?: string | null
          notes?: string | null
          receipt_path?: string | null
          routing_status?: string
          source?: string
          state?: string | null
          status?: string
          timeline?: string | null
          updated_at?: string
          vendor_name?: string | null
          zip?: string | null
        }
        Update: {
          address?: string | null
          amount_cents?: number | null
          budget_max?: number | null
          budget_min?: number | null
          category?: string
          city?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          homeowner_id?: string
          id?: string
          metro?: string | null
          notes?: string | null
          receipt_path?: string | null
          routing_status?: string
          source?: string
          state?: string | null
          status?: string
          timeline?: string | null
          updated_at?: string
          vendor_name?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      pros_directory: {
        Row: {
          accepting_leads: boolean | null
          active: boolean | null
          business_name: string | null
          category: string | null
          created_at: string | null
          id: string | null
          is_founding_partner: boolean | null
          plan: string | null
          rating: number | null
          reviews_count: number | null
          service_area: string | null
        }
        Insert: {
          accepting_leads?: boolean | null
          active?: boolean | null
          business_name?: string | null
          category?: string | null
          created_at?: string | null
          id?: string | null
          is_founding_partner?: boolean | null
          plan?: string | null
          rating?: number | null
          reviews_count?: number | null
          service_area?: string | null
        }
        Update: {
          accepting_leads?: boolean | null
          active?: boolean | null
          business_name?: string | null
          category?: string | null
          created_at?: string | null
          id?: string | null
          is_founding_partner?: boolean | null
          plan?: string | null
          rating?: number | null
          reviews_count?: number | null
          service_area?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      compute_lifecycle_stage: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["lifecycle_stage"]
      }
      enqueue_ghl_sync: {
        Args: { _entity_id: string; _entity_type: string; _op?: string }
        Returns: undefined
      }
      has_lender_access: {
        Args: { _homeowner_id: string; _org_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_lender_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_request_homeowner: {
        Args: { _request_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "homeowner" | "pro" | "lender"
      lifecycle_stage:
        | "new_signup"
        | "onboarding"
        | "active_homeowner"
        | "needs_reengagement"
        | "premium_member"
        | "inactive"
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
      app_role: ["admin", "homeowner", "pro", "lender"],
      lifecycle_stage: [
        "new_signup",
        "onboarding",
        "active_homeowner",
        "needs_reengagement",
        "premium_member",
        "inactive",
      ],
    },
  },
} as const
