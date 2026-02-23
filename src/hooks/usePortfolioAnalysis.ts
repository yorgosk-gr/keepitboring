import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BondRecommendations } from "@/components/analysis/BondRecommendationsCard";
import type { StockPick } from "@/components/analysis/StockPicksCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePositions } from "./usePositions";
import { usePhilosophyRules } from "./usePhilosophyRules";
import { useDecisionLogs } from "./useDecisionLogs";
import { useAllETFMetadata } from "./useAllETFMetadata";
import { useSettings } from "./useSettings";
import { selectSmartInsights } from "./useSmartInsightSelection";
import { toast } from "sonner";

export interface AllocationBreakdownItem {
  label?: string;
  region?: string;
  style?: string;
  percent: number;
  positions: string[];
  recommendation?: string;
}

export interface AllocationCheck {
  equities_percent: number;
  equities_status: "ok" | "warning" | "critical";
  bonds_percent: number;
  bonds_status: "ok" | "warning" | "critical";
  commodities_percent: number;
  commodities_status: "ok" | "warning" | "critical";
  commodities_breakdown?: AllocationBreakdownItem[];
  cash_percent: number;
  stocks_vs_etf_split: string;
  equity_by_geography?: AllocationBreakdownItem[];
  equity_by_style?: AllocationBreakdownItem[];
  issues: string[];
}

export interface PositionAlert {
  ticker: string;
  alert_type: "size" | "quality" | "thesis" | "sentiment";
  severity: "warning" | "critical";
  issue: string;
  recent_sentiment: string;
  recommendation: string;
}

export interface ThesisCheck {
  ticker: string;
  has_thesis: boolean;
  has_invalidation: boolean;
  bet_type_declared: boolean;
  confidence_set: boolean;
  days_since_review: number;
}

export interface MarketSignals {
  bubble_warnings: string[];
  consensus_level: "mixed" | "bullish_consensus" | "bearish_consensus";
  overall_sentiment: string;
  portfolio_exposure?: string;
}

export interface RecommendedAction {
  priority: number;
  action: string;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  trades_involved?: string[];
  completed?: boolean;
  dismissed?: boolean;
  dismiss_reason?: string;
}

export interface TradeRecommendation {
  ticker: string;
  action: "SELL" | "HOLD" | "BUY";
  current_shares: number;
  recommended_shares: number;
  shares_to_trade: number;
  estimated_value: number;
  current_weight: number;
  target_weight: number;
  reasoning: string;
  urgency: "low" | "medium" | "high";
  thesis_aligned: boolean | null;
}

export interface RebalancingSummary {
  total_sells: string;
  total_buys: string;
  net_cash_impact: string;
  primary_goal: string;
}

export interface AnalysisMeta {
  insightsCount: number;
  newslettersCount: number;
  portfolioMentions: number;
  bubbleSignals: number;
  macroViews: number;
  oldestDate: string | null;
  newestDate: string | null;
}

export interface AnalysisResult {
  id?: string;
  created_at?: string;
  allocation_check: AllocationCheck;
  position_alerts: PositionAlert[];
  thesis_checks: ThesisCheck[];
  market_signals: MarketSignals;
  recommended_actions: RecommendedAction[];
  trade_recommendations: TradeRecommendation[];
  rebalancing_summary: RebalancingSummary;
  bond_recommendations?: BondRecommendations;
  stock_picks?: StockPick[];
  portfolio_health_score: number;
  key_risks: string[];
  summary: string;
  analysis_meta?: AnalysisMeta;
}

export interface AnalysisHistory {
  id: string;
  user_id: string;
  created_at: string;
  health_score: number | null;
  allocation_check: AllocationCheck | null;
  position_alerts: PositionAlert[] | null;
  thesis_checks: ThesisCheck[] | null;
  market_signals: MarketSignals | null;
  recommended_actions: RecommendedAction[] | null;
  key_risks: string[] | null;
  summary: string | null;
  raw_response: any | null;
}

