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
          created_at: string
          email: string | null
          id: string
          last_visit_at: string | null
          lifetime_spend: number
          marketing_opt_in: boolean
          name: string | null
          phone: string | null
          restaurant_id: string
          updated_at: string
          visits: number
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          last_visit_at?: string | null
          lifetime_spend?: number
          marketing_opt_in?: boolean
          name?: string | null
          phone?: string | null
          restaurant_id: string
          updated_at?: string
          visits?: number
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          last_visit_at?: string | null
          lifetime_spend?: number
          marketing_opt_in?: boolean
          name?: string | null
          phone?: string | null
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
      erp_order_consumptions: {
        Row: {
          consumed_at: string
          order_id: string
          restaurant_id: string
        }
        Insert: {
          consumed_at?: string
          order_id: string
          restaurant_id: string
        }
        Update: {
          consumed_at?: string
          order_id?: string
          restaurant_id?: string
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
          created_by: string
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
          created_by?: string
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
          created_by?: string
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
          name_ar: string
          name_en: string
          preparation_time: number
          price: number
          restaurant_id: string
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
          name_ar: string
          name_en: string
          preparation_time?: number
          price?: number
          restaurant_id: string
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
          name_ar?: string
          name_en?: string
          preparation_time?: number
          price?: number
          restaurant_id?: string
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
          created_at: string
          currency: string
          customer_notes: string | null
          delivery_address: string | null
          discount_amount: number
          fulfillment_type: string
          guest_email: string | null
          guest_id: string | null
          guest_name: string | null
          guest_phone: string | null
          id: string
          order_number: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          public_token: string
          restaurant_id: string
          scheduled_for: string | null
          service_amount: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          tax_amount: number
          tip_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_notes?: string | null
          delivery_address?: string | null
          discount_amount?: number
          fulfillment_type?: string
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          order_number: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          public_token?: string
          restaurant_id: string
          scheduled_for?: string | null
          service_amount?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          tax_amount?: number
          tip_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_notes?: string | null
          delivery_address?: string | null
          discount_amount?: number
          fulfillment_type?: string
          guest_email?: string | null
          guest_id?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          id?: string
          order_number?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          public_token?: string
          restaurant_id?: string
          scheduled_for?: string | null
          service_amount?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          tax_amount?: number
          tip_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
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
      payment_transactions: {
        Row: {
          amount: number
          cash_session_id: string | null
          created_at: string
          created_by: string
          id: string
          metadata: Json
          method: string
          order_id: string
          reference: string
          restaurant_id: string
          status: string
          tip_amount: number
          transaction_type: string
        }
        Insert: {
          amount: number
          cash_session_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          metadata?: Json
          method: string
          order_id: string
          reference?: string
          restaurant_id: string
          status?: string
          tip_amount?: number
          transaction_type?: string
        }
        Update: {
          amount?: number
          cash_session_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          metadata?: Json
          method?: string
          order_id?: string
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
            foreignKeyName: "payment_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
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
      staff_leave_requests: {
        Row: {
          created_at: string
          end_date: string
          id: string
          reason: string
          restaurant_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          start_date: string
          status: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          reason?: string
          restaurant_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          start_date: string
          status?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          reason?: string
          restaurant_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          start_date?: string
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
      staff_time_entries: {
        Row: {
          approved_by: string | null
          break_minutes: number
          clock_in: string
          clock_out: string | null
          created_at: string
          id: string
          notes: string
          restaurant_id: string
          staff_id: string
        }
        Insert: {
          approved_by?: string | null
          break_minutes?: number
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          notes?: string
          restaurant_id: string
          staff_id: string
        }
        Update: {
          approved_by?: string | null
          break_minutes?: number
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          notes?: string
          restaurant_id?: string
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
            foreignKeyName: "staff_time_entries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
          booking_at: string
          created_at: string
          created_by: string | null
          customer_name: string
          guest_count: number
          id: string
          notes: string | null
          phone: string | null
          restaurant_id: string
          status: string
          table_id: string | null
          updated_at: string
          zone: string | null
        }
        Insert: {
          booking_at: string
          created_at?: string
          created_by?: string | null
          customer_name: string
          guest_count?: number
          id?: string
          notes?: string | null
          phone?: string | null
          restaurant_id: string
          status?: string
          table_id?: string | null
          updated_at?: string
          zone?: string | null
        }
        Update: {
          booking_at?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          guest_count?: number
          id?: string
          notes?: string | null
          phone?: string | null
          restaurant_id?: string
          status?: string
          table_id?: string | null
          updated_at?: string
          zone?: string | null
        }
        Relationships: [
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
      archive_shift: { Args: { _shift_id: string }; Returns: undefined }
      archive_work_task: { Args: { _task_id: string }; Returns: undefined }
      claim_platform_ownership: { Args: { _name?: string }; Returns: boolean }
      close_cash_session: {
        Args: { _closing_cash: number; _notes?: string; _session_id: string }
        Returns: undefined
      }
      create_restaurant_with_setup: {
        Args: { _payload: Json; _table_count?: number }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
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
      mark_order_viewed: { Args: { _order_id: string }; Returns: undefined }
      open_cash_session: {
        Args: { _opening_float?: number; _staff_id?: string }
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
      refresh_restaurant_usage: {
        Args: { _restaurant_id: string }
        Returns: undefined
      }
      refund_order_payment: {
        Args: {
          _amount: number
          _method?: string
          _order_id: string
          _reference?: string
        }
        Returns: string
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
      restaurant_slug_available: { Args: { _slug: string }; Returns: boolean }
      review_leave_request: {
        Args: { _request_id: string; _status: string }
        Returns: undefined
      }
      run_due_operational_rules: { Args: never; Returns: number }
      run_operational_rule: { Args: { _rule_id: string }; Returns: string }
      run_operations_sweep: { Args: { _restaurant_id: string }; Returns: Json }
      set_table_service_status: {
        Args: { _status: string; _table_id: string }
        Returns: string
      }
      submit_leave_request: {
        Args: {
          _end: string
          _reason?: string
          _restaurant_id: string
          _start: string
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
      unseen_order_count: { Args: { _restaurant_id: string }; Returns: number }
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
