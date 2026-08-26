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
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_notes: string | null
          discount_amount: number
          id: string
          order_number: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          public_token: string
          restaurant_id: string
          service_amount: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          table_id: string | null
          tax_amount: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_notes?: string | null
          discount_amount?: number
          id?: string
          order_number: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          public_token?: string
          restaurant_id: string
          service_amount?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          customer_notes?: string | null
          discount_amount?: number
          id?: string
          order_number?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          public_token?: string
          restaurant_id?: string
          service_amount?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          table_id?: string | null
          tax_amount?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
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
      restaurant_settings: {
        Row: {
          allow_special_notes: boolean
          created_at: string
          enable_cashier: boolean
          enable_kitchen_display: boolean
          enable_orders: boolean
          enable_reviews: boolean
          enable_service_charge: boolean
          enable_tips: boolean
          enable_waiter_calls: boolean
          estimated_preparation_time: number
          id: string
          minimum_order: number
          order_auto_accept: boolean
          restaurant_id: string
          show_prices: boolean
          sound_notifications: boolean
          updated_at: string
        }
        Insert: {
          allow_special_notes?: boolean
          created_at?: string
          enable_cashier?: boolean
          enable_kitchen_display?: boolean
          enable_orders?: boolean
          enable_reviews?: boolean
          enable_service_charge?: boolean
          enable_tips?: boolean
          enable_waiter_calls?: boolean
          estimated_preparation_time?: number
          id?: string
          minimum_order?: number
          order_auto_accept?: boolean
          restaurant_id: string
          show_prices?: boolean
          sound_notifications?: boolean
          updated_at?: string
        }
        Update: {
          allow_special_notes?: boolean
          created_at?: string
          enable_cashier?: boolean
          enable_kitchen_display?: boolean
          enable_orders?: boolean
          enable_reviews?: boolean
          enable_service_charge?: boolean
          enable_tips?: boolean
          enable_waiter_calls?: boolean
          estimated_preparation_time?: number
          id?: string
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
          created_at: string
          id: string
          is_active: boolean
          qr_code_url: string | null
          qr_token: string
          restaurant_id: string
          table_name: string | null
          table_number: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          qr_code_url?: string | null
          qr_token?: string
          restaurant_id: string
          table_name?: string | null
          table_number: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          qr_code_url?: string | null
          qr_token?: string
          restaurant_id?: string
          table_name?: string | null
          table_number?: string
          updated_at?: string
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
          id: string
          is_active: boolean
          latitude: number | null
          layout_style: string
          logo_url: string | null
          longitude: number | null
          menu_style: string
          name: string
          phone: string | null
          primary_color: string
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
          id?: string
          is_active?: boolean
          latitude?: number | null
          layout_style?: string
          logo_url?: string | null
          longitude?: number | null
          menu_style?: string
          name: string
          phone?: string | null
          primary_color?: string
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
          id?: string
          is_active?: boolean
          latitude?: number | null
          layout_style?: string
          logo_url?: string | null
          longitude?: number | null
          menu_style?: string
          name?: string
          phone?: string | null
          primary_color?: string
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
      staff: {
        Row: {
          auth_user_id: string
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          restaurant_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          auth_user_id: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          restaurant_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          auth_user_id?: string
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_platform_ownership: { Args: { _name?: string }; Returns: boolean }
      create_restaurant_with_setup: {
        Args: { _payload: Json; _table_count?: number }
        Returns: {
          id: string
          name: string
          slug: string
        }[]
      }
      is_platform_owner: { Args: never; Returns: boolean }
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
      public_call_waiter: {
        Args: { _note?: string; _qr_token: string }
        Returns: boolean
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
      restaurant_slug_available: { Args: { _slug: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "restaurant_admin"
        | "manager"
        | "kitchen"
        | "waiter"
        | "cashier"
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
      app_role: [
        "super_admin",
        "restaurant_admin",
        "manager",
        "kitchen",
        "waiter",
        "cashier",
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