export function usePortfolioAnalysis() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { positions } = usePositions();
  const { rules } = usePhilosophyRules();
  const { decisions } = useDecisionLogs();
  const { data: etfMetadata = {} } = useAllETFMetadata();
  const { settings } = useSettings();
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);

  // Fetch analysis history
  const historyQuery = useQuery({
    queryKey: ["analysis_history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analysis_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data ?? []).map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        created_at: item.created_at,
        health_score: item.health_score,
        allocation_check: item.allocation_check as AllocationCheck | null,
        position_alerts: item.position_alerts as PositionAlert[] | null,
        thesis_checks: item.thesis_checks as ThesisCheck[] | null,
        market_signals: item.market_signals as MarketSignals | null,
        recommended_actions: item.recommended_actions as RecommendedAction[] | null,
        key_risks: item.key_risks,
        summary: item.summary,
        raw_response: item.raw_response,
      })) as AnalysisHistory[];
    },
    enabled: !!user,
  });

  // Run analysis mutation
  const analysisMutation = useMutation({
    mutationFn: async () => {
      const activeRules = rules.filter((r) => r.is_active);
      const recentDecisions = decisions.slice(0, 10);

      // Get portfolio tickers for smart insight selection
      const portfolioTickers = positions.map((p) => p.ticker);

      // Use smart insight selection
      const { insights: selectedInsights, meta: insightsMeta } = await selectSmartInsights(
        portfolioTickers
      );

      // Prepare ETF classification data for the analysis
      const etfClassifications = positions
        .filter(p => p.position_type === "etf" && etfMetadata[p.ticker])
        .map(p => ({
          ticker: p.ticker,
          ...etfMetadata[p.ticker],
        }));

      // Get unique newsletter count
      const uniqueNewsletterIds = new Set(selectedInsights.map((i) => i.newsletter_id));

      // Fetch cash balance from latest snapshot
      const { data: snapshotData } = await supabase
        .from("portfolio_snapshots")
        .select("cash_balance")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const cashBalance = snapshotData?.cash_balance ?? 0;

      // Calculate live portfolio values
      const livePositionsValue = positions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
      const totalPortfolioValue = livePositionsValue + cashBalance;

      // Fetch latest intelligence brief for enhanced recommendations
      let intelligenceBrief = null;
      try {
        const { data: briefData, error: briefError } = await supabase.functions.invoke("summarize-insights");
        if (!briefError && briefData && !briefData.error) {
          intelligenceBrief = briefData;
        }
      } catch (e) {
        console.warn("Could not fetch intelligence brief for analysis:", e);
      }

      // Fetch fundamentals directly from DB for all stocks
      const stockTickers = positions
        .filter(p => p.position_type === "stock")
        .map(p => p.ticker);

      let stockFundamentals: any[] = [];
      if (stockTickers.length > 0) {
        const { data: positionsWithFundamentals } = await supabase
          .from("positions")
          .select("ticker, fundamentals")
          .in("ticker", stockTickers)
          .not("fundamentals", "is", null);

        stockFundamentals = (positionsWithFundamentals ?? []).map(p => ({
          ticker: p.ticker,
          ...(p.fundamentals as any),
        }));
      }

      const { data, error } = await supabase.functions.invoke("analyze-portfolio", {
        body: {
          positions,
          rules: activeRules,
          insights: selectedInsights.map((i) => ({
            id: i.id,
            insight_type: i.insight_type,
            content: i.content,
            sentiment: i.sentiment,
            tickers_mentioned: i.tickers_mentioned,
            confidence_words: i.confidence_words,
            created_at: i.created_at,
            source_name: i.newsletters?.source_name,
          })),
          decisions: recentDecisions,
          etf_classifications: etfClassifications,
          cash_balance: cashBalance,
          total_portfolio_value: totalPortfolioValue,
          intelligence_brief: intelligenceBrief,
          stock_fundamentals: stockFundamentals,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Add meta info to result
      const result: AnalysisResult = {
        ...data,
        analysis_meta: {
          insightsCount: insightsMeta.total,
          newslettersCount: uniqueNewsletterIds.size,
          portfolioMentions: insightsMeta.portfolioMentions,
          bubbleSignals: insightsMeta.bubbleSignals,
          macroViews: insightsMeta.macroViews,
          oldestDate: insightsMeta.oldestDate,
          newestDate: insightsMeta.newestDate,
        },
      };

      return result;
    },
    onSuccess: async (data) => {
      setCurrentAnalysis(data);

      // Save to history
      const { error } = await supabase.from("analysis_history").insert({
        user_id: user!.id,
        health_score: data.portfolio_health_score,
        allocation_check: data.allocation_check as any,
        position_alerts: data.position_alerts as any,
        thesis_checks: data.thesis_checks as any,
        market_signals: data.market_signals as any,
        recommended_actions: data.recommended_actions as any,
        key_risks: data.key_risks,
        summary: data.summary,
        raw_response: data as any,
      });

      if (error) {
        console.error("Failed to save analysis history:", error);
      }

      queryClient.invalidateQueries({ queryKey: ["analysis_history"] });
      toast.success("Portfolio analysis complete");
    },
    onError: (error) => {
      console.error("Analysis failed:", error);
      toast.error("Analysis failed: " + error.message);
    },
  });

  const markActionCompleted = (index: number) => {
    if (!currentAnalysis) return;
    const updated = { ...currentAnalysis };
    updated.recommended_actions = [...updated.recommended_actions];
    updated.recommended_actions[index] = {
      ...updated.recommended_actions[index],
      completed: true,
    };
    setCurrentAnalysis(updated);
  };

  const dismissAction = (index: number, reason: string) => {
    if (!currentAnalysis) return;
    const updated = { ...currentAnalysis };
    updated.recommended_actions = [...updated.recommended_actions];
    updated.recommended_actions[index] = {
      ...updated.recommended_actions[index],
      dismissed: true,
      dismiss_reason: reason,
    };
    setCurrentAnalysis(updated);
  };

  return {
    currentAnalysis,
    setCurrentAnalysis,
    history: historyQuery.data ?? [],
    isLoadingHistory: historyQuery.isLoading,
    runAnalysis: analysisMutation.mutate,
    isAnalyzing: analysisMutation.isPending,
    markActionCompleted,
    dismissAction,
    hasData: positions.length > 0,
  };
}
