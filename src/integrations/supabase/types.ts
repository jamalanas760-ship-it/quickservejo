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
      audit_logs: {
        Row: {
          action: string
          actor_name: string | null
          actor_user_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json
          restaurant_id: string | null
        }
        Insert: {
          action: string
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json
          restaurant_id?: string | null
        }
        Update: {
          action?: string
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json
          restaurant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          completed_at: string | null
          error: string | null
          id: string
          restaurant_id: string
          result_summary: string | null
          rule_id: string
          started_at: string
          status: string
          triggered_by: string
          work_task_id: string | null
        }
        Insert: {
          completed_at?: string | null
          error?: string | null
          id?: string
          restaurant_id: string
          result_summary?: string | null
          rule_id: string
          started_at?: string
          status?: string
          triggered_by: string
          work_task_id?: string | null
        }
        Update: {
          completed_at?: string | null
          error?: string | null
          id?: string
          restaurant_id?: string
          result_summary?: string | null
          rule_id?: string
          started_at?: string
          status?: string
          triggered_by?: string
          work_task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "operational_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_work_task_id_fkey"
            columns: ["work_task_id"]
            isOneToOne: false
            referencedRelation: "work_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_deposit_intents: {
        Row: {
          amount: number
          booking_id: string
          created_at: string
          currency: string
          id: string
          idempotency_key: string
          last_error: string | null
          provider: string
          provider_account_id: string | null
          provider_intent_id: string | null
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id: string
          created_at?: string
          currency: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          provider?: string
          provider_account_id?: string | null
          provider_intent_id?: string | null
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          provider?: string
          provider_account_id?: string | null
          provider_intent_id?: string | null
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_deposit_intents_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "table_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_deposit_intents_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_message_inbox: {
        Row: {
          body: string
          channel: string
          created_at: string
          from_address: string | null
          id: string
          match_status: string
          matched_booking_id: string | null
          matched_restaurant_id: string | null
          provider: string
          provider_message_id: string
          received_at: string
          to_address: string | null
        }
        Insert: {
          body: string
          channel: string
          created_at?: string
          from_address?: string | null
          id?: string
          match_status: string
          matched_booking_id?: string | null
          matched_restaurant_id?: string | null
          provider?: string
          provider_message_id: string
          received_at?: string
          to_address?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string
          from_address?: string | null
          id?: string
          match_status?: string
          matched_booking_id?: string | null
          matched_restaurant_id?: string | null
          provider?: string
          provider_message_id?: string
          received_at?: string
          to_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_message_inbox_matched_booking_id_fkey"
            columns: ["matched_booking_id"]
            isOneToOne: false
            referencedRelation: "table_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_message_inbox_matched_restaurant_id_fkey"
            columns: ["matched_restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_messages: {
        Row: {
          attempt_count: number
          body: string
          booking_id: string
          channel: string
          created_at: string
          created_by: string | null
          direction: string
          from_address: string | null
          id: string
          last_error: string | null
          next_attempt_at: string
          provider: string
          provider_message_id: string | null
          provider_status: string
          received_at: string | null
          restaurant_id: string
          sent_at: string | null
          to_address: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          body: string
          booking_id: string
          channel: string
          created_at?: string
          created_by?: string | null
          direction: string
          from_address?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          provider?: string
          provider_message_id?: string | null
          provider_status?: string
          received_at?: string | null
          restaurant_id: string
          sent_at?: string | null
          to_address?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          body?: string
          booking_id?: string
          channel?: string
          created_at?: string
          created_by?: string | null
          direction?: string
          from_address?: string | null
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          provider?: string
          provider_message_id?: string | null
          provider_status?: string
          received_at?: string | null
          restaurant_id?: string
          sent_at?: string | null
          to_address?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "table_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_messages_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_notification_jobs: {
        Row: {
          attempt_count: number
          booking_id: string
          channel: string
          created_at: string
          destination: string
          id: string
          last_error: string | null
          next_attempt_at: string
          notification_type: string
          provider_reference: string | null
          restaurant_id: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          booking_id: string
          channel: string
          created_at?: string
          destination: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_type: string
          provider_reference?: string | null
          restaurant_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          booking_id?: string
          channel?: string
          created_at?: string
          destination?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_type?: string
          provider_reference?: string | null
          restaurant_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_notification_jobs_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "table_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_notification_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_settings: {
        Row: {
          auto_confirm: boolean
          cancellation_cutoff_hours: number
          confirmation_channel: string
          created_at: string
          default_duration_minutes: number
          deposit_amount: number
          deposit_mode: string
          max_advance_days: number
          max_party_size: number
          min_lead_minutes: number
          min_party_size: number
          online_enabled: boolean
          reminder_channel: string
          reminder_hours: number
          require_email: boolean
          require_phone: boolean
          reservation_hold_minutes: number
          restaurant_id: string
          slot_minutes: number
          terms: string | null
          updated_at: string
          weekly_hours: Json
        }
        Insert: {
          auto_confirm?: boolean
          cancellation_cutoff_hours?: number
          confirmation_channel?: string
          created_at?: string
          default_duration_minutes?: number
          deposit_amount?: number
          deposit_mode?: string
          max_advance_days?: number
          max_party_size?: number
          min_lead_minutes?: number
          min_party_size?: number
          online_enabled?: boolean
          reminder_channel?: string
          reminder_hours?: number
          require_email?: boolean
          require_phone?: boolean
          reservation_hold_minutes?: number
          restaurant_id: string
          slot_minutes?: number
          terms?: string | null
          updated_at?: string
          weekly_hours?: Json
        }
        Update: {
          auto_confirm?: boolean
          cancellation_cutoff_hours?: number
          confirmation_channel?: string
          created_at?: string
          default_duration_minutes?: number
          deposit_amount?: number
          deposit_mode?: string
          max_advance_days?: number
          max_party_size?: number
          min_lead_minutes?: number
          min_party_size?: number
          online_enabled?: boolean
          reminder_channel?: string
          reminder_hours?: number
          require_email?: boolean
          require_phone?: boolean
          reservation_hold_minutes?: number
          restaurant_id?: string
          slot_minutes?: number
          terms?: string | null
          updated_at?: string
          weekly_hours?: Json
        }
        Relationships: [
          {
            foreignKeyName: "booking_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_waitlist: {
        Row: {
          cancellation_reason: string | null
          converted_booking_id: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          desired_date: string
          email: string | null
          estimated_wait_minutes: number | null
          guest_count: number
          id: string
          last_message_at: string | null
          last_message_channel: string | null
          notes: string | null
          notified_at: string | null
          occasion: string | null
          offer_accepted_at: string | null
          offer_booking_at: string | null
          offer_count: number
          offer_declined_at: string | null
          offer_expires_at: string | null
          offer_sent_at: string | null
          offer_table_id: string | null
          phone: string | null
          preferred_time: string | null
          public_token: string
          restaurant_id: string
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          cancellation_reason?: string | null
          converted_booking_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name: string
          desired_date: string
          email?: string | null
          estimated_wait_minutes?: number | null
          guest_count: number
          id?: string
          last_message_at?: string | null
          last_message_channel?: string | null
          notes?: string | null
          notified_at?: string | null
          occasion?: string | null
          offer_accepted_at?: string | null
          offer_booking_at?: string | null
          offer_count?: number
          offer_declined_at?: string | null
          offer_expires_at?: string | null
          offer_sent_at?: string | null
          offer_table_id?: string | null
          phone?: string | null
          preferred_time?: string | null
          public_token: string
          restaurant_id: string
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancellation_reason?: string | null
          converted_booking_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          desired_date?: string
          email?: string | null
          estimated_wait_minutes?: number | null
          guest_count?: number
          id?: string
          last_message_at?: string | null
          last_message_channel?: string | null
          notes?: string | null
          notified_at?: string | null
          occasion?: string | null
          offer_accepted_at?: string | null
          offer_booking_at?: string | null
          offer_count?: number
          offer_declined_at?: string | null
          offer_expires_at?: string | null
          offer_sent_at?: string | null
          offer_table_id?: string | null
          phone?: string | null
          preferred_time?: string | null
          public_token?: string
          restaurant_id?: string
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_waitlist_converted_booking_id_fkey"
            columns: ["converted_booking_id"]
            isOneToOne: false
            referencedRelation: "table_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_waitlist_offer_table_id_fkey"
            columns: ["offer_table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_waitlist_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_cash: number | null
          expected_cash: number | null
          id: string
          notes: string
          opened_at: string
          opened_by: string
          opening_float: number
          restaurant_id: string
          staff_id: string | null
          variance: number | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string
          opened_at?: string
          opened_by?: string
          opening_float?: number
          restaurant_id: string
          staff_id?: string | null
          variance?: number | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          expected_cash?: number | null
          id?: string
          notes?: string
          opened_at?: string
          opened_by?: string
          opening_float?: number
          restaurant_id?: string
          staff_id?: string | null
          variance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_sessions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_automation_history: {
        Row: {
          automation_id: string
          campaign_id: string | null
          created_at: string
          guest_id: string
          id: string
          restaurant_id: string
          trigger_key: string
        }
        Insert: {
          automation_id: string
          campaign_id?: string | null
          created_at?: string
          guest_id: string
          id?: string
          restaurant_id: string
          trigger_key: string
        }
        Update: {
          automation_id?: string
          campaign_id?: string | null
          created_at?: string
          guest_id?: string
          id?: string
          restaurant_id?: string
          trigger_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_automation_history_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "crm_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_automation_history_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_automation_history_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "crm_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_automation_history_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_automations: {
        Row: {
          channel: string
          config: Json
          cooldown_days: number
          created_at: string
          created_by: string | null
          enabled: boolean
          id: string
          last_error: string | null
          last_run_at: string | null
          message: string
          name: string
          restaurant_id: string
          subject: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          channel: string
          config?: Json
          cooldown_days?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          message: string
          name: string
          restaurant_id: string
          subject?: string | null
          trigger_type: string
          updated_at?: string
        }
        Update: {
          channel?: string
          config?: Json
          cooldown_days?: number
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          message?: string
          name?: string
          restaurant_id?: string
          subject?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_automations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_campaign_recipients: {
        Row: {
          attempt_count: number
          campaign_id: string
          created_at: string
          destination: string
          guest_id: string
          id: string
          last_error: string | null
          provider_reference: string | null
          restaurant_id: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          campaign_id: string
          created_at?: string
          destination: string
          guest_id: string
          id?: string
          last_error?: string | null
          provider_reference?: string | null
          restaurant_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          campaign_id?: string
          created_at?: string
          destination?: string
          guest_id?: string
          id?: string
          last_error?: string | null
          provider_reference?: string | null
          restaurant_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "crm_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_campaign_recipients_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "crm_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_campaign_recipients_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_campaigns: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          failed_count: number
          id: string
          last_error: string | null
          message: string
          name: string
          recipient_count: number
          restaurant_id: string
          scheduled_at: string | null
          segment_config: Json
          segment_type: string
          sent_count: number
          skipped_count: number
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          last_error?: string | null
          message: string
          name: string
          recipient_count?: number
          restaurant_id: string
          scheduled_at?: string | null
          segment_config?: Json
          segment_type: string
          sent_count?: number
          skipped_count?: number
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          failed_count?: number
          id?: string
          last_error?: string | null
          message?: string
          name?: string
          recipient_count?: number
          restaurant_id?: string
          scheduled_at?: string | null
          segment_config?: Json
          segment_type?: string
          sent_count?: number
          skipped_count?: number
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_campaigns_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_gift_cards: {
        Row: {
          balance: number
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          guest_id: string | null
          id: string
          initial_value: number
          restaurant_id: string
          status: string
        }
        Insert: {
          balance: number
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          guest_id?: string | null
          id?: string
          initial_value: number
          restaurant_id: string
          status?: string
        }
        Update: {
          balance?: number
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          guest_id?: string | null
          id?: string
          initial_value?: number
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_gift_cards_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "crm_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_gift_cards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_guests: {
        Row: {
          allergies: string[]
          birthday: string | null
          created_at: string
          email: string | null
          id: string
          last_visit_at: string | null
          lifetime_spend: number
          marketing_consent_source: string | null
          marketing_opt_in: boolean
          name: string | null
          phone: string | null
          preferences: Json
          restaurant_id: string
          updated_at: string
          visits: number
        }
        Insert: {
          allergies?: string[]
          birthday?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_visit_at?: string | null
          lifetime_spend?: number
          marketing_consent_source?: string | null
          marketing_opt_in?: boolean
          name?: string | null
          phone?: string | null
          preferences?: Json
          restaurant_id: string
          updated_at?: string
          visits?: number
        }
        Update: {
          allergies?: string[]
          birthday?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_visit_at?: string | null
          lifetime_spend?: number
          marketing_consent_source?: string | null
          marketing_opt_in?: boolean
          name?: string | null
          phone?: string | null
          preferences?: Json
          restaurant_id?: string
          updated_at?: string
          visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "crm_guests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_loyalty_accounts: {
        Row: {
          guest_id: string
          points: number
          restaurant_id: string
          tier: string
          updated_at: string
        }
        Insert: {
          guest_id: string
          points?: number
          restaurant_id: string
          tier?: string
          updated_at?: string
        }
        Update: {
          guest_id?: string
          points?: number
          restaurant_id?: string
          tier?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_loyalty_accounts_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: true
            referencedRelation: "crm_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_loyalty_accounts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_loyalty_ledger: {
        Row: {
          created_at: string
          guest_id: string
          id: string
          points: number
          reason: string
          restaurant_id: string
          source_order_id: string | null
        }
        Insert: {
          created_at?: string
          guest_id: string
          id?: string
          points: number
          reason: string
          restaurant_id: string
          source_order_id?: string | null
        }
        Update: {
          created_at?: string
          guest_id?: string
          id?: string
          points?: number
          reason?: string
          restaurant_id?: string
          source_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_loyalty_ledger_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "crm_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_loyalty_ledger_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_loyalty_ledger_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          description: string
          expense_date: string
          id: string
          reference: string
          restaurant_id: string
          source_id: string | null
          source_type: string | null
          supplier_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by?: string
          description: string
          expense_date?: string
          id?: string
          reference?: string
          restaurant_id: string
          source_id?: string | null
          source_type?: string | null
          supplier_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          description?: string
          expense_date?: string
          id?: string
          reference?: string
          restaurant_id?: string
          source_id?: string | null
          source_type?: string | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_expenses_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_inventory: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          created_at: string
          id: string
          name: string
          reorder_level: number
          restaurant_id: string
          unit: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          id?: string
          name: string
          reorder_level?: number
          restaurant_id: string
          unit: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          created_at?: string
          id?: string
          name?: string
          reorder_level?: number
          restaurant_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_inventory_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_menu_recipes: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string
          notes: string
          restaurant_id: string
          updated_at: string
          yield_quantity: number
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id: string
          notes?: string
          restaurant_id: string
          updated_at?: string
          yield_quantity?: number
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string
          notes?: string
          restaurant_id?: string
          updated_at?: string
          yield_quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_menu_recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_menu_recipes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_order_consumption_items: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          order_id: string
          quantity: number
          restaurant_id: string
          stock_movement_id: string | null
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          order_id: string
          quantity: number
          restaurant_id: string
          stock_movement_id?: string | null
          unit_cost?: number
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          order_id?: string
          quantity?: number
          restaurant_id?: string
          stock_movement_id?: string | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_order_consumption_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "erp_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_order_consumption_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "erp_inventory_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_order_consumption_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_order_consumption_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_order_consumption_items_stock_movement_id_fkey"
            columns: ["stock_movement_id"]
            isOneToOne: false
            referencedRelation: "erp_stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_order_consumptions: {
        Row: {
          consumed_at: string
          order_id: string
          restaurant_id: string
          reversed_at: string | null
        }
        Insert: {
          consumed_at?: string
          order_id: string
          restaurant_id: string
          reversed_at?: string | null
        }
        Update: {
          consumed_at?: string
          order_id?: string
          restaurant_id?: string
          reversed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_order_consumptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_order_consumptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_procurement_requests: {
        Row: {
          actual_unit_cost: number | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          estimated_unit_cost: number
          finance_expense_id: string | null
          id: string
          item_id: string | null
          item_name_snapshot: string
          needed_by: string | null
          notes: string
          ordered_at: string | null
          po_reference: string
          quantity: number
          received_at: string | null
          requested_by: string
          restaurant_id: string
          status: string
          stock_movement_id: string | null
          supplier_id: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          actual_unit_cost?: number | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          estimated_unit_cost?: number
          finance_expense_id?: string | null
          id?: string
          item_id?: string | null
          item_name_snapshot: string
          needed_by?: string | null
          notes?: string
          ordered_at?: string | null
          po_reference?: string
          quantity: number
          received_at?: string | null
          requested_by?: string
          restaurant_id: string
          status?: string
          stock_movement_id?: string | null
          supplier_id?: string | null
          unit: string
          updated_at?: string
        }
        Update: {
          actual_unit_cost?: number | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          estimated_unit_cost?: number
          finance_expense_id?: string | null
          id?: string
          item_id?: string | null
          item_name_snapshot?: string
          needed_by?: string | null
          notes?: string
          ordered_at?: string | null
          po_reference?: string
          quantity?: number
          received_at?: string | null
          requested_by?: string
          restaurant_id?: string
          status?: string
          stock_movement_id?: string | null
          supplier_id?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_procurement_requests_finance_expense_id_fkey"
            columns: ["finance_expense_id"]
            isOneToOne: false
            referencedRelation: "erp_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_procurement_requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "erp_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_procurement_requests_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "erp_inventory_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_procurement_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_procurement_requests_stock_movement_id_fkey"
            columns: ["stock_movement_id"]
            isOneToOne: false
            referencedRelation: "erp_stock_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_procurement_requests_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_recipe_items: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          quantity: number
          recipe_id: string
          restaurant_id: string
          waste_percent: number
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          quantity: number
          recipe_id: string
          restaurant_id: string
          waste_percent?: number
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          quantity?: number
          recipe_id?: string
          restaurant_id?: string
          waste_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_recipe_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "erp_inventory"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_recipe_items_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "erp_inventory_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_recipe_items_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "erp_menu_recipes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_recipe_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_stock_movements: {
        Row: {
          created_at: string
          created_by: string | null
          finance_expense_id: string | null
          id: string
          item_id: string
          movement_type: string
          quantity: number
          reason: string
          restaurant_id: string
          supplier_id: string | null
          total_cost: number | null
          unit_cost: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          finance_expense_id?: string | null
          id?: string
          item_id: string
          movement_type?: string
          quantity: number
          reason: string
          restaurant_id: string
          supplier_id?: string | null
          total_cost?: number | null
          unit_cost?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          finance_expense_id?: string | null
          id?: string
          item_id?: string
          movement_type?: string
          quantity?: number
          reason?: string
          restaurant_id?: string
          supplier_id?: string | null
          total_cost?: number | null
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "erp_stock_movements_finance_expense_id_fkey"
            columns: ["finance_expense_id"]
            isOneToOne: false
            referencedRelation: "erp_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_stock_movements_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_stock_movements_restaurant_id_item_id_fkey"
            columns: ["restaurant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "erp_inventory"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "erp_stock_movements_restaurant_id_item_id_fkey"
            columns: ["restaurant_id", "item_id"]
            isOneToOne: false
            referencedRelation: "erp_inventory_balances"
            referencedColumns: ["restaurant_id", "id"]
          },
          {
            foreignKeyName: "erp_stock_movements_restaurant_id_supplier_id_fkey"
            columns: ["restaurant_id", "supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["restaurant_id", "id"]
          },
        ]
      }
      erp_supplier_invoices: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          expense_id: string | null
          file_url: string | null
          id: string
          invoice_date: string
          invoice_number: string
          procurement_request_id: string | null
          restaurant_id: string
          status: string
          supplier_id: string | null
          tax_amount: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          file_url?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          procurement_request_id?: string | null
          restaurant_id: string
          status?: string
          supplier_id?: string | null
          tax_amount?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          file_url?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          procurement_request_id?: string | null
          restaurant_id?: string
          status?: string
          supplier_id?: string | null
          tax_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_supplier_invoices_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "erp_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_supplier_invoices_procurement_request_id_fkey"
            columns: ["procurement_request_id"]
            isOneToOne: false
            referencedRelation: "erp_procurement_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_supplier_invoices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "erp_supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "erp_suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      erp_suppliers: {
        Row: {
          contact: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
        }
        Insert: {
          contact?: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
        }
        Update: {
          contact?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "erp_suppliers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      in_app_notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          kind: string
          read_at: string | null
          restaurant_id: string
          source_id: string | null
          source_type: string | null
          staff_id: string | null
          target_role: string | null
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind: string
          read_at?: string | null
          restaurant_id: string
          source_id?: string | null
          source_type?: string | null
          staff_id?: string | null
          target_role?: string | null
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          restaurant_id?: string
          source_id?: string | null
          source_type?: string | null
          staff_id?: string | null
          target_role?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "in_app_notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "in_app_notifications_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          restaurant_id: string
          revoked_at: string | null
          scopes: string[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          restaurant_id: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          restaurant_id?: string
          revoked_at?: string | null
          scopes?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "integration_api_keys_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          capabilities: string[]
          category: string
          config: Json
          created_at: string
          credential_ref: string | null
          display_name: string
          id: string
          last_error: string | null
          last_sync_at: string | null
          last_tested_at: string | null
          provider: string
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          capabilities?: string[]
          category: string
          config?: Json
          created_at?: string
          credential_ref?: string | null
          display_name: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_tested_at?: string | null
          provider: string
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          capabilities?: string[]
          category?: string
          config?: Json
          created_at?: string
          credential_ref?: string | null
          display_name?: string
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          last_tested_at?: string | null
          provider?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_event_log: {
        Row: {
          connection_id: string | null
          created_at: string
          event_type: string
          id: string
          level: string
          message: string
          metadata: Json
          restaurant_id: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          level?: string
          message: string
          metadata?: Json
          restaurant_id: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_event_log_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_event_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_jobs: {
        Row: {
          action: string
          attempt_count: number
          category: string
          completed_at: string | null
          connection_id: string
          created_at: string
          external_key: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          request_started_at: string | null
          response_body: string | null
          response_status: number | null
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          action: string
          attempt_count?: number
          category: string
          completed_at?: string | null
          connection_id: string
          created_at?: string
          external_key: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          request_started_at?: string | null
          response_body?: string | null
          response_status?: number | null
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string
          attempt_count?: number
          category?: string
          completed_at?: string | null
          connection_id?: string
          created_at?: string
          external_key?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          request_started_at?: string | null
          response_body?: string | null
          response_status?: number | null
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_jobs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      item_modifiers: {
        Row: {
          created_at: string
          display_order: number
          group_id: string
          id: string
          is_active: boolean
          menu_item_id: string
          name_ar: string
          name_en: string
          price_delta: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          group_id: string
          id?: string
          is_active?: boolean
          menu_item_id: string
          name_ar: string
          name_en: string
          price_delta?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          group_id?: string
          id?: string
          is_active?: boolean
          menu_item_id?: string
          name_ar?: string
          name_en?: string
          price_delta?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_modifiers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "modifier_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_modifiers_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_modifiers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_print_logs: {
        Row: {
          created_at: string
          id: string
          kitchen_station_id: string | null
          order_id: string
          print_kind: string
          printed_by: string | null
          printer_id: string | null
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kitchen_station_id?: string | null
          order_id: string
          print_kind?: string
          printed_by?: string | null
          printer_id?: string | null
          restaurant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kitchen_station_id?: string | null
          order_id?: string
          print_kind?: string
          printed_by?: string | null
          printer_id?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_print_logs_kitchen_station_id_fkey"
            columns: ["kitchen_station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_print_logs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_print_logs_printer_id_fkey"
            columns: ["printer_id"]
            isOneToOne: false
            referencedRelation: "kitchen_printers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_print_logs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_printers: {
        Row: {
          config: Json
          created_at: string
          endpoint: string | null
          id: string
          is_active: boolean
          kitchen_station_id: string | null
          name: string
          provider: string
          purpose: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          endpoint?: string | null
          id?: string
          is_active?: boolean
          kitchen_station_id?: string | null
          name: string
          provider?: string
          purpose?: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          endpoint?: string | null
          id?: string
          is_active?: boolean
          kitchen_station_id?: string | null
          name?: string
          provider?: string
          purpose?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_printers_kitchen_station_id_fkey"
            columns: ["kitchen_station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kitchen_printers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_stations: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          name_ar: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          name_ar?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          name_ar?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kitchen_stations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_daily_closes: {
        Row: {
          close_date: string
          created_at: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          notes: string
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          restaurant_id: string
          snapshot: Json
          status: string
          updated_at: string
        }
        Insert: {
          close_date: string
          created_at?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          notes?: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          restaurant_id: string
          snapshot?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          close_date?: string
          created_at?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          notes?: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          restaurant_id?: string
          snapshot?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_daily_closes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          description_ar: string | null
          description_en: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          name_ar: string
          name_en: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name_ar: string
          name_en: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name_ar?: string
          name_en?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_design_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          published_at: string | null
          published_by: string | null
          restaurant_id: string
          scheduled_for: string | null
          snapshot: Json
          source: string
          status: string
          updated_at: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          published_at?: string | null
          published_by?: string | null
          restaurant_id: string
          scheduled_for?: string | null
          snapshot: Json
          source?: string
          status?: string
          updated_at?: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          published_at?: string | null
          published_by?: string | null
          restaurant_id?: string
          scheduled_for?: string | null
          snapshot?: Json
          source?: string
          status?: string
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_design_versions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string | null
          compare_at_price: number | null
          created_at: string
          description_ar: string | null
          description_en: string | null
          display_order: number
          id: string
          image_url: string | null
          is_available: boolean
          is_featured: boolean
          kitchen_station_id: string | null
          menu_origin: string
          name_ar: string
          name_en: string
          preparation_time: number
          price: number
          restaurant_id: string
          sold_out_note: string | null
          sold_out_until: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          kitchen_station_id?: string | null
          menu_origin?: string
          name_ar: string
          name_en: string
          preparation_time?: number
          price?: number
          restaurant_id: string
          sold_out_note?: string | null
          sold_out_until?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          compare_at_price?: number | null
          created_at?: string
          description_ar?: string | null
          description_en?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_available?: boolean
          is_featured?: boolean
          kitchen_station_id?: string | null
          menu_origin?: string
          name_ar?: string
          name_en?: string
          preparation_time?: number
          price?: number
          restaurant_id?: string
          sold_out_note?: string | null
          sold_out_until?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_kitchen_station_id_fkey"
            columns: ["kitchen_station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_pdf_documents: {
        Row: {
          analysis: Json
          created_at: string
          file_name: string
          file_parts: Json
          file_url: string
          id: string
          is_active: boolean
          page_count: number
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          analysis?: Json
          created_at?: string
          file_name: string
          file_parts?: Json
          file_url: string
          id?: string
          is_active?: boolean
          page_count?: number
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          analysis?: Json
          created_at?: string
          file_name?: string
          file_parts?: Json
          file_url?: string
          id?: string
          is_active?: boolean
          page_count?: number
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_pdf_documents_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_pdf_item_links: {
        Row: {
          candidate_id: string | null
          created_at: string
          document_id: string
          height: number
          id: string
          is_active: boolean
          label: string | null
          menu_item_id: string
          page_number: number
          restaurant_id: string
          source: string
          updated_at: string
          width: number
          x: number
          y: number
        }
        Insert: {
          candidate_id?: string | null
          created_at?: string
          document_id: string
          height: number
          id?: string
          is_active?: boolean
          label?: string | null
          menu_item_id: string
          page_number: number
          restaurant_id: string
          source?: string
          updated_at?: string
          width: number
          x: number
          y: number
        }
        Update: {
          candidate_id?: string | null
          created_at?: string
          document_id?: string
          height?: number
          id?: string
          is_active?: boolean
          label?: string | null
          menu_item_id?: string
          page_number?: number
          restaurant_id?: string
          source?: string
          updated_at?: string
          width?: number
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_pdf_item_links_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "menu_pdf_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_pdf_item_links_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_pdf_item_links_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      modifier_groups: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          is_required: boolean
          max_selection: number
          menu_item_id: string
          min_selection: number
          name_ar: string
          name_en: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          max_selection?: number
          menu_item_id: string
          min_selection?: number
          name_ar: string
          name_en: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          max_selection?: number
          menu_item_id?: string
          min_selection?: number
          name_ar?: string
          name_en?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "modifier_groups_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "modifier_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_dismissals: {
        Row: {
          created_at: string
          notification_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notification_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          notification_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_dismissals_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "in_app_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_dismissals_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "visible_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      operational_rules: {
        Row: {
          approval_role: string | null
          created_at: string
          due_minutes: number
          enabled: boolean
          event_type: string
          id: string
          last_error: string | null
          last_run_at: string | null
          last_status: string | null
          name: string
          next_run_at: string | null
          priority: string
          requires_approval: boolean
          restaurant_id: string
          rule_config: Json
          schedule_recurrence: string | null
          schedule_time: string | null
          schedule_timezone: string
          target_role: string | null
          updated_at: string
        }
        Insert: {
          approval_role?: string | null
          created_at?: string
          due_minutes?: number
          enabled?: boolean
          event_type: string
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name: string
          next_run_at?: string | null
          priority?: string
          requires_approval?: boolean
          restaurant_id: string
          rule_config?: Json
          schedule_recurrence?: string | null
          schedule_time?: string | null
          schedule_timezone?: string
          target_role?: string | null
          updated_at?: string
        }
        Update: {
          approval_role?: string | null
          created_at?: string
          due_minutes?: number
          enabled?: boolean
          event_type?: string
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          last_status?: string | null
          name?: string
          next_run_at?: string | null
          priority?: string
          requires_approval?: boolean
          restaurant_id?: string
          rule_config?: Json
          schedule_recurrence?: string | null
          schedule_time?: string | null
          schedule_timezone?: string
          target_role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_rules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_checks: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          label: string
          order_id: string
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          order_id: string
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          order_id?: string
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_checks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_checks_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          menu_item_id: string | null
          notes: string | null
          order_id: string
          product_name_snapshot_ar: string
          product_name_snapshot_en: string
          quantity: number
          restaurant_id: string
          selected_modifiers: Json
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          menu_item_id?: string | null
          notes?: string | null
          order_id: string
          product_name_snapshot_ar: string
          product_name_snapshot_en: string
          quantity?: number
          restaurant_id: string
          selected_modifiers?: Json
          total_price?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          menu_item_id?: string | null
          notes?: string | null
          order_id?: string
          product_name_snapshot_ar?: string
          product_name_snapshot_en?: string
          quantity?: number
          restaurant_id?: string
          selected_modifiers?: Json
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_events: {
        Row: {
          actor_name: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          actor_user_id: string | null
          created_at: string
          from_status: Database["public"]["Enums"]["order_status"] | null
          id: string
          note: string | null
          order_id: string
          restaurant_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          actor_name?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          note?: string | null
          order_id: string
          restaurant_id: string
          to_status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          actor_name?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          actor_user_id?: string | null
          created_at?: string
          from_status?: Database["public"]["Enums"]["order_status"] | null
          id?: string
          note?: string | null
          order_id?: string
          restaurant_id?: string
          to_status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_status_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_view_receipts: {
        Row: {
          order_id: string
          restaurant_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          order_id: string
          restaurant_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          order_id?: string
          restaurant_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_view_receipts_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_view_receipts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_at: string | null
          assigned_at: string | null
          assigned_staff_id: string | null
          cancellation_note: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          currency: string
          customer_notes: string | null
          delivery_address: string | null
          delivery_amount: number
          delivery_provider: string | null
          delivery_provider_reference: string | null
          delivery_status: string | null
          delivery_status_updated_at: string | null
          discount_amount: number
          fulfillment_type: string
          guest_email: string | null
          guest_id: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          order_number: string
          paid_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          preparing_at: string | null
          public_token: string
          ready_at: string | null
          restaurant_id: string
          scheduled_for: string | null
          served_at: string | null
          service_amount: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          table_visit_closed_at: string | null
          tax_amount: number
          tip_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string | null
          assigned_staff_id?: string | null
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          currency?: string
          customer_notes?: string | null
          delivery_address?: string | null
          delivery_amount?: number
          delivery_provider?: string | null
          delivery_provider_reference?: string | null
          delivery_status?: string | null
          delivery_status_updated_at?: string | null
          discount_amount?: number
          fulfillment_type?: string
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          order_number: string
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          preparing_at?: string | null
          public_token?: string
          ready_at?: string | null
          restaurant_id: string
          scheduled_for?: string | null
          served_at?: string | null
          service_amount?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          table_visit_closed_at?: string | null
          tax_amount?: number
          tip_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string | null
          assigned_staff_id?: string | null
          cancellation_note?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          currency?: string
          customer_notes?: string | null
          delivery_address?: string | null
          delivery_amount?: number
          delivery_provider?: string | null
          delivery_provider_reference?: string | null
          delivery_status?: string | null
          delivery_status_updated_at?: string | null
          discount_amount?: number
          fulfillment_type?: string
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          order_number?: string
          paid_at?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          preparing_at?: string | null
          public_token?: string
          ready_at?: string | null
          restaurant_id?: string
          scheduled_for?: string | null
          served_at?: string | null
          service_amount?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          table_visit_closed_at?: string | null
          tax_amount?: number
          tip_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "crm_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload_digest: string | null
          processed_at: string | null
          provider: string
          provider_event_id: string
          provider_intent_id: string | null
          restaurant_id: string | null
          status: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload_digest?: string | null
          processed_at?: string | null
          provider: string
          provider_event_id: string
          provider_intent_id?: string | null
          restaurant_id?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload_digest?: string | null
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          provider_intent_id?: string | null
          restaurant_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_provider_intents: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          idempotency_key: string
          last_error: string | null
          metadata: Json
          method_hint: string
          order_id: string
          payment_transaction_id: string | null
          provider: string
          provider_account_id: string | null
          provider_intent_id: string | null
          restaurant_id: string
          status: string
          tip_amount: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          currency: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          metadata?: Json
          method_hint?: string
          order_id: string
          payment_transaction_id?: string | null
          provider: string
          provider_account_id?: string | null
          provider_intent_id?: string | null
          restaurant_id: string
          status?: string
          tip_amount?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          metadata?: Json
          method_hint?: string
          order_id?: string
          payment_transaction_id?: string | null
          provider?: string
          provider_account_id?: string | null
          provider_intent_id?: string | null
          restaurant_id?: string
          status?: string
          tip_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_provider_intents_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_provider_intents_payment_transaction_id_fkey"
            columns: ["payment_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_provider_intents_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          cash_session_id: string | null
          check_id: string | null
          created_at: string
          created_by: string
          id: string
          metadata: Json
          method: string
          order_id: string
          parent_transaction_id: string | null
          provider: string | null
          provider_event_id: string | null
          provider_transaction_id: string | null
          reference: string
          restaurant_id: string
          status: string
          tip_amount: number
          transaction_type: string
        }
        Insert: {
          amount: number
          cash_session_id?: string | null
          check_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          metadata?: Json
          method: string
          order_id: string
          parent_transaction_id?: string | null
          provider?: string | null
          provider_event_id?: string | null
          provider_transaction_id?: string | null
          reference?: string
          restaurant_id: string
          status?: string
          tip_amount?: number
          transaction_type?: string
        }
        Update: {
          amount?: number
          cash_session_id?: string | null
          check_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          metadata?: Json
          method?: string
          order_id?: string
          parent_transaction_id?: string | null
          provider?: string | null
          provider_event_id?: string | null
          provider_transaction_id?: string | null
          reference?: string
          restaurant_id?: string
          status?: string
          tip_amount?: number
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_cash_session_id_fkey"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "order_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_parent_transaction_id_fkey"
            columns: ["parent_transaction_id"]
            isOneToOne: false
            referencedRelation: "payment_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_samples: {
        Row: {
          created_at: string
          device: string | null
          id: number
          metric: string
          restaurant_id: string | null
          route: string
          value: number
        }
        Insert: {
          created_at?: string
          device?: string | null
          id?: number
          metric: string
          restaurant_id?: string | null
          route?: string
          value: number
        }
        Update: {
          created_at?: string
          device?: string | null
          id?: number
          metric?: string
          restaurant_id?: string | null
          route?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_samples_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          ai_settings: Json
          created_at: string
          default_currency: string
          default_language: string
          default_tax_rate: number
          default_theme: string
          feature_flags: Json
          id: boolean
          logo_url: string | null
          platform_name: string
          updated_at: string
        }
        Insert: {
          ai_settings?: Json
          created_at?: string
          default_currency?: string
          default_language?: string
          default_tax_rate?: number
          default_theme?: string
          feature_flags?: Json
          id?: boolean
          logo_url?: string | null
          platform_name?: string
          updated_at?: string
        }
        Update: {
          ai_settings?: Json
          created_at?: string
          default_currency?: string
          default_language?: string
          default_tax_rate?: number
          default_theme?: string
          feature_flags?: Json
          id?: boolean
          logo_url?: string | null
          platform_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      public_rate_limits: {
        Row: {
          hits: number
          rate_key: string
          window_started_at: string
        }
        Insert: {
          hits?: number
          rate_key: string
          window_started_at: string
        }
        Update: {
          hits?: number
          rate_key?: string
          window_started_at?: string
        }
        Relationships: []
      }
      push_delivery_jobs: {
        Row: {
          attempts: number
          delivered_at: string | null
          last_error: string | null
          next_attempt_at: string
          notification_id: string
        }
        Insert: {
          attempts?: number
          delivered_at?: string | null
          last_error?: string | null
          next_attempt_at?: string
          notification_id: string
        }
        Update: {
          attempts?: number
          delivered_at?: string | null
          last_error?: string | null
          next_attempt_at?: string
          notification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_delivery_jobs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "in_app_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_delivery_jobs_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "visible_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          endpoint: string
          id: string
          p256dh: string
          preferences: Json
          restaurant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          endpoint: string
          id?: string
          p256dh: string
          preferences?: Json
          restaurant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          endpoint?: string
          id?: string
          p256dh?: string
          preferences?: Json
          restaurant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_staff_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string
          id: string
          is_active: boolean
          name: string
          planned_end: string
          planned_start: string
          restaurant_id: string
          staff_id: string
          start_date: string
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          name: string
          planned_end: string
          planned_start: string
          restaurant_id: string
          staff_id: string
          start_date: string
          updated_at?: string
          weekdays: number[]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          name?: string
          planned_end?: string
          planned_start?: string
          restaurant_id?: string
          staff_id?: string
          start_date?: string
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "recurring_staff_schedules_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_staff_schedules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_devices: {
        Row: {
          created_at: string
          created_by: string | null
          device_type: string
          id: string
          is_active: boolean
          kitchen_station_id: string | null
          last_metadata: Json
          last_route: string | null
          last_seen_at: string | null
          name: string
          restaurant_id: string
          token_hash: string
          token_prefix: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          device_type: string
          id?: string
          is_active?: boolean
          kitchen_station_id?: string | null
          last_metadata?: Json
          last_route?: string | null
          last_seen_at?: string | null
          name: string
          restaurant_id: string
          token_hash: string
          token_prefix: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          device_type?: string
          id?: string
          is_active?: boolean
          kitchen_station_id?: string | null
          last_metadata?: Json
          last_route?: string | null
          last_seen_at?: string | null
          name?: string
          restaurant_id?: string
          token_hash?: string
          token_prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_devices_kitchen_station_id_fkey"
            columns: ["kitchen_station_id"]
            isOneToOne: false
            referencedRelation: "kitchen_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_devices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_group_members: {
        Row: {
          created_at: string
          group_id: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "restaurant_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_group_members_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
        }
        Relationships: []
      }
      restaurant_media_cleanup: {
        Row: {
          attempts: number
          created_at: string
          next_attempt_at: string
          restaurant_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          next_attempt_at?: string
          restaurant_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          next_attempt_at?: string
          restaurant_id?: string
        }
        Relationships: []
      }
      restaurant_settings: {
        Row: {
          allow_special_notes: boolean
          collect_guest_details: boolean
          created_at: string
          delivery_fee: number
          enable_cashier: boolean
          enable_delivery: boolean
          enable_kitchen_display: boolean
          enable_loyalty: boolean
          enable_orders: boolean
          enable_pickup: boolean
          enable_reviews: boolean
          enable_service_charge: boolean
          enable_tips: boolean
          enable_waiter_calls: boolean
          estimated_preparation_time: number
          id: string
          loyalty_points_per_currency: number
          loyalty_redeem_value: number
          max_active_orders: number
          minimum_order: number
          order_auto_accept: boolean
          restaurant_id: string
          show_prices: boolean
          sound_notifications: boolean
          updated_at: string
        }
        Insert: {
          allow_special_notes?: boolean
          collect_guest_details?: boolean
          created_at?: string
          delivery_fee?: number
          enable_cashier?: boolean
          enable_delivery?: boolean
          enable_kitchen_display?: boolean
          enable_loyalty?: boolean
          enable_orders?: boolean
          enable_pickup?: boolean
          enable_reviews?: boolean
          enable_service_charge?: boolean
          enable_tips?: boolean
          enable_waiter_calls?: boolean
          estimated_preparation_time?: number
          id?: string
          loyalty_points_per_currency?: number
          loyalty_redeem_value?: number
          max_active_orders?: number
          minimum_order?: number
          order_auto_accept?: boolean
          restaurant_id: string
          show_prices?: boolean
          sound_notifications?: boolean
          updated_at?: string
        }
        Update: {
          allow_special_notes?: boolean
          collect_guest_details?: boolean
          created_at?: string
          delivery_fee?: number
          enable_cashier?: boolean
          enable_delivery?: boolean
          enable_kitchen_display?: boolean
          enable_loyalty?: boolean
          enable_orders?: boolean
          enable_pickup?: boolean
          enable_reviews?: boolean
          enable_service_charge?: boolean
          enable_tips?: boolean
          enable_waiter_calls?: boolean
          estimated_preparation_time?: number
          id?: string
          loyalty_points_per_currency?: number
          loyalty_redeem_value?: number
          max_active_orders?: number
          minimum_order?: number
          order_auto_accept?: boolean
          restaurant_id?: string
          show_prices?: boolean
          sound_notifications?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_tables: {
        Row: {
          activated_at: string | null
          capacity: number
          created_at: string
          id: string
          is_active: boolean
          layout: Json
          qr_code_url: string | null
          qr_token: string
          restaurant_id: string
          service_group_id: string | null
          service_status: string
          shape: string
          status_updated_at: string
          status_updated_by: string | null
          table_name: string | null
          table_number: string
          updated_at: string
          zone: string
        }
        Insert: {
          activated_at?: string | null
          capacity?: number
          created_at?: string
          id?: string
          is_active?: boolean
          layout?: Json
          qr_code_url?: string | null
          qr_token?: string
          restaurant_id: string
          service_group_id?: string | null
          service_status?: string
          shape?: string
          status_updated_at?: string
          status_updated_by?: string | null
          table_name?: string | null
          table_number: string
          updated_at?: string
          zone?: string
        }
        Update: {
          activated_at?: string | null
          capacity?: number
          created_at?: string
          id?: string
          is_active?: boolean
          layout?: Json
          qr_code_url?: string | null
          qr_token?: string
          restaurant_id?: string
          service_group_id?: string | null
          service_status?: string
          shape?: string
          status_updated_at?: string
          status_updated_by?: string | null
          table_name?: string | null
          table_number?: string
          updated_at?: string
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_tables_service_group_id_fkey"
            columns: ["service_group_id"]
            isOneToOne: false
            referencedRelation: "table_service_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          accent_color: string
          address_ar: string | null
          address_en: string | null
          archived_at: string | null
          background_color: string
          card_style: string
          cover_image_url: string | null
          created_at: string
          currency: string
          default_language: string
          description_ar: string | null
          description_en: string | null
          email: string | null
          font_family: string
          google_maps_url: string | null
          google_place_id: string | null
          id: string
          is_active: boolean
          latitude: number | null
          layout_style: string
          logo_url: string | null
          longitude: number | null
          menu_style: string
          menu_theme: Json
          name: string
          phone: string | null
          primary_color: string
          seat_limit: number
          secondary_color: string
          service_charge: number
          slug: string
          staff_code: string | null
          subscription_end: string | null
          subscription_plan: Database["public"]["Enums"]["subscription_plan"]
          subscription_start: string
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          tax_rate: number
          text_color: string
          theme: string
          timezone: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          address_ar?: string | null
          address_en?: string | null
          archived_at?: string | null
          background_color?: string
          card_style?: string
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          default_language?: string
          description_ar?: string | null
          description_en?: string | null
          email?: string | null
          font_family?: string
          google_maps_url?: string | null
          google_place_id?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          layout_style?: string
          logo_url?: string | null
          longitude?: number | null
          menu_style?: string
          menu_theme?: Json
          name: string
          phone?: string | null
          primary_color?: string
          seat_limit?: number
          secondary_color?: string
          service_charge?: number
          slug: string
          staff_code?: string | null
          subscription_end?: string | null
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          subscription_start?: string
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          tax_rate?: number
          text_color?: string
          theme?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          address_ar?: string | null
          address_en?: string | null
          archived_at?: string | null
          background_color?: string
          card_style?: string
          cover_image_url?: string | null
          created_at?: string
          currency?: string
          default_language?: string
          description_ar?: string | null
          description_en?: string | null
          email?: string | null
          font_family?: string
          google_maps_url?: string | null
          google_place_id?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          layout_style?: string
          logo_url?: string | null
          longitude?: number | null
          menu_style?: string
          menu_theme?: Json
          name?: string
          phone?: string | null
          primary_color?: string
          seat_limit?: number
          secondary_color?: string
          service_charge?: number
          slug?: string
          staff_code?: string | null
          subscription_end?: string | null
          subscription_plan?: Database["public"]["Enums"]["subscription_plan"]
          subscription_start?: string
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          tax_rate?: number
          text_color?: string
          theme?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      saas_usage_daily: {
        Row: {
          active_staff: number
          menu_items_count: number
          orders_count: number
          restaurant_id: string
          storage_bytes: number
          tables_count: number
          usage_date: string
        }
        Insert: {
          active_staff?: number
          menu_items_count?: number
          orders_count?: number
          restaurant_id: string
          storage_bytes?: number
          tables_count?: number
          usage_date?: string
        }
        Update: {
          active_staff?: number
          menu_items_count?: number
          orders_count?: number
          restaurant_id?: string
          storage_bytes?: number
          tables_count?: number
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_usage_daily_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_assignments: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          notes: string | null
          restaurant_id: string
          role_snapshot: string | null
          shift_id: string
          staff_id: string
          starts_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          restaurant_id: string
          role_snapshot?: string | null
          shift_id: string
          staff_id: string
          starts_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          notes?: string | null
          restaurant_id?: string
          role_snapshot?: string | null
          shift_id?: string
          staff_id?: string
          starts_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_assignments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_handovers: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_staff_id: string | null
          cash_note: string | null
          category: string
          created_at: string
          from_staff_id: string | null
          id: string
          inventory_note: string | null
          next_shift_id: string | null
          priority: string
          resolved_at: string | null
          resolved_by_staff_id: string | null
          restaurant_id: string
          shift_id: string | null
          summary: string
          target_role: string | null
          to_staff_id: string | null
          unresolved_items: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_staff_id?: string | null
          cash_note?: string | null
          category?: string
          created_at?: string
          from_staff_id?: string | null
          id?: string
          inventory_note?: string | null
          next_shift_id?: string | null
          priority?: string
          resolved_at?: string | null
          resolved_by_staff_id?: string | null
          restaurant_id: string
          shift_id?: string | null
          summary: string
          target_role?: string | null
          to_staff_id?: string | null
          unresolved_items?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_staff_id?: string | null
          cash_note?: string | null
          category?: string
          created_at?: string
          from_staff_id?: string | null
          id?: string
          inventory_note?: string | null
          next_shift_id?: string | null
          priority?: string
          resolved_at?: string | null
          resolved_by_staff_id?: string | null
          restaurant_id?: string
          shift_id?: string | null
          summary?: string
          target_role?: string | null
          to_staff_id?: string | null
          unresolved_items?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_handovers_acknowledged_by_staff_id_fkey"
            columns: ["acknowledged_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_from_staff_id_fkey"
            columns: ["from_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_next_shift_id_fkey"
            columns: ["next_shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_resolved_by_staff_id_fkey"
            columns: ["resolved_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_handovers_to_staff_id_fkey"
            columns: ["to_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          actual_closed_at: string | null
          actual_opened_at: string | null
          closed_by_staff_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by_staff_id: string | null
          id: string
          name: string
          notes: string | null
          opened_by_staff_id: string | null
          planned_end: string | null
          planned_start: string | null
          restaurant_id: string
          shift_date: string
          status: string
          updated_at: string
        }
        Insert: {
          actual_closed_at?: string | null
          actual_opened_at?: string | null
          closed_by_staff_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by_staff_id?: string | null
          id?: string
          name: string
          notes?: string | null
          opened_by_staff_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          restaurant_id: string
          shift_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          actual_closed_at?: string | null
          actual_opened_at?: string | null
          closed_by_staff_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by_staff_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          opened_by_staff_id?: string | null
          planned_end?: string | null
          planned_start?: string | null
          restaurant_id?: string
          shift_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_closed_by_staff_id_fkey"
            columns: ["closed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_deleted_by_staff_id_fkey"
            columns: ["deleted_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_opened_by_staff_id_fkey"
            columns: ["opened_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          auth_user_id: string
          avatar_preset: string | null
          avatar_url: string | null
          cover_image_url: string | null
          cover_position_x: number
          cover_position_y: number
          cover_zoom: number
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          name: string
          permission_overrides: Json
          restaurant_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          avatar_preset?: string | null
          avatar_url?: string | null
          cover_image_url?: string | null
          cover_position_x?: number
          cover_position_y?: number
          cover_zoom?: number
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          name: string
          permission_overrides?: Json
          restaurant_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          avatar_preset?: string | null
          avatar_url?: string | null
          cover_image_url?: string | null
          cover_position_x?: number
          cover_position_y?: number
          cover_zoom?: number
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          name?: string
          permission_overrides?: Json
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_credentials: {
        Row: {
          created_at: string
          login_code: string | null
          pin_hash: string | null
          restaurant_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          login_code?: string | null
          pin_hash?: string | null
          restaurant_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          login_code?: string | null
          pin_hash?: string | null
          restaurant_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_credentials_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_credentials_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: true
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_leave_requests: {
        Row: {
          attachment_mime: string | null
          attachment_name: string | null
          attachment_path: string | null
          created_at: string
          end_date: string
          end_time: string | null
          family_degree: string | null
          id: string
          leave_type: string
          reason: string
          restaurant_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          start_date: string
          start_time: string | null
          status: string
        }
        Insert: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          created_at?: string
          end_date: string
          end_time?: string | null
          family_degree?: string | null
          id?: string
          leave_type?: string
          reason?: string
          restaurant_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          start_date: string
          start_time?: string | null
          status?: string
        }
        Update: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          created_at?: string
          end_date?: string
          end_time?: string | null
          family_degree?: string | null
          id?: string
          leave_type?: string
          reason?: string
          restaurant_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          start_date?: string
          start_time?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_leave_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_leave_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_missing_punch_requests: {
        Row: {
          assignment_id: string | null
          break_minutes: number
          clock_in: string
          clock_out: string
          created_at: string
          id: string
          origin: string
          reason: string
          recorded_clock_out: string | null
          resolution: string | null
          restaurant_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by_staff_id: string | null
          scheduled_end: string | null
          staff_id: string
          status: string
          time_entry_id: string | null
          updated_at: string
        }
        Insert: {
          assignment_id?: string | null
          break_minutes?: number
          clock_in: string
          clock_out: string
          created_at?: string
          id?: string
          origin?: string
          reason: string
          recorded_clock_out?: string | null
          resolution?: string | null
          restaurant_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_staff_id?: string | null
          scheduled_end?: string | null
          staff_id: string
          status?: string
          time_entry_id?: string | null
          updated_at?: string
        }
        Update: {
          assignment_id?: string | null
          break_minutes?: number
          clock_in?: string
          clock_out?: string
          created_at?: string
          id?: string
          origin?: string
          reason?: string
          recorded_clock_out?: string | null
          resolution?: string | null
          restaurant_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by_staff_id?: string | null
          scheduled_end?: string | null
          staff_id?: string
          status?: string
          time_entry_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_missing_punch_requests_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "shift_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_missing_punch_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_missing_punch_requests_reviewed_by_staff_id_fkey"
            columns: ["reviewed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_missing_punch_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_missing_punch_requests_time_entry_id_fkey"
            columns: ["time_entry_id"]
            isOneToOne: false
            referencedRelation: "staff_time_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_permission_requests: {
        Row: {
          attachment_mime: string | null
          attachment_name: string | null
          attachment_path: string | null
          created_at: string
          end_time: string | null
          expected_arrival_time: string | null
          id: string
          permission_type: string
          reason: string
          request_date: string
          restaurant_id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          start_time: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          created_at?: string
          end_time?: string | null
          expected_arrival_time?: string | null
          id?: string
          permission_type: string
          reason: string
          request_date: string
          restaurant_id: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          created_at?: string
          end_time?: string | null
          expected_arrival_time?: string | null
          id?: string
          permission_type?: string
          reason?: string
          request_date?: string
          restaurant_id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          start_time?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_permission_requests_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_permission_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_permission_requests_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_time_entries: {
        Row: {
          approved_by: string | null
          approved_overtime_minutes: number
          break_minutes: number
          clock_in: string
          clock_out: string | null
          created_at: string
          id: string
          notes: string
          restaurant_id: string
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by_staff_id: string | null
          staff_id: string
        }
        Insert: {
          approved_by?: string | null
          approved_overtime_minutes?: number
          break_minutes?: number
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          notes?: string
          restaurant_id: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_staff_id?: string | null
          staff_id: string
        }
        Update: {
          approved_by?: string | null
          approved_overtime_minutes?: number
          break_minutes?: number
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          notes?: string
          restaurant_id?: string
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by_staff_id?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_entries_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_entries_reviewed_by_staff_id_fkey"
            columns: ["reviewed_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_time_entry_corrections: {
        Row: {
          action: string
          actor_staff_id: string | null
          created_at: string
          entry_id: string
          id: string
          next: Json
          previous: Json
          reason: string
          restaurant_id: string
        }
        Insert: {
          action: string
          actor_staff_id?: string | null
          created_at?: string
          entry_id: string
          id?: string
          next?: Json
          previous?: Json
          reason?: string
          restaurant_id: string
        }
        Update: {
          action?: string
          actor_staff_id?: string | null
          created_at?: string
          entry_id?: string
          id?: string
          next?: Json
          previous?: Json
          reason?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_entry_corrections_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_entry_corrections_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "staff_time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_entry_corrections_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          advanced_features: boolean
          ai_features: boolean
          analytics_enabled: boolean
          created_at: string
          custom_branding: boolean
          max_monthly_orders: number | null
          max_products: number | null
          max_staff: number | null
          max_tables: number | null
          name_ar: string
          name_en: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          price_monthly: number
          updated_at: string
        }
        Insert: {
          advanced_features?: boolean
          ai_features?: boolean
          analytics_enabled?: boolean
          created_at?: string
          custom_branding?: boolean
          max_monthly_orders?: number | null
          max_products?: number | null
          max_staff?: number | null
          max_tables?: number | null
          name_ar: string
          name_en: string
          plan: Database["public"]["Enums"]["subscription_plan"]
          price_monthly?: number
          updated_at?: string
        }
        Update: {
          advanced_features?: boolean
          ai_features?: boolean
          analytics_enabled?: boolean
          created_at?: string
          custom_branding?: boolean
          max_monthly_orders?: number | null
          max_products?: number | null
          max_staff?: number | null
          max_tables?: number | null
          name_ar?: string
          name_en?: string
          plan?: Database["public"]["Enums"]["subscription_plan"]
          price_monthly?: number
          updated_at?: string
        }
        Relationships: []
      }
      system_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          message: string
          metadata: Json
          restaurant_id: string | null
          route: string | null
          severity: string
          source: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          message: string
          metadata?: Json
          restaurant_id?: string | null
          route?: string | null
          severity?: string
          source: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          message?: string
          metadata?: Json
          restaurant_id?: string | null
          route?: string | null
          severity?: string
          source?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_events_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      table_bookings: {
        Row: {
          assigned_staff_id: string | null
          booking_at: string
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmation_code: string
          confirmation_sent_at: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          deposit_amount: number
          deposit_reference: string | null
          deposit_status: string
          duration_minutes: number
          email: string | null
          ends_at: string
          guest_count: number
          guest_id: string | null
          id: string
          no_show_at: string | null
          notes: string | null
          occasion: string | null
          phone: string | null
          public_token: string
          reminder_sent_at: string | null
          restaurant_id: string
          seated_at: string | null
          source: string
          special_requests: string | null
          status: string
          table_id: string | null
          updated_at: string
          zone: string | null
        }
        Insert: {
          assigned_staff_id?: string | null
          booking_at: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmation_code: string
          confirmation_sent_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_name: string
          deposit_amount?: number
          deposit_reference?: string | null
          deposit_status?: string
          duration_minutes?: number
          email?: string | null
          ends_at: string
          guest_count?: number
          guest_id?: string | null
          id?: string
          no_show_at?: string | null
          notes?: string | null
          occasion?: string | null
          phone?: string | null
          public_token: string
          reminder_sent_at?: string | null
          restaurant_id: string
          seated_at?: string | null
          source?: string
          special_requests?: string | null
          status?: string
          table_id?: string | null
          updated_at?: string
          zone?: string | null
        }
        Update: {
          assigned_staff_id?: string | null
          booking_at?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          confirmation_code?: string
          confirmation_sent_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_name?: string
          deposit_amount?: number
          deposit_reference?: string | null
          deposit_status?: string
          duration_minutes?: number
          email?: string | null
          ends_at?: string
          guest_count?: number
          guest_id?: string | null
          id?: string
          no_show_at?: string | null
          notes?: string | null
          occasion?: string | null
          phone?: string | null
          public_token?: string
          reminder_sent_at?: string | null
          restaurant_id?: string
          seated_at?: string | null
          source?: string
          special_requests?: string | null
          status?: string
          table_id?: string | null
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_bookings_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_bookings_guest_id_fkey"
            columns: ["guest_id"]
            isOneToOne: false
            referencedRelation: "crm_guests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_bookings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_bookings_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      table_service_groups: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          label: string | null
          restaurant_id: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          restaurant_id: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
          restaurant_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_service_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      waiter_calls: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          id: string
          note: string | null
          resolved_at: string | null
          restaurant_id: string
          status: Database["public"]["Enums"]["waiter_call_status"]
          table_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          resolved_at?: string | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["waiter_call_status"]
          table_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          id?: string
          note?: string | null
          resolved_at?: string | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["waiter_call_status"]
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiter_calls_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_calls_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_notification_jobs: {
        Row: {
          attempt_count: number
          channel: string
          created_at: string
          destination: string
          id: string
          last_error: string | null
          next_attempt_at: string
          offer_sequence: number
          provider_reference: string | null
          restaurant_id: string
          sent_at: string | null
          status: string
          updated_at: string
          waitlist_id: string
        }
        Insert: {
          attempt_count?: number
          channel: string
          created_at?: string
          destination: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          offer_sequence: number
          provider_reference?: string | null
          restaurant_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          waitlist_id: string
        }
        Update: {
          attempt_count?: number
          channel?: string
          created_at?: string
          destination?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          offer_sequence?: number
          provider_reference?: string | null
          restaurant_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          waitlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_notification_jobs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_notification_jobs_waitlist_id_fkey"
            columns: ["waitlist_id"]
            isOneToOne: false
            referencedRelation: "booking_waitlist"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          endpoint_id: string
          event_type: string
          id: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          request_id: number | null
          response_body: string | null
          response_status: number | null
          restaurant_id: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id: string
          event_type: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload: Json
          request_id?: number | null
          response_body?: string | null
          response_status?: number | null
          restaurant_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          endpoint_id?: string
          event_type?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          request_id?: number | null
          response_body?: string | null
          response_status?: number | null
          restaurant_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          created_at: string
          created_by: string | null
          event_types: string[]
          id: string
          is_active: boolean
          last_error: string | null
          last_failure_at: string | null
          last_success_at: string | null
          name: string
          restaurant_id: string
          updated_at: string
          url: string
          vault_secret_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_types?: string[]
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          name: string
          restaurant_id: string
          updated_at?: string
          url: string
          vault_secret_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_types?: string[]
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          name?: string
          restaurant_id?: string
          updated_at?: string
          url?: string
          vault_secret_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_endpoints_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      work_task_activity: {
        Row: {
          action: string
          actor_staff_id: string | null
          created_at: string
          id: string
          metadata: Json
          note: string | null
          restaurant_id: string
          task_id: string
        }
        Insert: {
          action: string
          actor_staff_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          restaurant_id: string
          task_id: string
        }
        Update: {
          action?: string
          actor_staff_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          restaurant_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_task_activity_actor_staff_id_fkey"
            columns: ["actor_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_task_activity_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "work_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      work_tasks: {
        Row: {
          approval_action_at: string | null
          approval_note: string | null
          approval_role: string | null
          approval_staff_id: string | null
          approval_status: string
          approved_at: string | null
          approved_by_staff_id: string | null
          assigned_role: string | null
          assigned_staff_id: string | null
          category: string
          completed_at: string | null
          completion_note: string | null
          created_at: string
          created_by_staff_id: string | null
          deleted_at: string | null
          deleted_by_staff_id: string | null
          description: string | null
          due_at: string | null
          id: string
          is_private: boolean
          metadata: Json
          priority: string
          requires_approval: boolean
          restaurant_id: string
          source_id: string | null
          source_rule_id: string | null
          source_type: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          approval_action_at?: string | null
          approval_note?: string | null
          approval_role?: string | null
          approval_staff_id?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by_staff_id?: string | null
          assigned_role?: string | null
          assigned_staff_id?: string | null
          category?: string
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          created_by_staff_id?: string | null
          deleted_at?: string | null
          deleted_by_staff_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          is_private?: boolean
          metadata?: Json
          priority?: string
          requires_approval?: boolean
          restaurant_id: string
          source_id?: string | null
          source_rule_id?: string | null
          source_type?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          approval_action_at?: string | null
          approval_note?: string | null
          approval_role?: string | null
          approval_staff_id?: string | null
          approval_status?: string
          approved_at?: string | null
          approved_by_staff_id?: string | null
          assigned_role?: string | null
          assigned_staff_id?: string | null
          category?: string
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string
          created_by_staff_id?: string | null
          deleted_at?: string | null
          deleted_by_staff_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          is_private?: boolean
          metadata?: Json
          priority?: string
          requires_approval?: boolean
          restaurant_id?: string
          source_id?: string | null
          source_rule_id?: string | null
          source_type?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_tasks_approval_staff_id_fkey"
            columns: ["approval_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_tasks_approved_by_staff_id_fkey"
            columns: ["approved_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_tasks_assigned_staff_id_fkey"
            columns: ["assigned_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_tasks_created_by_staff_id_fkey"
            columns: ["created_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_tasks_deleted_by_staff_id_fkey"
            columns: ["deleted_by_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_tasks_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_tasks_source_rule_id_fkey"
            columns: ["source_rule_id"]
            isOneToOne: false
            referencedRelation: "operational_rules"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      erp_inventory_balances: {
        Row: {
          id: string | null
          name: string | null
          quantity: number | null
          reorder_level: number | null
          restaurant_id: string | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "erp_inventory_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      visible_notifications: {
        Row: {
          body: string | null
          created_at: string | null
          dedupe_key: string | null
          id: string | null
          kind: string | null
          read_at: string | null
          restaurant_id: string | null
          source_id: string | null
          source_type: string | null
          staff_id: string | null
          target_role: string | null
          title: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          dedupe_key?: string | null
          id?: string | null
          kind?: string | null
          read_at?: string | null
          restaurant_id?: string | null
          source_id?: string | null
          source_type?: string | null
          staff_id?: string | null
          target_role?: string | null
          title?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          dedupe_key?: string | null
          id?: string | null
          kind?: string | null
          read_at?: string | null
          restaurant_id?: string | null
          source_id?: string | null
          source_type?: string | null
          staff_id?: string | null
          target_role?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "in_app_notifications_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "in_app_notifications_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      action_work_approval: {
        Args: { _action: string; _note?: string; _task_id: string }
        Returns: {
          approval_action_at: string | null
          approval_note: string | null
          approval_role: string | null
          approval_staff_id: string | null
          approval_status: string
          approved_at: string | null
          approved_by_staff_id: string | null
          assigned_role: string | null
          assigned_staff_id: string | null
          category: string
          completed_at: string | null
          completion_note: string | null
          created_at: string
          created_by_staff_id: string | null
          deleted_at: string | null
          deleted_by_staff_id: string | null
          description: string | null
          due_at: string | null
          id: string
          is_private: boolean
          metadata: Json
          priority: string
          requires_approval: boolean
          restaurant_id: string
          source_id: string | null
          source_rule_id: string | null
          source_type: string | null
          status: string
          title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "work_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      activate_table_from_qr: { Args: { _qr_token: string }; Returns: string }
      admin_restaurant_lifecycle: {
        Args: {
          _action: string
          _confirmation?: string
          _restaurant_id: string
        }
        Returns: undefined
      }
      archive_shift: { Args: { _shift_id: string }; Returns: undefined }
      archive_work_task: { Args: { _task_id: string }; Returns: undefined }
      assign_recurring_staff_shifts: {
        Args: {
          _end_date: string
          _name: string
          _planned_end: string
          _planned_start: string
          _restaurant_id: string
          _staff_id: string
          _start_date: string
          _weekdays: number[]
        }
        Returns: Json
      }
      assign_staff_shift: {
        Args: {
          _name?: string
          _planned_end?: string
          _planned_start?: string
          _restaurant_id: string
          _shift_date?: string
          _shift_id?: string
          _staff_id: string
        }
        Returns: string
      }
      authenticate_integration_api_key: {
        Args: { _api_key: string }
        Returns: Json
      }
      booking_message_provider_update: {
        Args: {
          _from_address?: string
          _last_error?: string
          _message_id: string
          _provider_message_id: string
          _provider_status: string
        }
        Returns: undefined
      }
      cancel_crm_campaign: {
        Args: { _campaign_id: string }
        Returns: undefined
      }
      cancel_public_booking: {
        Args: { _reason?: string; _token: string }
        Returns: boolean
      }
      cancel_scheduled_menu_design: {
        Args: { _version_id: string }
        Returns: undefined
      }
      cancel_staff_shift_assignment: {
        Args: { _assignment_id: string; _restaurant_id: string }
        Returns: undefined
      }
      claim_platform_ownership: { Args: { _name?: string }; Returns: boolean }
      claim_push_jobs: {
        Args: never
        Returns: {
          attempts: number
          delivered_at: string | null
          last_error: string | null
          next_attempt_at: string
          notification_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "push_delivery_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_restaurant_cleanup: {
        Args: never
        Returns: {
          attempts: number
          created_at: string
          next_attempt_at: string
          restaurant_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "restaurant_media_cleanup"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clock_in_staff: {
        Args: { _restaurant_id: string }
        Returns: {
          action: string
          at: string
          clock_in: string
          entry_id: string
          staff_id: string
        }[]
      }
      clock_out_staff: {
        Args: { _restaurant_id: string }
        Returns: {
          action: string
          at: string
          clock_in: string
          entry_id: string
          staff_id: string
        }[]
      }
      close_cash_session: {
        Args: { _closing_cash: number; _notes?: string; _session_id: string }
        Returns: undefined
      }
      complete_payment_provider_event: {
        Args: {
          _error?: string
          _event_id: string
          _provider: string
          _status: string
        }
        Returns: undefined
      }
      convert_booking_waitlist: {
        Args: { _booking_at: string; _table_id?: string; _waitlist_id: string }
        Returns: string
      }
      create_crm_campaign: {
        Args: {
          _channel: string
          _message: string
          _name: string
          _restaurant_id: string
          _segment_config: Json
          _segment_type: string
          _subject: string
        }
        Returns: string
      }
      create_integration_api_key: {
        Args: {
          _expires_at?: string
          _name: string
          _restaurant_id: string
          _scopes?: string[]
        }
        Returns: Json
      }
      create_missing_time_entry: {
        Args: {
          _break_minutes?: number
          _clock_in: string
          _clock_out: string
          _reason?: string
          _restaurant_id: string
          _staff_id: string
        }
        Returns: string
      }
      create_public_booking: {
        Args: {
          _booking_at: string
          _customer_name: string
          _email: string
          _guest_count: number
          _marketing_opt_in?: boolean
          _notes?: string
          _occasion?: string
          _phone: string
          _slug: string
        }
        Returns: Json
      }
      create_public_booking_waitlist: {
        Args: {
          _customer_name: string
          _desired_date: string
          _email: string
          _guest_count: number
          _notes?: string
          _occasion?: string
          _phone: string
          _preferred_time?: string
          _slug: string
        }
        Returns: Json
      }
      create_recurring_shifts: {
        Args: {
          _end_date: string
          _name: string
          _notes?: string
          _planned_end: string
          _planned_start: string
          _restaurant_id: string
          _start_date: string
          _weekdays: number[]
        }
        Returns: number
      }
      create_restaurant_with_setup: {
        Args: { _payload: Json; _table_count?: number }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      create_staff_booking: {
        Args: {
          _booking_at: string
          _customer_name: string
          _duration_minutes?: number
          _email: string
          _guest_count: number
          _notes?: string
          _occasion?: string
          _phone: string
          _restaurant_id: string
          _source?: string
          _status?: string
          _table_id?: string
        }
        Returns: string
      }
      create_webhook_endpoint: {
        Args: {
          _event_types: string[]
          _name: string
          _restaurant_id: string
          _url: string
        }
        Returns: Json
      }
      delete_all_menu_design_versions: {
        Args: { _restaurant_id: string }
        Returns: number
      }
      delete_booking_reservation: {
        Args: { _booking_id: string; _reason?: string }
        Returns: boolean
      }
      delete_menu_design_version: {
        Args: { _version_id: string }
        Returns: undefined
      }
      disable_webhook_endpoint: {
        Args: { _endpoint_id: string }
        Returns: undefined
      }
      dismiss_notifications: {
        Args: { _before?: string; _ids?: string[]; _restaurant_id: string }
        Returns: string[]
      }
      dispatch_webhook_deliveries: {
        Args: { _limit?: number }
        Returns: number
      }
      end_table_visit: { Args: { _table_id: string }; Returns: string }
      enqueue_due_booking_reminders: { Args: never; Returns: number }
      enqueue_webhook_test: { Args: { _endpoint_id: string }; Returns: string }
      erp_delete_inventory_item: {
        Args: { _item_id: string }
        Returns: undefined
      }
      erp_receive_procurement_request: {
        Args: { _request_id: string; _unit_cost?: number }
        Returns: string
      }
      erp_set_procurement_status: {
        Args: { _po_reference?: string; _request_id: string; _status: string }
        Returns: undefined
      }
      finalize_manager_daily_close: {
        Args: { _close_date: string; _notes?: string; _restaurant_id: string }
        Returns: string
      }
      find_available_booking_tables: {
        Args: {
          _booking_at: string
          _duration_minutes?: number
          _guest_count: number
          _restaurant_id: string
        }
        Returns: {
          capacity: number
          id: string
          table_name: string
          table_number: string
          zone: string
        }[]
      }
      get_accounting_export: {
        Args: { _from: string; _restaurant_id: string; _to: string }
        Returns: Json
      }
      get_manager_daily_close_summary: {
        Args: { _close_date?: string; _restaurant_id: string }
        Returns: Json
      }
      get_my_time_clock_status: {
        Args: { _restaurant_id: string }
        Returns: {
          clock_in: string
          elapsed_seconds: number
          entry_id: string
          server_now: string
          staff_id: string
        }[]
      }
      get_operational_forecast: {
        Args: { _restaurant_id: string; _target_date?: string }
        Returns: Json
      }
      get_order_checks: {
        Args: { _order_id: string }
        Returns: {
          amount: number
          created_at: string
          due_amount: number
          id: string
          label: string
          paid_amount: number
          status: string
        }[]
      }
      get_public_booking_page: { Args: { _slug: string }; Returns: Json }
      get_public_booking_slots: {
        Args: { _booking_date: string; _guest_count: number; _slug: string }
        Returns: {
          available_tables: number
          slot_at: string
        }[]
      }
      get_public_booking_status: { Args: { _token: string }; Returns: Json }
      get_public_waitlist_status: { Args: { _token: string }; Returns: Json }
      get_table_service_groups: {
        Args: { _restaurant_id: string }
        Returns: {
          combined_capacity: number
          created_at: string
          id: string
          label: string
          status: string
          table_ids: string[]
          table_numbers: string[]
        }[]
      }
      heartbeat_restaurant_device: {
        Args: { _device_token: string; _metadata?: Json; _route?: string }
        Returns: Json
      }
      home_period_overview: {
        Args: { _end: string; _restaurant_id: string; _start: string }
        Returns: Json
      }
      is_platform_owner: { Args: never; Returns: boolean }
      issue_gift_card: {
        Args: {
          _expires_at?: string
          _guest_id?: string
          _restaurant_id: string
          _value: number
        }
        Returns: string
      }
      list_integration_api_keys: {
        Args: { _restaurant_id: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          key_prefix: string
          last_used_at: string
          name: string
          revoked_at: string
          scopes: string[]
        }[]
      }
      mark_order_viewed: { Args: { _order_id: string }; Returns: undefined }
      mark_workforce_attention_read: {
        Args: { _alert_keys: string[]; _restaurant_id: string }
        Returns: number
      }
      match_booking_for_inbound_phone: {
        Args: { _phone: string }
        Returns: Json
      }
      merge_open_order_checks: { Args: { _order_id: string }; Returns: string }
      merge_service_tables: {
        Args: { _label?: string; _restaurant_id: string; _table_ids: string[] }
        Returns: string
      }
      offer_waitlist_entry: {
        Args: {
          _booking_at: string
          _hold_minutes?: number
          _table_id?: string
          _waitlist_id: string
        }
        Returns: Json
      }
      open_cash_session: {
        Args: {
          _opening_float?: number
          _restaurant_id: string
          _staff_id?: string
        }
        Returns: string
      }
      place_public_fulfillment_order: {
        Args: {
          _delivery_address?: string
          _fulfillment: string
          _guest_email?: string
          _guest_name?: string
          _guest_phone?: string
          _items: Json
          _notes?: string
          _restaurant_slug: string
          _scheduled_for?: string
        }
        Returns: {
          currency: string
          order_id: string
          order_number: string
          public_token: string
          total: number
        }[]
      }
      place_public_order: {
        Args: { _items: Json; _notes?: string; _qr_token: string }
        Returns: {
          currency: string
          order_id: string
          order_number: string
          public_token: string
          total: number
        }[]
      }
      place_public_order_v2: {
        Args: {
          _guest_email?: string
          _guest_name?: string
          _guest_phone?: string
          _items: Json
          _notes?: string
          _qr_token: string
        }
        Returns: {
          currency: string
          order_id: string
          order_number: string
          public_token: string
          total: number
        }[]
      }
      prepare_booking_message: {
        Args: { _body: string; _booking_id: string; _channel: string }
        Returns: Json
      }
      prepare_provider_payment_intent: {
        Args: {
          _amount: number
          _idempotency_key?: string
          _method_hint?: string
          _order_id: string
          _provider: string
          _tip?: number
        }
        Returns: Json
      }
      prepare_provider_refund: {
        Args: { _amount: number; _payment_id: string }
        Returns: Json
      }
      preview_campaign_segment: {
        Args: {
          _channel?: string
          _restaurant_id: string
          _segment_config?: Json
          _segment_type: string
        }
        Returns: Json
      }
      process_crm_automations: { Args: never; Returns: Json }
      public_call_waiter: {
        Args: { _note?: string; _qr_token: string }
        Returns: string
      }
      public_order_receipt: {
        Args: { _public_token: string }
        Returns: {
          created_at: string
          currency: string
          discount_amount: number
          order_number: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          service_amount: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_amount: number
          total: number
        }[]
      }
      public_order_status: {
        Args: { _public_token: string }
        Returns: {
          created_at: string
          currency: string
          order_number: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          status: Database["public"]["Enums"]["order_status"]
          total: number
        }[]
      }
      publish_menu_design_version: {
        Args: { _version_id: string }
        Returns: string
      }
      push_public_key: { Args: never; Returns: string }
      push_worker_config: { Args: never; Returns: Json }
      queue_webhook_event: {
        Args: { _event_type: string; _payload: Json; _restaurant_id: string }
        Returns: number
      }
      reconcile_webhook_deliveries: { Args: never; Returns: number }
      record_booking_deposit_payment: {
        Args: {
          _intent_id: string
          _provider_event_id?: string
          _provider_intent_id: string
          _provider_transaction_id: string
        }
        Returns: undefined
      }
      record_booking_whatsapp_handoff: {
        Args: { _body_length?: number; _booking_id: string }
        Returns: undefined
      }
      record_check_payment: {
        Args: {
          _amount: number
          _cash_session_id?: string
          _check_id: string
          _method: string
          _reference?: string
          _tip?: number
        }
        Returns: string
      }
      record_client_event: {
        Args: {
          _event_type: string
          _message: string
          _metadata?: Json
          _restaurant_id?: string
          _route?: string
          _severity: string
        }
        Returns: undefined
      }
      record_kitchen_print: {
        Args: {
          _order_id: string
          _print_kind?: string
          _printer_id?: string
          _station_id?: string
        }
        Returns: string
      }
      record_order_payment: {
        Args: {
          _amount: number
          _cash_session_id?: string
          _method: string
          _order_id: string
          _reference?: string
          _tip?: number
        }
        Returns: string
      }
      record_performance_sample: {
        Args: {
          _device?: string
          _metric: string
          _restaurant_id?: string
          _route: string
          _value: number
        }
        Returns: undefined
      }
      record_provider_payment: {
        Args: {
          _intent_id: string
          _metadata?: Json
          _method?: string
          _provider_event_id: string
          _provider_intent_id: string
          _provider_transaction_id: string
        }
        Returns: string
      }
      record_provider_refund: {
        Args: {
          _amount: number
          _metadata?: Json
          _payment_id: string
          _provider_event_id?: string
          _provider_refund_id: string
        }
        Returns: string
      }
      refresh_recurring_staff_schedules: {
        Args: { _horizon_days?: number; _restaurant_id: string }
        Returns: Json
      }
      refresh_restaurant_usage: {
        Args: { _restaurant_id: string }
        Returns: undefined
      }
      refresh_upcoming_booking_table_statuses: { Args: never; Returns: number }
      refresh_waitlist_estimate: {
        Args: { _waitlist_id: string }
        Returns: number
      }
      refund_order_payment: {
        Args: {
          _amount: number
          _cash_session_id?: string
          _order_id: string
          _payment_id: string
          _reference?: string
        }
        Returns: string
      }
      register_payment_provider_event: {
        Args: {
          _event_id: string
          _event_type: string
          _payload_digest?: string
          _provider: string
          _provider_intent_id?: string
          _restaurant_id?: string
        }
        Returns: boolean
      }
      register_restaurant_device: {
        Args: {
          _device_type: string
          _kitchen_station_id?: string
          _name: string
          _restaurant_id: string
        }
        Returns: Json
      }
      reopen_manager_daily_close: {
        Args: { _close_id: string; _reason: string }
        Returns: undefined
      }
      resolve_shift_handover: {
        Args: { _handover_id: string; _note?: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by_staff_id: string | null
          cash_note: string | null
          category: string
          created_at: string
          from_staff_id: string | null
          id: string
          inventory_note: string | null
          next_shift_id: string | null
          priority: string
          resolved_at: string | null
          resolved_by_staff_id: string | null
          restaurant_id: string
          shift_id: string | null
          summary: string
          target_role: string | null
          to_staff_id: string | null
          unresolved_items: string | null
        }
        SetofOptions: {
          from: "*"
          to: "shift_handovers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      respond_public_waitlist_offer: {
        Args: { _response: string; _token: string }
        Returns: Json
      }
      restaurant_cleanup_objects: {
        Args: { _restaurant_id: string }
        Returns: {
          bucket_id: string
          name: string
        }[]
      }
      restaurant_cleanup_worker_authorized: {
        Args: { _secret: string }
        Returns: boolean
      }
      restaurant_slug_available: { Args: { _slug: string }; Returns: boolean }
      retry_integration_job: { Args: { _job_id: string }; Returns: undefined }
      review_automatic_clock_out: {
        Args: {
          _clock_out?: string
          _expected_clock_out?: string
          _note?: string
          _request_id: string
          _resolution: string
        }
        Returns: string
      }
      review_leave_request: {
        Args: { _request_id: string; _status: string }
        Returns: undefined
      }
      review_missing_punch_request: {
        Args: { _decision: string; _note?: string; _request_id: string }
        Returns: string
      }
      review_time_entry: {
        Args: {
          _action: string
          _break_minutes?: number
          _clock_in?: string
          _clock_out?: string
          _entry_id: string
          _note?: string
        }
        Returns: undefined
      }
      review_workforce_leave_request: {
        Args: { _note?: string; _request_id: string; _status: string }
        Returns: undefined
      }
      review_workforce_permission_request: {
        Args: { _note?: string; _request_id: string; _status: string }
        Returns: undefined
      }
      revoke_integration_api_key: {
        Args: { _key_id: string }
        Returns: undefined
      }
      revoke_restaurant_device: {
        Args: { _device_id: string }
        Returns: undefined
      }
      rollback_menu_design_version: {
        Args: { _note?: string; _version_id: string }
        Returns: string
      }
      run_due_operational_rules: { Args: never; Returns: number }
      run_operational_rule: { Args: { _rule_id: string }; Returns: string }
      run_operations_sweep: { Args: { _restaurant_id: string }; Returns: Json }
      save_menu_design_draft: {
        Args: { _note?: string; _restaurant_id: string; _snapshot: Json }
        Returns: string
      }
      schedule_crm_campaign: {
        Args: { _campaign_id: string; _scheduled_at: string }
        Returns: number
      }
      schedule_menu_design_version: {
        Args: { _scheduled_for: string; _version_id: string }
        Returns: undefined
      }
      set_table_service_status: {
        Args: { _status: string; _table_id: string }
        Returns: string
      }
      split_order_checks_equal: {
        Args: { _order_id: string; _ways: number }
        Returns: number
      }
      split_service_tables: {
        Args: { _group_id: string; _table_id?: string }
        Returns: number
      }
      submit_leave_request:
        | {
            Args: {
              _end: string
              _reason?: string
              _restaurant_id: string
              _start: string
            }
            Returns: string
          }
        | {
            Args: {
              _end: string
              _end_time: string
              _reason: string
              _restaurant_id: string
              _start: string
              _start_time: string
            }
            Returns: string
          }
      submit_missing_punch_request: {
        Args: {
          _break_minutes?: number
          _clock_in: string
          _clock_out: string
          _reason?: string
          _restaurant_id: string
        }
        Returns: string
      }
      submit_workforce_leave_request: {
        Args: {
          _attachment_mime?: string
          _attachment_name?: string
          _attachment_path?: string
          _end: string
          _family_degree: string
          _leave_type: string
          _reason: string
          _restaurant_id: string
          _start: string
        }
        Returns: string
      }
      submit_workforce_permission_request: {
        Args: {
          _attachment_mime?: string
          _attachment_name?: string
          _attachment_path?: string
          _end_time?: string
          _expected_arrival_time?: string
          _permission_type: string
          _reason?: string
          _request_date: string
          _restaurant_id: string
          _start_time?: string
        }
        Returns: string
      }
      toggle_time_clock: {
        Args: { _restaurant_id: string }
        Returns: {
          action: string
          at: string
          entry_id: string
        }[]
      }
      touch_my_presence: { Args: { _restaurant_id?: string }; Returns: string }
      transfer_order_table: {
        Args: { _order_id: string; _table_id: string }
        Returns: undefined
      }
      transition_booking_status: {
        Args: { _booking_id: string; _next: string; _reason?: string }
        Returns: {
          assigned_staff_id: string | null
          booking_at: string
          cancel_reason: string | null
          cancelled_at: string | null
          completed_at: string | null
          confirmation_code: string
          confirmation_sent_at: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          deposit_amount: number
          deposit_reference: string | null
          deposit_status: string
          duration_minutes: number
          email: string | null
          ends_at: string
          guest_count: number
          guest_id: string | null
          id: string
          no_show_at: string | null
          notes: string | null
          occasion: string | null
          phone: string | null
          public_token: string
          reminder_sent_at: string | null
          restaurant_id: string
          seated_at: string | null
          source: string
          special_requests: string | null
          status: string
          table_id: string | null
          updated_at: string
          zone: string | null
        }
        SetofOptions: {
          from: "*"
          to: "table_bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_booking_waitlist: {
        Args: { _next: string; _reason?: string; _waitlist_id: string }
        Returns: {
          cancellation_reason: string | null
          converted_booking_id: string | null
          created_at: string
          created_by: string | null
          customer_name: string
          desired_date: string
          email: string | null
          estimated_wait_minutes: number | null
          guest_count: number
          id: string
          last_message_at: string | null
          last_message_channel: string | null
          notes: string | null
          notified_at: string | null
          occasion: string | null
          offer_accepted_at: string | null
          offer_booking_at: string | null
          offer_count: number
          offer_declined_at: string | null
          offer_expires_at: string | null
          offer_sent_at: string | null
          offer_table_id: string | null
          phone: string | null
          preferred_time: string | null
          public_token: string
          restaurant_id: string
          source: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_waitlist"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_order_status: {
        Args: {
          _next: Database["public"]["Enums"]["order_status"]
          _note?: string
          _order_id: string
        }
        Returns: {
          accepted_at: string | null
          assigned_at: string | null
          assigned_staff_id: string | null
          cancellation_note: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          currency: string
          customer_notes: string | null
          delivery_address: string | null
          delivery_amount: number
          delivery_provider: string | null
          delivery_provider_reference: string | null
          delivery_status: string | null
          delivery_status_updated_at: string | null
          discount_amount: number
          fulfillment_type: string
          guest_email: string | null
          guest_id: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          order_number: string
          paid_at: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          preparing_at: string | null
          public_token: string
          ready_at: string | null
          restaurant_id: string
          scheduled_for: string | null
          served_at: string | null
          service_amount: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          table_visit_closed_at: string | null
          tax_amount: number
          tip_amount: number
          total: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unseen_order_count: { Args: { _restaurant_id: string }; Returns: number }
      update_booking_deposit_intent_status: {
        Args: {
          _intent_id: string
          _last_error?: string
          _provider_intent_id: string
          _status: string
        }
        Returns: undefined
      }
      update_own_avatar: {
        Args: { _avatar_preset?: string; _avatar_url?: string }
        Returns: undefined
      }
      update_own_cover: {
        Args: {
          _cover_image_url?: string
          _position_x?: number
          _position_y?: number
          _staff_id: string
          _zoom?: number
        }
        Returns: undefined
      }
      update_own_display_name: {
        Args: { _name: string; _staff_id: string }
        Returns: string
      }
      update_own_shift_assignment_status: {
        Args: { _assignment_id: string; _status: string }
        Returns: undefined
      }
      update_provider_intent_status: {
        Args: {
          _intent_id: string
          _last_error?: string
          _provider_intent_id: string
          _status: string
        }
        Returns: undefined
      }
      verify_booking_message_worker_secret: {
        Args: { _secret: string }
        Returns: boolean
      }
      verify_booking_worker_secret: {
        Args: { _secret: string }
        Returns: boolean
      }
      verify_campaign_worker_secret: {
        Args: { _secret: string }
        Returns: boolean
      }
      verify_integration_worker_secret: {
        Args: { _secret: string }
        Returns: boolean
      }
      verify_waitlist_worker_secret: {
        Args: { _secret: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "restaurant_admin"
        | "manager"
        | "kitchen"
        | "waiter"
        | "cashier"
        | "operations_manager"
        | "host"
        | "inventory"
        | "procurement"
        | "accountant"
        | "hr"
      order_status:
        | "new"
        | "accepted"
        | "preparing"
        | "ready"
        | "served"
        | "paid"
        | "cancelled"
      payment_status: "unpaid" | "paid" | "refunded"
      subscription_plan: "free" | "basic" | "professional" | "enterprise"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "cancelled"
        | "suspended"
      waiter_call_status: "pending" | "acknowledged" | "resolved"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: [
        "super_admin",
        "restaurant_admin",
        "manager",
        "kitchen",
        "waiter",
        "cashier",
        "operations_manager",
        "host",
        "inventory",
        "procurement",
        "accountant",
        "hr",
      ],
      order_status: [
        "new",
        "accepted",
        "preparing",
        "ready",
        "served",
        "paid",
        "cancelled",
      ],
      payment_status: ["unpaid", "paid", "refunded"],
      subscription_plan: ["free", "basic", "professional", "enterprise"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "cancelled",
        "suspended",
      ],
      waiter_call_status: ["pending", "acknowledged", "resolved"],
    },
  },
} as const
