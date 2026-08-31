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
      agent_actions: {
        Row: {
          capability: string
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          decided_at: string | null
          id: string
          payload: Json
          proposed_at: string
          rationale: string | null
          required_level: number
          result: Json
          source_key: string | null
          source_kind: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          capability: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          payload?: Json
          proposed_at?: string
          rationale?: string | null
          required_level?: number
          result?: Json
          source_key?: string | null
          source_kind?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          capability?: string
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          decided_at?: string | null
          id?: string
          payload?: Json
          proposed_at?: string
          rationale?: string | null
          required_level?: number
          result?: Json
          source_key?: string | null
          source_kind?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_credit_ledger: {
        Row: {
          created_at: string
          delta: number
          event_key: string
          id: string
          kind: string
          org_id: string
          portfolio_client_id: string | null
          reason: string
        }
        Insert: {
          created_at?: string
          delta: number
          event_key: string
          id?: string
          kind: string
          org_id: string
          portfolio_client_id?: string | null
          reason: string
        }
        Update: {
          created_at?: string
          delta?: number
          event_key?: string
          id?: string
          kind?: string
          org_id?: string
          portfolio_client_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_credit_ledger_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_credit_ledger_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_feed_seen: {
        Row: {
          created_at: string
          first_seen_at: string
          id: string
          item_key: string
          kind: string
          portfolio_id: string
          reviewed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          first_seen_at?: string
          id?: string
          item_key: string
          kind: string
          portfolio_id: string
          reviewed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          first_seen_at?: string
          id?: string
          item_key?: string
          kind?: string
          portfolio_id?: string
          reviewed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_lender_connections: {
        Row: {
          agent_org_id: string | null
          created_at: string
          disconnected_at: string | null
          id: string
          invited_by: string | null
          invited_email: string | null
          invited_name: string | null
          lender_org_id: string
          message: string | null
          responded_at: string | null
          responded_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_org_id?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          invited_name?: string | null
          lender_org_id: string
          message?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_org_id?: string | null
          created_at?: string
          disconnected_at?: string | null
          id?: string
          invited_by?: string | null
          invited_email?: string | null
          invited_name?: string | null
          lender_org_id?: string
          message?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_lender_connections_agent_org_id_fkey"
            columns: ["agent_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_lender_connections_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          tool_activity: Json
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          tool_activity?: Json
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          tool_activity?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "agent_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_permissions: {
        Row: {
          capability: string
          created_at: string
          id: string
          level: number
          updated_at: string
          user_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          id?: string
          level?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          id?: string
          level?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_plans: {
        Row: {
          created_at: string
          id: string
          org_id: string
          plan_key: string
          requested_at: string | null
          requested_by: string | null
          requested_plan_key: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          plan_key?: string
          requested_at?: string | null
          requested_by?: string | null
          requested_plan_key?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          plan_key?: string
          requested_at?: string | null
          requested_by?: string | null
          requested_plan_key?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          completion_tokens: number
          cost_micro_cents: number
          created_at: string
          detail: string | null
          feature: string
          id: string
          model: string
          ok: boolean
          org_id: string | null
          prompt_tokens: number
          total_tokens: number
          user_id: string | null
        }
        Insert: {
          completion_tokens?: number
          cost_micro_cents?: number
          created_at?: string
          detail?: string | null
          feature: string
          id?: string
          model: string
          ok?: boolean
          org_id?: string | null
          prompt_tokens?: number
          total_tokens?: number
          user_id?: string | null
        }
        Update: {
          completion_tokens?: number
          cost_micro_cents?: number
          created_at?: string
          detail?: string | null
          feature?: string
          id?: string
          model?: string
          ok?: boolean
          org_id?: string | null
          prompt_tokens?: number
          total_tokens?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
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
      attom_endpoint_health: {
        Row: {
          created_at: string
          enabled: boolean
          endpoint: string
          last_unauthorized_at: string | null
          note: string | null
          unauthorized_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          endpoint: string
          last_unauthorized_at?: string | null
          note?: string | null
          unauthorized_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          endpoint?: string
          last_unauthorized_at?: string | null
          note?: string | null
          unauthorized_count?: number
          updated_at?: string
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
      batchdata_call_log: {
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
      batchdata_test_results: {
        Row: {
          address_normalized: string | null
          attempt: number
          cache_hit: boolean
          completeness: string | null
          coverage: Json | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          home_index: number | null
          http_status: number | null
          id: string
          input_address: string
          is_duplicate_address: boolean
          is_retry: boolean
          matched: boolean
          normalized: Json | null
          provider: string
          provider_property_id: string | null
          provider_request_id: string | null
          raw_response: Json | null
          request_type: string
          requested_at: string
          responded_at: string | null
          source_contact_id: string | null
          source_label: string | null
          success: boolean
          test_run_id: string
          usage_info: Json | null
        }
        Insert: {
          address_normalized?: string | null
          attempt?: number
          cache_hit?: boolean
          completeness?: string | null
          coverage?: Json | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          home_index?: number | null
          http_status?: number | null
          id?: string
          input_address: string
          is_duplicate_address?: boolean
          is_retry?: boolean
          matched?: boolean
          normalized?: Json | null
          provider?: string
          provider_property_id?: string | null
          provider_request_id?: string | null
          raw_response?: Json | null
          request_type?: string
          requested_at?: string
          responded_at?: string | null
          source_contact_id?: string | null
          source_label?: string | null
          success?: boolean
          test_run_id: string
          usage_info?: Json | null
        }
        Update: {
          address_normalized?: string | null
          attempt?: number
          cache_hit?: boolean
          completeness?: string | null
          coverage?: Json | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          home_index?: number | null
          http_status?: number | null
          id?: string
          input_address?: string
          is_duplicate_address?: boolean
          is_retry?: boolean
          matched?: boolean
          normalized?: Json | null
          provider?: string
          provider_property_id?: string | null
          provider_request_id?: string | null
          raw_response?: Json | null
          request_type?: string
          requested_at?: string
          responded_at?: string | null
          source_contact_id?: string | null
          source_label?: string | null
          success?: boolean
          test_run_id?: string
          usage_info?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "batchdata_test_results_test_run_id_fkey"
            columns: ["test_run_id"]
            isOneToOne: false
            referencedRelation: "batchdata_test_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      batchdata_test_runs: {
        Row: {
          api_request_count: number
          attom_call_count: number
          created_at: string
          created_by: string | null
          endpoint: string | null
          estimated_cost_cents: number
          failed_count: number
          finished_at: string | null
          id: string
          input_record_count: number | null
          label: string
          matched_count: number
          notes: string | null
          provider: string
          started_at: string
          status: string
          submitted_count: number
          unmatched_count: number
          updated_at: string
        }
        Insert: {
          api_request_count?: number
          attom_call_count?: number
          created_at?: string
          created_by?: string | null
          endpoint?: string | null
          estimated_cost_cents?: number
          failed_count?: number
          finished_at?: string | null
          id?: string
          input_record_count?: number | null
          label: string
          matched_count?: number
          notes?: string | null
          provider?: string
          started_at?: string
          status?: string
          submitted_count?: number
          unmatched_count?: number
          updated_at?: string
        }
        Update: {
          api_request_count?: number
          attom_call_count?: number
          created_at?: string
          created_by?: string | null
          endpoint?: string | null
          estimated_cost_cents?: number
          failed_count?: number
          finished_at?: string | null
          id?: string
          input_record_count?: number | null
          label?: string
          matched_count?: number
          notes?: string | null
          provider?: string
          started_at?: string
          status?: string
          submitted_count?: number
          unmatched_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      business_task_state: {
        Row: {
          completed_at: string
          created_at: string
          id: string
          org_id: string
          status: string
          task_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          created_at?: string
          id?: string
          org_id: string
          status?: string
          task_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string
          created_at?: string
          id?: string
          org_id?: string
          status?: string
          task_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_task_state_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_activations: {
        Row: {
          active: boolean
          campaign_id: string
          created_at: string
          created_by: string | null
          id: string
          lender_org_id: string
          portfolio_client_id: string | null
          portfolio_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          campaign_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lender_org_id: string
          portfolio_client_id?: string | null
          portfolio_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          campaign_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lender_org_id?: string
          portfolio_client_id?: string | null
          portfolio_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_activations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_activations_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_activations_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_activations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_approvals: {
        Row: {
          agent_org_id: string
          approved_client_ids: string[]
          campaign_id: string
          connection_id: string | null
          created_at: string
          id: string
          lender_org_id: string
          note: string | null
          opportunity_category: string | null
          proposed_by: string | null
          proposed_client_ids: string[]
          responded_at: string | null
          responded_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_org_id: string
          approved_client_ids?: string[]
          campaign_id: string
          connection_id?: string | null
          created_at?: string
          id?: string
          lender_org_id: string
          note?: string | null
          opportunity_category?: string | null
          proposed_by?: string | null
          proposed_client_ids?: string[]
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_org_id?: string
          approved_client_ids?: string[]
          campaign_id?: string
          connection_id?: string | null
          created_at?: string
          id?: string
          lender_org_id?: string
          note?: string | null
          opportunity_category?: string | null
          proposed_by?: string | null
          proposed_client_ids?: string[]
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_approvals_agent_org_id_fkey"
            columns: ["agent_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_approvals_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_approvals_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "agent_lender_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_approvals_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_org_overrides: {
        Row: {
          campaign_id: string
          closing: string | null
          created_at: string
          cta_label: string | null
          cta_url: string | null
          id: string
          intro: string | null
          lender_org_id: string
          subject: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          campaign_id: string
          closing?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          intro?: string | null
          lender_org_id: string
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          campaign_id?: string
          closing?: string | null
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          id?: string
          intro?: string | null
          lender_org_id?: string
          subject?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_org_overrides_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_org_overrides_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sends: {
        Row: {
          body: string | null
          campaign_id: string
          created_at: string
          crm_error: string | null
          crm_status: string
          error_message: string | null
          ghl_contact_id: string | null
          homeowner_id: string | null
          id: string
          lender_org_id: string | null
          payload: Json
          portfolio_client_id: string | null
          recipient_email: string | null
          recipient_name: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          campaign_id: string
          created_at?: string
          crm_error?: string | null
          crm_status?: string
          error_message?: string | null
          ghl_contact_id?: string | null
          homeowner_id?: string | null
          id?: string
          lender_org_id?: string | null
          payload?: Json
          portfolio_client_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          campaign_id?: string
          created_at?: string
          crm_error?: string | null
          crm_status?: string
          error_message?: string | null
          ghl_contact_id?: string | null
          homeowner_id?: string | null
          id?: string
          lender_org_id?: string | null
          payload?: Json
          portfolio_client_id?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sends_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sends_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          active: boolean
          audiences: string[]
          cadence: string
          channel: string
          created_at: string
          cta_label: string | null
          cta_url: string | null
          data_fields: string[]
          description: string | null
          ghl_tag: string
          id: string
          key: string
          min_days_between: number
          name: string
          prompt_template: string
          sort_order: number
          trigger_month: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          audiences?: string[]
          cadence?: string
          channel?: string
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          data_fields?: string[]
          description?: string | null
          ghl_tag: string
          id?: string
          key: string
          min_days_between?: number
          name: string
          prompt_template: string
          sort_order?: number
          trigger_month?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          audiences?: string[]
          cadence?: string
          channel?: string
          created_at?: string
          cta_label?: string | null
          cta_url?: string | null
          data_fields?: string[]
          description?: string | null
          ghl_tag?: string
          id?: string
          key?: string
          min_days_between?: number
          name?: string
          prompt_template?: string
          sort_order?: number
          trigger_month?: number | null
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
      data_provider_health: {
        Row: {
          created_at: string
          enabled: boolean
          endpoint: string
          last_unauthorized_at: string | null
          note: string | null
          priority: number
          provider: string
          unauthorized_count: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          endpoint: string
          last_unauthorized_at?: string | null
          note?: string | null
          priority?: number
          provider: string
          unauthorized_count?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          endpoint?: string
          last_unauthorized_at?: string | null
          note?: string | null
          priority?: number
          provider?: string
          unauthorized_count?: number
          updated_at?: string
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
      home_component_service_log: {
        Row: {
          action: string
          brand: string | null
          component_key: string
          created_at: string
          id: string
          installed_year: number | null
          model: string | null
          notes: string | null
          provider: string | null
          serviced_on: string | null
          updated_at: string
          user_id: string
          warranty_years: number | null
        }
        Insert: {
          action?: string
          brand?: string | null
          component_key: string
          created_at?: string
          id?: string
          installed_year?: number | null
          model?: string | null
          notes?: string | null
          provider?: string | null
          serviced_on?: string | null
          updated_at?: string
          user_id: string
          warranty_years?: number | null
        }
        Update: {
          action?: string
          brand?: string | null
          component_key?: string
          created_at?: string
          id?: string
          installed_year?: number | null
          model?: string | null
          notes?: string | null
          provider?: string | null
          serviced_on?: string | null
          updated_at?: string
          user_id?: string
          warranty_years?: number | null
        }
        Relationships: []
      }
      home_document_facts: {
        Row: {
          confidence: number | null
          created_at: string
          doc_kind: string
          document_id: string
          id: string
          label: string
          source_excerpt: string | null
          system: string | null
          user_id: string
          value: string | null
          value_cents: number | null
          value_date: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          doc_kind: string
          document_id: string
          id?: string
          label: string
          source_excerpt?: string | null
          system?: string | null
          user_id: string
          value?: string | null
          value_cents?: number | null
          value_date?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          doc_kind?: string
          document_id?: string
          id?: string
          label?: string
          source_excerpt?: string | null
          system?: string | null
          user_id?: string
          value?: string | null
          value_cents?: number | null
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "home_document_facts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "home_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      home_documents: {
        Row: {
          created_at: string
          extracted_at: string | null
          extraction_error: string | null
          extraction_status: string | null
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
          extracted_at?: string | null
          extraction_error?: string | null
          extraction_status?: string | null
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
          extracted_at?: string | null
          extraction_error?: string | null
          extraction_status?: string | null
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
      home_inspection_findings: {
        Row: {
          condition: string | null
          created_at: string
          defects: string[]
          document_id: string
          id: string
          recommended_action: string | null
          recommended_category: string | null
          remaining_life_years: number | null
          source_excerpt: string | null
          system: string
          urgency: string | null
          user_id: string
        }
        Insert: {
          condition?: string | null
          created_at?: string
          defects?: string[]
          document_id: string
          id?: string
          recommended_action?: string | null
          recommended_category?: string | null
          remaining_life_years?: number | null
          source_excerpt?: string | null
          system: string
          urgency?: string | null
          user_id: string
        }
        Update: {
          condition?: string | null
          created_at?: string
          defects?: string[]
          document_id?: string
          id?: string
          recommended_action?: string | null
          recommended_category?: string | null
          remaining_life_years?: number | null
          source_excerpt?: string | null
          system?: string
          urgency?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "home_inspection_findings_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "home_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      home_memory: {
        Row: {
          confidence: number
          created_at: string
          detail: Json
          id: string
          kind: string
          label: string
          memory_key: string
          source: string
          updated_at: string
          user_id: string
          value: string | null
        }
        Insert: {
          confidence?: number
          created_at?: string
          detail?: Json
          id?: string
          kind?: string
          label: string
          memory_key: string
          source?: string
          updated_at?: string
          user_id: string
          value?: string | null
        }
        Update: {
          confidence?: number
          created_at?: string
          detail?: Json
          id?: string
          kind?: string
          label?: string
          memory_key?: string
          source?: string
          updated_at?: string
          user_id?: string
          value?: string | null
        }
        Relationships: []
      }
      home_plan_state: {
        Row: {
          id: string
          item_key: string
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          item_key: string
          state: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          item_key?: string
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      home_plans: {
        Row: {
          ai_why: Json | null
          created_at: string
          generated_at: string
          id: string
          plan: Json
          source_hash: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_why?: Json | null
          created_at?: string
          generated_at?: string
          id?: string
          plan: Json
          source_hash: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_why?: Json | null
          created_at?: string
          generated_at?: string
          id?: string
          plan?: Json
          source_hash?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      home_predicted_actions: {
        Row: {
          action_key: string
          completed_at: string | null
          created_at: string
          dismissed_at: string | null
          document_id: string | null
          due_by: string | null
          due_from: string | null
          est_cost_high_cents: number | null
          est_cost_low_cents: number | null
          id: string
          service_category: string | null
          status: string
          system: string | null
          title: string
          updated_at: string
          urgency: string
          user_id: string
          why: string | null
        }
        Insert: {
          action_key: string
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          document_id?: string | null
          due_by?: string | null
          due_from?: string | null
          est_cost_high_cents?: number | null
          est_cost_low_cents?: number | null
          id?: string
          service_category?: string | null
          status?: string
          system?: string | null
          title: string
          updated_at?: string
          urgency?: string
          user_id: string
          why?: string | null
        }
        Update: {
          action_key?: string
          completed_at?: string | null
          created_at?: string
          dismissed_at?: string | null
          document_id?: string | null
          due_by?: string | null
          due_from?: string | null
          est_cost_high_cents?: number | null
          est_cost_low_cents?: number | null
          id?: string
          service_category?: string | null
          status?: string
          system?: string | null
          title?: string
          updated_at?: string
          urgency?: string
          user_id?: string
          why?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "home_predicted_actions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "home_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      home_profiles: {
        Row: {
          address: string | null
          address_normalized: string | null
          behavior: Json
          completeness: Json
          completeness_pct: number
          created_at: string
          financial: Json
          id: string
          last_refreshed_at: string
          physical: Json
          property: Json
          provider_refreshed_at: string | null
          stale_classes: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          address_normalized?: string | null
          behavior?: Json
          completeness?: Json
          completeness_pct?: number
          created_at?: string
          financial?: Json
          id?: string
          last_refreshed_at?: string
          physical?: Json
          property?: Json
          provider_refreshed_at?: string | null
          stale_classes?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          address_normalized?: string | null
          behavior?: Json
          completeness?: Json
          completeness_pct?: number
          created_at?: string
          financial?: Json
          id?: string
          last_refreshed_at?: string
          physical?: Json
          property?: Json
          provider_refreshed_at?: string | null
          stale_classes?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      home_value_snapshots: {
        Row: {
          address_normalized: string | null
          captured_on: string
          created_at: string
          id: string
          source: string
          updated_at: string
          user_id: string
          value_cents: number
        }
        Insert: {
          address_normalized?: string | null
          captured_on?: string
          created_at?: string
          id?: string
          source?: string
          updated_at?: string
          user_id: string
          value_cents: number
        }
        Update: {
          address_normalized?: string | null
          captured_on?: string
          created_at?: string
          id?: string
          source?: string
          updated_at?: string
          user_id?: string
          value_cents?: number
        }
        Relationships: []
      }
      homeowner_activity_events: {
        Row: {
          context: Json
          created_at: string
          event_type: string
          homeowner_id: string
          id: string
          occurred_at: string
        }
        Insert: {
          context?: Json
          created_at?: string
          event_type: string
          homeowner_id: string
          id?: string
          occurred_at?: string
        }
        Update: {
          context?: Json
          created_at?: string
          event_type?: string
          homeowner_id?: string
          id?: string
          occurred_at?: string
        }
        Relationships: []
      }
      homeowner_alerts: {
        Row: {
          created_at: string
          dismissed_at: string | null
          first_seen_at: string
          id: string
          read_at: string | null
          signal_key: string
          signal_type: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dismissed_at?: string | null
          first_seen_at?: string
          id?: string
          read_at?: string | null
          signal_key: string
          signal_type: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dismissed_at?: string | null
          first_seen_at?: string
          id?: string
          read_at?: string | null
          signal_key?: string
          signal_type?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      homeowner_intents: {
        Row: {
          confidence: number
          created_at: string
          detail: Json
          evidence: string | null
          expires_at: string | null
          id: string
          intent_type: string
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          detail?: Json
          evidence?: string | null
          expires_at?: string | null
          id?: string
          intent_type: string
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          detail?: Json
          evidence?: string | null
          expires_at?: string | null
          id?: string
          intent_type?: string
          source?: string
          status?: string
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
      homeowner_opportunities: {
        Row: {
          category: string
          computed_at: string
          confidence: number | null
          created_at: string
          id: string
          network: string | null
          org_id: string
          portfolio_client_id: string
          reasons: string[]
          score: number
          signal_key: string | null
          signals: Json
          state: string
          strength: string
          updated_at: string
        }
        Insert: {
          category: string
          computed_at?: string
          confidence?: number | null
          created_at?: string
          id?: string
          network?: string | null
          org_id: string
          portfolio_client_id: string
          reasons?: string[]
          score?: number
          signal_key?: string | null
          signals?: Json
          state?: string
          strength?: string
          updated_at?: string
        }
        Update: {
          category?: string
          computed_at?: string
          confidence?: number | null
          created_at?: string
          id?: string
          network?: string | null
          org_id?: string
          portfolio_client_id?: string
          reasons?: string[]
          score?: number
          signal_key?: string | null
          signals?: Json
          state?: string
          strength?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "homeowner_opportunities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homeowner_opportunities_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      introduction_requests: {
        Row: {
          agent_org_id: string
          category: string | null
          connection_id: string
          created_at: string
          id: string
          lender_org_id: string
          message: string | null
          opportunity_id: string | null
          outcome: string | null
          outcome_at: string | null
          outcome_note: string | null
          portfolio_client_id: string
          requested_by: string | null
          responded_at: string | null
          responded_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_org_id: string
          category?: string | null
          connection_id: string
          created_at?: string
          id?: string
          lender_org_id: string
          message?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          outcome_at?: string | null
          outcome_note?: string | null
          portfolio_client_id: string
          requested_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_org_id?: string
          category?: string | null
          connection_id?: string
          created_at?: string
          id?: string
          lender_org_id?: string
          message?: string | null
          opportunity_id?: string | null
          outcome?: string | null
          outcome_at?: string | null
          outcome_note?: string | null
          portfolio_client_id?: string
          requested_by?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "introduction_requests_agent_org_id_fkey"
            columns: ["agent_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introduction_requests_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "agent_lender_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introduction_requests_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introduction_requests_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "homeowner_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introduction_requests_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      introduction_reveals: {
        Row: {
          agent_org_id: string
          created_at: string
          id: string
          introduction_request_id: string
          lender_org_id: string
          portfolio_client_id: string
          viewed_by: string | null
        }
        Insert: {
          agent_org_id: string
          created_at?: string
          id?: string
          introduction_request_id: string
          lender_org_id: string
          portfolio_client_id: string
          viewed_by?: string | null
        }
        Update: {
          agent_org_id?: string
          created_at?: string
          id?: string
          introduction_request_id?: string
          lender_org_id?: string
          portfolio_client_id?: string
          viewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "introduction_reveals_agent_org_id_fkey"
            columns: ["agent_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introduction_reveals_introduction_request_id_fkey"
            columns: ["introduction_request_id"]
            isOneToOne: false
            referencedRelation: "introduction_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introduction_reveals_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "introduction_reveals_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
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
      lead_handoffs: {
        Row: {
          attempts: number
          created_at: string
          error_message: string | null
          http_status: number | null
          id: string
          partner_id: string | null
          partner_lead_id: string | null
          payload: Json | null
          response: Json | null
          sent_at: string | null
          service_request_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          partner_id?: string | null
          partner_lead_id?: string | null
          payload?: Json | null
          response?: Json | null
          sent_at?: string | null
          service_request_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          partner_id?: string | null
          partner_lead_id?: string | null
          payload?: Json | null
          response?: Json | null
          sent_at?: string | null
          service_request_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_handoffs_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "lead_partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_handoffs_service_request_id_fkey"
            columns: ["service_request_id"]
            isOneToOne: false
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
      lead_partners: {
        Row: {
          active: boolean
          auth_type: string
          categories: string[]
          created_at: string
          endpoint_url: string
          field_map: Json
          id: string
          metros: string[]
          name: string
          payout_notes: string | null
          priority: number
          secret_name: string | null
          states: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          auth_type?: string
          categories?: string[]
          created_at?: string
          endpoint_url: string
          field_map?: Json
          id?: string
          metros?: string[]
          name: string
          payout_notes?: string | null
          priority?: number
          secret_name?: string | null
          states?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          auth_type?: string
          categories?: string[]
          created_at?: string
          endpoint_url?: string
          field_map?: Json
          id?: string
          metros?: string[]
          name?: string
          payout_notes?: string | null
          priority?: number
          secret_name?: string | null
          states?: string[]
          updated_at?: string
        }
        Relationships: []
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
      lender_member_profiles: {
        Row: {
          contact_name: string | null
          contact_phone: string | null
          contact_title: string | null
          created_at: string
          id: string
          lender_org_id: string
          license_number: string | null
          logo_url: string | null
          reply_to_email: string | null
          sender_name: string | null
          signoff: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_name?: string | null
          contact_phone?: string | null
          contact_title?: string | null
          created_at?: string
          id?: string
          lender_org_id: string
          license_number?: string | null
          logo_url?: string | null
          reply_to_email?: string | null
          sender_name?: string | null
          signoff?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_name?: string | null
          contact_phone?: string | null
          contact_title?: string | null
          created_at?: string
          id?: string
          lender_org_id?: string
          license_number?: string | null
          logo_url?: string | null
          reply_to_email?: string | null
          sender_name?: string | null
          signoff?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_member_profiles_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
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
          contact_name: string | null
          contact_phone: string | null
          contact_title: string | null
          created_at: string
          id: string
          license_number: string | null
          logo_url: string | null
          name: string
          org_type: string
          plan: string
          plan_key: string | null
          primary_contact_email: string | null
          reply_to_email: string | null
          seat_limit: number | null
          sender_name: string | null
          signoff: string | null
          sponsored_allocation: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          contact_name?: string | null
          contact_phone?: string | null
          contact_title?: string | null
          created_at?: string
          id?: string
          license_number?: string | null
          logo_url?: string | null
          name: string
          org_type?: string
          plan?: string
          plan_key?: string | null
          primary_contact_email?: string | null
          reply_to_email?: string | null
          seat_limit?: number | null
          sender_name?: string | null
          signoff?: string | null
          sponsored_allocation?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          contact_name?: string | null
          contact_phone?: string | null
          contact_title?: string | null
          created_at?: string
          id?: string
          license_number?: string | null
          logo_url?: string | null
          name?: string
          org_type?: string
          plan?: string
          plan_key?: string | null
          primary_contact_email?: string | null
          reply_to_email?: string | null
          seat_limit?: number | null
          sender_name?: string | null
          signoff?: string | null
          sponsored_allocation?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lender_orgs_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "plan_tiers"
            referencedColumns: ["key"]
          },
        ]
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
          assigned_user_id: string | null
          created_at: string
          id: string
          lender_org_id: string
          name: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          created_at?: string
          id?: string
          lender_org_id: string
          name: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
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
      opportunity_actions: {
        Row: {
          action_key: string
          audience: string
          channel: string
          created_at: string
          draft_body: string | null
          draft_model: string | null
          draft_subject: string | null
          drafted_at: string | null
          headline: string
          id: string
          opportunity_id: string
          org_id: string
          portfolio_client_id: string
          rank_score: number
          temperature: string
          updated_at: string
          why: string
        }
        Insert: {
          action_key: string
          audience: string
          channel: string
          created_at?: string
          draft_body?: string | null
          draft_model?: string | null
          draft_subject?: string | null
          drafted_at?: string | null
          headline: string
          id?: string
          opportunity_id: string
          org_id: string
          portfolio_client_id: string
          rank_score?: number
          temperature: string
          updated_at?: string
          why: string
        }
        Update: {
          action_key?: string
          audience?: string
          channel?: string
          created_at?: string
          draft_body?: string | null
          draft_model?: string | null
          draft_subject?: string | null
          drafted_at?: string | null
          headline?: string
          id?: string
          opportunity_id?: string
          org_id?: string
          portfolio_client_id?: string
          rank_score?: number
          temperature?: string
          updated_at?: string
          why?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_actions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "homeowner_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_actions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_actions_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_outcomes: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          note: string | null
          occurred_at: string
          opportunity_id: string | null
          org_id: string
          portfolio_client_id: string
          stage: string
          value_cents: number | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          occurred_at?: string
          opportunity_id?: string | null
          org_id: string
          portfolio_client_id: string
          stage: string
          value_cents?: number | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          occurred_at?: string
          opportunity_id?: string | null
          org_id?: string
          portfolio_client_id?: string
          stage?: string
          value_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_outcomes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "homeowner_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_outcomes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_outcomes_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_events: {
        Row: {
          campaign_send_id: string | null
          created_at: string
          detail: string | null
          event: string
          id: string
          message_id: string | null
          occurred_at: string
          opportunity_id: string | null
          org_id: string
          portfolio_client_id: string
        }
        Insert: {
          campaign_send_id?: string | null
          created_at?: string
          detail?: string | null
          event: string
          id?: string
          message_id?: string | null
          occurred_at?: string
          opportunity_id?: string | null
          org_id: string
          portfolio_client_id: string
        }
        Update: {
          campaign_send_id?: string | null
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
          message_id?: string | null
          occurred_at?: string
          opportunity_id?: string | null
          org_id?: string
          portfolio_client_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_events_campaign_send_id_fkey"
            columns: ["campaign_send_id"]
            isOneToOne: false
            referencedRelation: "campaign_sends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "outreach_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_events_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "homeowner_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_events_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_messages: {
        Row: {
          actor_user_id: string | null
          body: string | null
          channel: string
          created_at: string
          error_message: string | null
          id: string
          opportunity_id: string | null
          org_id: string
          portfolio_client_id: string
          recipient_email: string | null
          sent_at: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          actor_user_id?: string | null
          body?: string | null
          channel: string
          created_at?: string
          error_message?: string | null
          id?: string
          opportunity_id?: string | null
          org_id: string
          portfolio_client_id: string
          recipient_email?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          actor_user_id?: string | null
          body?: string | null
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          opportunity_id?: string | null
          org_id?: string
          portfolio_client_id?: string
          recipient_email?: string | null
          sent_at?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_messages_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "homeowner_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_messages_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_tiers: {
        Row: {
          active: boolean
          audience: string
          created_at: string
          credits_included: number | null
          key: string
          name: string
          positioning: string | null
          price_cents: number | null
          seat_limit: number | null
          sort_order: number
          sponsored_allocation: number | null
          sponsored_seats: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          audience: string
          created_at?: string
          credits_included?: number | null
          key: string
          name: string
          positioning?: string | null
          price_cents?: number | null
          seat_limit?: number | null
          sort_order?: number
          sponsored_allocation?: number | null
          sponsored_seats?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          audience?: string
          created_at?: string
          credits_included?: number | null
          key?: string
          name?: string
          positioning?: string | null
          price_cents?: number | null
          seat_limit?: number | null
          sort_order?: number
          sponsored_allocation?: number | null
          sponsored_seats?: number | null
          updated_at?: string
        }
        Relationships: []
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
          campaign_opt_out: boolean
          city: string | null
          created_at: string
          email: string | null
          full_name: string | null
          ghl_last_synced_at: string | null
          id: string
          language: string
          last_activity_at: string
          lifecycle_stage: Database["public"]["Enums"]["lifecycle_stage"]
          phone: string | null
          state: string | null
          updated_at: string
          zip: string | null
        }
        Insert: {
          address?: string | null
          campaign_opt_out?: boolean
          city?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          ghl_last_synced_at?: string | null
          id: string
          language?: string
          last_activity_at?: string
          lifecycle_stage?: Database["public"]["Enums"]["lifecycle_stage"]
          phone?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address?: string | null
          campaign_opt_out?: boolean
          city?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          ghl_last_synced_at?: string | null
          id?: string
          language?: string
          last_activity_at?: string
          lifecycle_stage?: Database["public"]["Enums"]["lifecycle_stage"]
          phone?: string | null
          state?: string | null
          updated_at?: string
          zip?: string | null
        }
        Relationships: []
      }
      property_enrichment_queue: {
        Row: {
          address_normalized: string | null
          address_verified_at: string | null
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          last_result: string | null
          next_attempt_at: string
          portfolio_client_id: string
          portfolio_id: string
          priority: number
          requested_classes: string[]
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address_normalized?: string | null
          address_verified_at?: string | null
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_result?: string | null
          next_attempt_at?: string
          portfolio_client_id: string
          portfolio_id: string
          priority?: number
          requested_classes?: string[]
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address_normalized?: string | null
          address_verified_at?: string | null
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          last_result?: string | null
          next_attempt_at?: string
          portfolio_client_id?: string
          portfolio_id?: string
          priority?: number
          requested_classes?: string[]
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_enrichment_queue_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: true
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_enrichment_queue_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolios"
            referencedColumns: ["id"]
          },
        ]
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
      property_intel_misses: {
        Row: {
          address_normalized: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          occurrences: number
          reason: string
          status: number | null
          suppressed_until: string
          updated_at: string
        }
        Insert: {
          address_normalized: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          occurrences?: number
          reason: string
          status?: number | null
          suppressed_until?: string
          updated_at?: string
        }
        Update: {
          address_normalized?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          occurrences?: number
          reason?: string
          status?: number | null
          suppressed_until?: string
          updated_at?: string
        }
        Relationships: []
      }
      property_listing_status: {
        Row: {
          created_at: string
          expiry_date: string | null
          id: string
          list_date: string | null
          list_price_cents: number | null
          listed_with_other_agent: boolean
          listing_agent_name: string | null
          portfolio_client_id: string
          raw: Json | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          list_date?: string | null
          list_price_cents?: number | null
          listed_with_other_agent?: boolean
          listing_agent_name?: string | null
          portfolio_client_id: string
          raw?: Json | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          list_date?: string | null
          list_price_cents?: number | null
          listed_with_other_agent?: boolean
          listing_agent_name?: string | null
          portfolio_client_id?: string
          raw?: Json | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_listing_status_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: true
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
        ]
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
          ghl_contact_id: string | null
          id: string
          is_founding_partner: boolean
          language: string
          monthly_price_cents: number
          phone: string | null
          plan: string
          rating: number | null
          reviews_count: number
          service_area: string | null
          subscription_activated_at: string | null
          subscription_status: string
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
          ghl_contact_id?: string | null
          id?: string
          is_founding_partner?: boolean
          language?: string
          monthly_price_cents?: number
          phone?: string | null
          plan?: string
          rating?: number | null
          reviews_count?: number
          service_area?: string | null
          subscription_activated_at?: string | null
          subscription_status?: string
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
          ghl_contact_id?: string | null
          id?: string
          is_founding_partner?: boolean
          language?: string
          monthly_price_cents?: number
          phone?: string | null
          plan?: string
          rating?: number | null
          reviews_count?: number
          service_area?: string | null
          subscription_activated_at?: string | null
          subscription_status?: string
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
      seller_intent_submissions: {
        Row: {
          created_at: string
          homeowner_id: string
          id: string
          kind: string
          note: string | null
          timeframe: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          homeowner_id: string
          id?: string
          kind: string
          note?: string | null
          timeframe?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          homeowner_id?: string
          id?: string
          kind?: string
          note?: string | null
          timeframe?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      service_requests: {
        Row: {
          address: string | null
          amount_cents: number | null
          budget_max: number | null
          budget_min: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          category: string
          city: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          homeowner_id: string
          id: string
          invoice_cents: number | null
          invoice_path: string | null
          metro: string | null
          notes: string | null
          pro_notes: string | null
          receipt_path: string | null
          routing_status: string
          scheduled_at: string | null
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
          cancellation_reason?: string | null
          cancelled_at?: string | null
          category: string
          city?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          homeowner_id: string
          id?: string
          invoice_cents?: number | null
          invoice_path?: string | null
          metro?: string | null
          notes?: string | null
          pro_notes?: string | null
          receipt_path?: string | null
          routing_status?: string
          scheduled_at?: string | null
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
          cancellation_reason?: string | null
          cancelled_at?: string | null
          category?: string
          city?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          homeowner_id?: string
          id?: string
          invoice_cents?: number | null
          invoice_path?: string | null
          metro?: string | null
          notes?: string | null
          pro_notes?: string | null
          receipt_path?: string | null
          routing_status?: string
          scheduled_at?: string | null
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
      shared_opportunities: {
        Row: {
          agent_opportunity_id: string | null
          agent_org_id: string
          connection_id: string | null
          created_at: string
          id: string
          lender_opportunity_id: string | null
          lender_org_id: string
          portfolio_client_id: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_opportunity_id?: string | null
          agent_org_id: string
          connection_id?: string | null
          created_at?: string
          id?: string
          lender_opportunity_id?: string | null
          lender_org_id: string
          portfolio_client_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_opportunity_id?: string | null
          agent_org_id?: string
          connection_id?: string | null
          created_at?: string
          id?: string
          lender_opportunity_id?: string | null
          lender_org_id?: string
          portfolio_client_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_opportunities_agent_opportunity_id_fkey"
            columns: ["agent_opportunity_id"]
            isOneToOne: false
            referencedRelation: "homeowner_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_opportunities_agent_org_id_fkey"
            columns: ["agent_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_opportunities_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "agent_lender_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_opportunities_lender_opportunity_id_fkey"
            columns: ["lender_opportunity_id"]
            isOneToOne: false
            referencedRelation: "homeowner_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_opportunities_lender_org_id_fkey"
            columns: ["lender_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_opportunities_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsored_agent_seats: {
        Row: {
          agent_org_id: string
          created_at: string
          created_by: string | null
          credits_granted: number
          ended_at: string | null
          id: string
          sponsor_org_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_org_id: string
          created_at?: string
          created_by?: string | null
          credits_granted?: number
          ended_at?: string | null
          id?: string
          sponsor_org_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_org_id?: string
          created_at?: string
          created_by?: string | null
          credits_granted?: number
          ended_at?: string | null
          id?: string
          sponsor_org_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsored_agent_seats_agent_org_id_fkey"
            columns: ["agent_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsored_agent_seats_sponsor_org_id_fkey"
            columns: ["sponsor_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsored_profiles: {
        Row: {
          agent_org_id: string
          allocated_by: string | null
          created_at: string
          ended_at: string | null
          grace_until: string | null
          homeowner_id: string | null
          id: string
          portfolio_client_id: string
          sponsor_org_id: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_org_id: string
          allocated_by?: string | null
          created_at?: string
          ended_at?: string | null
          grace_until?: string | null
          homeowner_id?: string | null
          id?: string
          portfolio_client_id: string
          sponsor_org_id: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_org_id?: string
          allocated_by?: string | null
          created_at?: string
          ended_at?: string | null
          grace_until?: string | null
          homeowner_id?: string | null
          id?: string
          portfolio_client_id?: string
          sponsor_org_id?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sponsored_profiles_agent_org_id_fkey"
            columns: ["agent_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsored_profiles_portfolio_client_id_fkey"
            columns: ["portfolio_client_id"]
            isOneToOne: false
            referencedRelation: "lender_portfolio_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sponsored_profiles_sponsor_org_id_fkey"
            columns: ["sponsor_org_id"]
            isOneToOne: false
            referencedRelation: "lender_orgs"
            referencedColumns: ["id"]
          },
        ]
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
      agent_credit_summary: {
        Args: { _org_id: string }
        Returns: {
          earned: number
          granted: number
          purchased: number
          remaining: number
          spent: number
        }[]
      }
      award_agent_credit: {
        Args: {
          _client_id: string
          _delta: number
          _event_key: string
          _org_id: string
          _reason: string
        }
        Returns: undefined
      }
      business_funnel: {
        Args: { _org_id: string; _since?: string }
        Returns: {
          applications: number
          appointments: number
          closed: number
          closed_value_cents: number
          contacted: number
          conversations: number
          engaged: number
          homeowners: number
          opportunities: number
        }[]
      }
      compute_lifecycle_stage: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["lifecycle_stage"]
      }
      enqueue_ghl_sync: {
        Args: { _entity_id: string; _entity_type: string; _op?: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_lender_manager: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_lender_member: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
      is_request_assigned_pro: {
        Args: { _request_id: string; _user_id: string }
        Returns: boolean
      }
      portfolio_engagement: {
        Args: { _portfolio_id: string }
        Returns: {
          distinct_types_14d: number
          equity_checks_30d: number
          last_activity_at: string
          portfolio_client_id: string
          selling_form_at: string
          selling_form_timeframe: string
          sessions_7d: number
          value_checks_14d: number
          value_checks_30d: number
          value_request_at: string
        }[]
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
