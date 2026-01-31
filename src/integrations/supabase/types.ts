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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          alert_type: string | null
          created_at: string
          id: string
          message: string
          position_id: string | null
          resolved: boolean
          rule_id: string | null
          severity: string | null
          user_id: string
        }
        Insert: {
          alert_type?: string | null
          created_at?: string
          id?: string
          message: string
          position_id?: string | null
          resolved?: boolean
          rule_id?: string | null
          severity?: string | null
          user_id: string
        }
        Update: {
          alert_type?: string | null
          created_at?: string
          id?: string
          message?: string
          position_id?: string | null
          resolved?: boolean
          rule_id?: string | null
          severity?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "philosophy_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_history: {
        Row: {
          allocation_check: Json | null
          created_at: string
          health_score: number | null
          id: string
          key_risks: string[] | null
          market_signals: Json | null
          position_alerts: Json | null
          raw_response: Json | null
          recommended_actions: Json | null
          summary: string | null
          thesis_checks: Json | null
          user_id: string
        }
        Insert: {
          allocation_check?: Json | null
          created_at?: string
          health_score?: number | null
          id?: string
          key_risks?: string[] | null
          market_signals?: Json | null
          position_alerts?: Json | null
          raw_response?: Json | null
          recommended_actions?: Json | null
          summary?: string | null
          thesis_checks?: Json | null
          user_id: string
        }
        Update: {
          allocation_check?: Json | null
          created_at?: string
          health_score?: number | null
          id?: string
          key_risks?: string[] | null
          market_signals?: Json | null
          position_alerts?: Json | null
          raw_response?: Json | null
          recommended_actions?: Json | null
          summary?: string | null
          thesis_checks?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      decision_log: {
        Row: {
          action_type: string | null
          confidence_level: number | null
          created_at: string
          id: string
          information_set: string | null
          invalidation_triggers: string | null
          outcome_notes: string | null
          position_id: string | null
          probability_estimate: string | null
          reasoning: string | null
          user_id: string
        }
        Insert: {
          action_type?: string | null
          confidence_level?: number | null
          created_at?: string
          id?: string
          information_set?: string | null
          invalidation_triggers?: string | null
          outcome_notes?: string | null
          position_id?: string | null
          probability_estimate?: string | null
          reasoning?: string | null
          user_id: string
        }
        Update: {
          action_type?: string | null
          confidence_level?: number | null
          created_at?: string
          id?: string
          information_set?: string | null
          invalidation_triggers?: string | null
          outcome_notes?: string | null
          position_id?: string | null
          probability_estimate?: string | null
          reasoning?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decision_log_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          confidence_words: string[] | null
          content: string | null
          created_at: string
          id: string
          insight_type: string | null
          is_starred: boolean
          newsletter_id: string
          sentiment: string | null
          tickers_mentioned: string[] | null
        }
        Insert: {
          confidence_words?: string[] | null
          content?: string | null
          created_at?: string
          id?: string
          insight_type?: string | null
          is_starred?: boolean
          newsletter_id: string
          sentiment?: string | null
          tickers_mentioned?: string[] | null
        }
        Update: {
          confidence_words?: string[] | null
          content?: string | null
          created_at?: string
          id?: string
          insight_type?: string | null
          is_starred?: boolean
          newsletter_id?: string
          sentiment?: string | null
          tickers_mentioned?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "insights_newsletter_id_fkey"
            columns: ["newsletter_id"]
            isOneToOne: false
            referencedRelation: "newsletters"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletters: {
        Row: {
          created_at: string
          file_path: string | null
          id: string
          processed: boolean
          raw_text: string | null
          source_name: string
          upload_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_path?: string | null
          id?: string
          processed?: boolean
          raw_text?: string | null
          source_name: string
          upload_date?: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_path?: string | null
          id?: string
          processed?: boolean
          raw_text?: string | null
          source_name?: string
          upload_date?: string
          user_id?: string
        }
        Relationships: []
      }
      philosophy_rules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          rule_type: string | null
          source_books: string[] | null
          threshold_max: number | null
          threshold_min: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          rule_type?: string | null
          source_books?: string[] | null
          threshold_max?: number | null
          threshold_min?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          rule_type?: string | null
          source_books?: string[] | null
          threshold_max?: number | null
          threshold_min?: number | null
          user_id?: string
        }
        Relationships: []
      }
      portfolio_snapshots: {
        Row: {
          cash_balance: number | null
          created_at: string
          data_json: Json | null
          etfs_percent: number | null
          id: string
          snapshot_date: string
          stocks_percent: number | null
          total_value: number | null
          user_id: string
        }
        Insert: {
          cash_balance?: number | null
          created_at?: string
          data_json?: Json | null
          etfs_percent?: number | null
          id?: string
          snapshot_date?: string
          stocks_percent?: number | null
          total_value?: number | null
          user_id: string
        }
        Update: {
          cash_balance?: number | null
          created_at?: string
          data_json?: Json | null
          etfs_percent?: number | null
          id?: string
          snapshot_date?: string
          stocks_percent?: number | null
          total_value?: number | null
          user_id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          avg_cost: number | null
          bet_type: string | null
          category: string | null
          confidence_level: number | null
          created_at: string
          current_price: number | null
          id: string
          last_review_date: string | null
          market_value: number | null
          name: string | null
          position_type: string | null
          shares: number | null
          thesis_notes: string | null
          ticker: string
          updated_at: string
          user_id: string
          weight_percent: number | null
        }
        Insert: {
          avg_cost?: number | null
          bet_type?: string | null
          category?: string | null
          confidence_level?: number | null
          created_at?: string
          current_price?: number | null
          id?: string
          last_review_date?: string | null
          market_value?: number | null
          name?: string | null
          position_type?: string | null
          shares?: number | null
          thesis_notes?: string | null
          ticker: string
          updated_at?: string
          user_id: string
          weight_percent?: number | null
        }
        Update: {
          avg_cost?: number | null
          bet_type?: string | null
          category?: string | null
          confidence_level?: number | null
          created_at?: string
          current_price?: number | null
          id?: string
          last_review_date?: string | null
          market_value?: number | null
          name?: string | null
          position_type?: string | null
          shares?: number | null
          thesis_notes?: string | null
          ticker?: string
          updated_at?: string
          user_id?: string
          weight_percent?: number | null
        }
        Relationships: []
      }
      reports: {
        Row: {
          content: string
          created_at: string
          id: string
          performance_percent: number | null
          portfolio_value_end: number | null
          portfolio_value_start: number | null
          report_month: string
          summary: string | null
          title: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          performance_percent?: number | null
          portfolio_value_end?: number | null
          portfolio_value_start?: number | null
          report_month: string
          summary?: string | null
          title: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          performance_percent?: number | null
          portfolio_value_end?: number | null
          portfolio_value_start?: number | null
          report_month?: string
          summary?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      verification_cache: {
        Row: {
          ticker: string
          verified_at: string
          verified_data: Json
        }
        Insert: {
          ticker: string
          verified_at?: string
          verified_data: Json
        }
        Update: {
          ticker?: string
          verified_at?: string
          verified_data?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
