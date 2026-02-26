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
      behavioral_signals: {
        Row: {
          action: string | null
          aligned: boolean | null
          created_at: string | null
          id: string
          market_event_id: string | null
          notes: string | null
          profile_at_time: string | null
          signal_date: string | null
          symbol: string | null
          trade_id: string | null
          user_id: string
        }
        Insert: {
          action?: string | null
          aligned?: boolean | null
          created_at?: string | null
          id?: string
          market_event_id?: string | null
          notes?: string | null
          profile_at_time?: string | null
          signal_date?: string | null
          symbol?: string | null
          trade_id?: string | null
          user_id: string
        }
        Update: {
          action?: string | null
          aligned?: boolean | null
          created_at?: string | null
          id?: string
          market_event_id?: string | null
          notes?: string | null
          profile_at_time?: string | null
          signal_date?: string | null
          symbol?: string | null
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "behavioral_signals_market_event_id_fkey"
            columns: ["market_event_id"]
            isOneToOne: false
            referencedRelation: "market_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "behavioral_signals_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "ib_trades"
            referencedColumns: ["id"]
          },
        ]
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
      etf_metadata: {
        Row: {
          asset_class_details: string | null
          category: string | null
          classified_at: string
          expense_ratio: number | null
          full_name: string | null
          geography: string | null
          is_broad_market: boolean | null
          issuer: string | null
          sub_category: string | null
          ticker: string
          tracks: string | null
        }
        Insert: {
          asset_class_details?: string | null
          category?: string | null
          classified_at?: string
          expense_ratio?: number | null
          full_name?: string | null
          geography?: string | null
          is_broad_market?: boolean | null
          issuer?: string | null
          sub_category?: string | null
          ticker: string
          tracks?: string | null
        }
        Update: {
          asset_class_details?: string | null
          category?: string | null
          classified_at?: string
          expense_ratio?: number | null
          full_name?: string | null
          geography?: string | null
          is_broad_market?: boolean | null
          issuer?: string | null
          sub_category?: string | null
          ticker?: string
          tracks?: string | null
        }
        Relationships: []
      }
      ib_accounts: {
        Row: {
          created_at: string | null
          flex_query_id: string
          flex_token: string
          ib_account_id: string
          id: string
          last_synced_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          flex_query_id: string
          flex_token: string
          ib_account_id: string
          id?: string
          last_synced_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          flex_query_id?: string
          flex_token?: string
          ib_account_id?: string
          id?: string
          last_synced_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ib_cash_transactions: {
        Row: {
          amount: number | null
          asset_class: string | null
          created_at: string | null
          currency: string | null
          date_time: string | null
          description: string | null
          ib_account_id: string
          id: string
          report_date: string | null
          settle_date: string | null
          symbol: string | null
          transaction_id: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          amount?: number | null
          asset_class?: string | null
          created_at?: string | null
          currency?: string | null
          date_time?: string | null
          description?: string | null
          ib_account_id: string
          id?: string
          report_date?: string | null
          settle_date?: string | null
          symbol?: string | null
          transaction_id?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          amount?: number | null
          asset_class?: string | null
          created_at?: string | null
          currency?: string | null
          date_time?: string | null
          description?: string | null
          ib_account_id?: string
          id?: string
          report_date?: string | null
          settle_date?: string | null
          symbol?: string | null
          transaction_id?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ib_positions: {
        Row: {
          asset_class: string | null
          cost_basis_money: number | null
          cost_basis_price: number | null
          created_at: string | null
          description: string | null
          ib_account_id: string
          id: string
          mark_price: number | null
          open_date_time: string | null
          percent_of_nav: number | null
          position_value: number | null
          quantity: number | null
          report_date: string | null
          side: string | null
          sub_category: string | null
          symbol: string | null
          synced_at: string | null
          unrealized_pnl: number | null
          user_id: string
        }
        Insert: {
          asset_class?: string | null
          cost_basis_money?: number | null
          cost_basis_price?: number | null
          created_at?: string | null
          description?: string | null
          ib_account_id: string
          id?: string
          mark_price?: number | null
          open_date_time?: string | null
          percent_of_nav?: number | null
          position_value?: number | null
          quantity?: number | null
          report_date?: string | null
          side?: string | null
          sub_category?: string | null
          symbol?: string | null
          synced_at?: string | null
          unrealized_pnl?: number | null
          user_id: string
        }
        Update: {
          asset_class?: string | null
          cost_basis_money?: number | null
          cost_basis_price?: number | null
          created_at?: string | null
          description?: string | null
          ib_account_id?: string
          id?: string
          mark_price?: number | null
          open_date_time?: string | null
          percent_of_nav?: number | null
          position_value?: number | null
          quantity?: number | null
          report_date?: string | null
          side?: string | null
          sub_category?: string | null
          symbol?: string | null
          synced_at?: string | null
          unrealized_pnl?: number | null
          user_id?: string
        }
        Relationships: []
      }
      ib_trades: {
        Row: {
          asset_class: string | null
          buy_sell: string | null
          cost_basis: number | null
          created_at: string | null
          date_time: string | null
          description: string | null
          exchange: string | null
          ib_account_id: string
          ib_commission: number | null
          id: string
          level_of_detail: string | null
          net_cash: number | null
          notes: string | null
          open_close: string | null
          order_type: string | null
          proceeds: number | null
          quantity: number | null
          raw_xml: Json | null
          realized_pnl: number | null
          report_date: string | null
          settle_date: string | null
          sub_category: string | null
          symbol: string | null
          trade_date: string | null
          trade_id: string | null
          trade_money: number | null
          trade_price: number | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          asset_class?: string | null
          buy_sell?: string | null
          cost_basis?: number | null
          created_at?: string | null
          date_time?: string | null
          description?: string | null
          exchange?: string | null
          ib_account_id: string
          ib_commission?: number | null
          id?: string
          level_of_detail?: string | null
          net_cash?: number | null
          notes?: string | null
          open_close?: string | null
          order_type?: string | null
          proceeds?: number | null
          quantity?: number | null
          raw_xml?: Json | null
          realized_pnl?: number | null
          report_date?: string | null
          settle_date?: string | null
          sub_category?: string | null
          symbol?: string | null
          trade_date?: string | null
          trade_id?: string | null
          trade_money?: number | null
          trade_price?: number | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          asset_class?: string | null
          buy_sell?: string | null
          cost_basis?: number | null
          created_at?: string | null
          date_time?: string | null
          description?: string | null
          exchange?: string | null
          ib_account_id?: string
          ib_commission?: number | null
          id?: string
          level_of_detail?: string | null
          net_cash?: number | null
          notes?: string | null
          open_close?: string | null
          order_type?: string | null
          proceeds?: number | null
          quantity?: number | null
          raw_xml?: Json | null
          realized_pnl?: number | null
          report_date?: string | null
          settle_date?: string | null
          sub_category?: string | null
          symbol?: string | null
          trade_date?: string | null
          trade_id?: string | null
          trade_money?: number | null
          trade_price?: number | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      insights: {
        Row: {
          confidence_words: string[] | null
          content: string | null
          created_at: string
          id: string
          insight_type: string | null
          is_starred: boolean
          is_summarized: boolean
          newsletter_id: string
          sentiment: string | null
          summarized_from_ids: string[] | null
          tickers_mentioned: string[] | null
        }
        Insert: {
          confidence_words?: string[] | null
          content?: string | null
          created_at?: string
          id?: string
          insight_type?: string | null
          is_starred?: boolean
          is_summarized?: boolean
          newsletter_id: string
          sentiment?: string | null
          summarized_from_ids?: string[] | null
          tickers_mentioned?: string[] | null
        }
        Update: {
          confidence_words?: string[] | null
          content?: string | null
          created_at?: string
          id?: string
          insight_type?: string | null
          is_starred?: boolean
          is_summarized?: boolean
          newsletter_id?: string
          sentiment?: string | null
          summarized_from_ids?: string[] | null
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
      intelligence_briefs: {
        Row: {
          action_items: Json | null
          contrarian_signals: string[] | null
          created_at: string
          executive_summary: string | null
          generated_at: string
          id: string
          insights_analyzed: number | null
          key_points: Json | null
          market_themes: Json | null
          newsletters_analyzed: number | null
          user_id: string
        }
        Insert: {
          action_items?: Json | null
          contrarian_signals?: string[] | null
          created_at?: string
          executive_summary?: string | null
          generated_at?: string
          id?: string
          insights_analyzed?: number | null
          key_points?: Json | null
          market_themes?: Json | null
          newsletters_analyzed?: number | null
          user_id: string
        }
        Update: {
          action_items?: Json | null
          contrarian_signals?: string[] | null
          created_at?: string
          executive_summary?: string | null
          generated_at?: string
          id?: string
          insights_analyzed?: number | null
          key_points?: Json | null
          market_themes?: Json | null
          newsletters_analyzed?: number | null
          user_id?: string
        }
        Relationships: []
      }
      market_events: {
        Row: {
          created_at: string | null
          description: string | null
          event_date: string
          event_type: string | null
          id: string
          index_move_pct: number | null
          severity: number | null
          source: string | null
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_date: string
          event_type?: string | null
          id?: string
          index_move_pct?: number | null
          severity?: number | null
          source?: string | null
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_date?: string
          event_type?: string | null
          id?: string
          index_move_pct?: number | null
          severity?: number | null
          source?: string | null
          title?: string
        }
        Relationships: []
      }
      newsletters: {
        Row: {
          created_at: string
          file_path: string | null
          id: string
          is_archived: boolean
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
          is_archived?: boolean
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
          is_archived?: boolean
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
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          message_on_breach: string
          metric: string
          name: string
          operator: string
          rule_enforcement: string
          rule_type: string | null
          scope: string
          scoring_weight: number | null
          source_books: string[] | null
          tags: string[]
          threshold_max: number | null
          threshold_min: number | null
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          message_on_breach?: string
          metric?: string
          name: string
          operator?: string
          rule_enforcement?: string
          rule_type?: string | null
          scope?: string
          scoring_weight?: number | null
          source_books?: string[] | null
          tags?: string[]
          threshold_max?: number | null
          threshold_min?: number | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          message_on_breach?: string
          metric?: string
          name?: string
          operator?: string
          rule_enforcement?: string
          rule_type?: string | null
          scope?: string
          scoring_weight?: number | null
          source_books?: string[] | null
          tags?: string[]
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
          currency: string | null
          current_price: number | null
          exchange: string | null
          fundamentals: Json | null
          id: string
          last_fundamentals_refresh: string | null
          last_review_date: string | null
          manually_classified: boolean | null
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
          currency?: string | null
          current_price?: number | null
          exchange?: string | null
          fundamentals?: Json | null
          id?: string
          last_fundamentals_refresh?: string | null
          last_review_date?: string | null
          manually_classified?: boolean | null
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
          currency?: string | null
          current_price?: number | null
          exchange?: string | null
          fundamentals?: Json | null
          id?: string
          last_fundamentals_refresh?: string | null
          last_review_date?: string | null
          manually_classified?: boolean | null
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
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          request_count?: number
          user_id: string
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          request_count?: number
          user_id?: string
          window_start?: string
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
      risk_profiles: {
        Row: {
          applied_at: string | null
          created_at: string | null
          dimension_scores: Json | null
          id: string
          is_active: boolean | null
          profile: string
          score: number | null
          source: string | null
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string | null
          dimension_scores?: Json | null
          id?: string
          is_active?: boolean | null
          profile: string
          score?: number | null
          source?: string | null
          user_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string | null
          dimension_scores?: Json | null
          id?: string
          is_active?: boolean | null
          profile?: string
          score?: number | null
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          anthropic_api_key: string | null
          created_at: string
          id: string
          portfolio_mode: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anthropic_api_key?: string | null
          created_at?: string
          id?: string
          portfolio_mode?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anthropic_api_key?: string | null
          created_at?: string
          id?: string
          portfolio_mode?: string
          updated_at?: string
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
      watchlist: {
        Row: {
          category: string | null
          created_at: string
          currency: string | null
          current_price: number | null
          exchange: string | null
          id: string
          intended_size_percent: number | null
          invalidation_price: number | null
          last_price_refresh: string | null
          name: string | null
          notes: string | null
          position_type: string | null
          source: string | null
          target_price: number
          thesis: string | null
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          currency?: string | null
          current_price?: number | null
          exchange?: string | null
          id?: string
          intended_size_percent?: number | null
          invalidation_price?: number | null
          last_price_refresh?: string | null
          name?: string | null
          notes?: string | null
          position_type?: string | null
          source?: string | null
          target_price: number
          thesis?: string | null
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          created_at?: string
          currency?: string | null
          current_price?: number | null
          exchange?: string | null
          id?: string
          intended_size_percent?: number | null
          invalidation_price?: number | null
          last_price_refresh?: string | null
          name?: string | null
          notes?: string | null
          position_type?: string | null
          source?: string | null
          target_price?: number
          thesis?: string | null
          ticker?: string
          updated_at?: string
          user_id?: string
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
