import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BondRecommendations } from "@/components/analysis/BondRecommendationsCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePositions } from "./usePositions";
import { usePhilosophyRules } from "./usePhilosophyRules";
import { useDecisionLogs } from "./useDecisionLogs";
import { useAllETFMetadata } from "./useAllETFMetadata";
import { useSettings } from "./useSettings";
import { useRiskProfile } from "./useRiskProfile";
import { selectSmartInsights } from "./useSmartInsightSelection";
import { usePortfolioStrategy } from "./usePortfolioStrategy";
import { useNorthStar } from "./useNorthStar";
import { useBookPrinciples } from "./useBookPrinciples";
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
  alert_type: "size" | "quality" | "rationale" | "sentiment";
  severity: "warning" | "critical";
  issue: string;
  recent_sentiment: string;
  recommendation: string;
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
  rationale_aligned: boolean | null;
  /** @deprecated Use rationale_aligned */
  thesis_aligned?: boolean | null;
  execution_step?: number | null;
  order_type?: "market" | "limit";
  execution_note?: string;
}

export interface RebalancingSummary {
  total_sells: string;
  total_buys: string;
  net_cash_impact: string;
  primary_goal: string;
  execution_sequence_summary?: string;
}

export interface HealthScoreBreakdownItem {
  rule: string;
  current: number;
  target: string;
  status: "breach" | "ok";
  points_deducted: number;
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

export interface IdealAllocationResult {
  etfs: Array<{
    ticker: string;
    name: string;
    asset_class: string;
    sub_category: string;
    domicile: string;
    exchange: string;
    amount_usd: number;
    percent: number;
    expense_ratio: number;
    explanation: string;
  }>;
  strategy_summary: string;
  tax_note: string;
}

export interface AnalysisResult {
  id?: string;
  created_at?: string;
  allocation_check: AllocationCheck;
  position_alerts: PositionAlert[];
  market_signals: MarketSignals;
  recommended_actions: RecommendedAction[];
  trade_recommendations: TradeRecommendation[];
  rebalancing_summary: RebalancingSummary;
  bond_recommendations?: BondRecommendations;
  ideal_allocation?: IdealAllocationResult | null;
  portfolio_health_score: number;
  summary: string;
  thesis_checks?: any[]; // always [] from v2, kept for compat
  analysis_meta?: AnalysisMeta;
  health_score_breakdown?: HealthScoreBreakdownItem[];
}

export interface AnalysisHistory {
  id: string;
  user_id: string;
  created_at: string;
  health_score: number | null;
  allocation_check: AllocationCheck | null;
  position_alerts: PositionAlert[] | null;
  market_signals: MarketSignals | null;
  recommended_actions: RecommendedAction[] | null;
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
  const { activeProfile, behavioralSignals } = useRiskProfile();
  const { strategy } = usePortfolioStrategy();
  const { positions: nsPositions } = useNorthStar();
  const { principles: bookPrinciples } = useBookPrinciples();
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);

  // Fetch analysis history
  const historyQuery = useQuery({
    queryKey: ["analysis_history", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analysis_history")
        .select("*")
        .eq("user_id", user!.id)
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
        market_signals: item.market_signals as MarketSignals | null,
        recommended_actions: item.recommended_actions as RecommendedAction[] | null,
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

      // Prepare ETF classification data — manually classified positions take priority
      const etfClassifications = positions
        .filter(p => p.position_type === "etf")
        .map(p => {
          const meta = etfMetadata[p.ticker];
          const resolvedCategory = p.manually_classified
            ? (p.category ?? meta?.category ?? "equity")
            : (meta?.category ?? p.category ?? "equity");
          return {
            ticker: p.ticker,
            name: p.name,
            geography: meta?.geography ?? "global",
            is_broad_market: meta?.is_broad_market ?? false,
            is_inferred: !meta,
            ...(meta ?? {}),
            category: resolvedCategory,
          };
        });

      // Get unique newsletter count
      const uniqueNewsletterIds = new Set(selectedInsights.map((i) => i.newsletter_id));

      // Fetch cash balance from latest snapshot
      const { data: snapshotData } = await supabase
        .from("portfolio_snapshots")
        .select("cash_balance")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      const snapshotCash = snapshotData?.cash_balance ?? 0;

      // Separate cash positions (IB reports cash as a position with position_type "cash").
      // If not separated, the cash market value would be counted as equity in computeRuleEvaluation.
      const cashPositions = positions.filter((p) => p.position_type === "cash");
      const nonCashPositions = positions.filter((p) => p.position_type !== "cash");
      const cashFromPositions = cashPositions.reduce((s, p) => s + (p.market_value ?? 0), 0);

      // Combine snapshot cash with IB cash position value (avoid double-counting)
      const cashBalance = cashFromPositions > 0 ? cashFromPositions : snapshotCash;

      // Calculate live portfolio values (excluding cash positions — cash tracked separately)
      const livePositionsValue = nonCashPositions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
      const totalPortfolioValue = livePositionsValue + cashBalance;

      // Read the latest existing intelligence brief from DB (don't generate a new one —
      // that's expensive and slow; the user generates briefs separately via the Newsletters page)
      let intelligenceBrief = null;
      try {
        const { data: briefData, error: briefError } = await supabase
          .from("intelligence_briefs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!briefError && briefData) {
          intelligenceBrief = briefData;
        }
      } catch (e) {
        console.warn("Could not fetch intelligence brief for analysis:", e);
      }

      // Fetch fundamentals directly from DB for all stocks
      const stockTickers = nonCashPositions
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

      // ── ETF Overlap & Effective Geographic Exposure ─────────────────────
      // Common broad all-world / developed ETFs and their approximate underlying weights
      const BROAD_ETF_WEIGHTS: Record<string, Record<string, number>> = {
        VWRA: { us: 0.622, europe: 0.152, japan: 0.063, em: 0.107, uk: 0.040, other_dev: 0.016 },
        VWRL: { us: 0.622, europe: 0.152, japan: 0.063, em: 0.107, uk: 0.040, other_dev: 0.016 },
        VT:   { us: 0.620, europe: 0.145, japan: 0.065, em: 0.115, uk: 0.035, other_dev: 0.020 },
        IWDA: { us: 0.695, europe: 0.175, japan: 0.065, uk: 0.040, other_dev: 0.025 },
        SWRD: { us: 0.695, europe: 0.175, japan: 0.065, uk: 0.040, other_dev: 0.025 },
      };

      // Single-region equity ETFs: ticker → region key
      const REGIONAL_ETF_MAP: Record<string, string> = {
        CSPX: "us", VUSA: "us", SPXS: "us", IVV: "us", SPY: "us", VOO: "us",
        IJPA: "japan", EWJ: "japan", JPNH: "japan",
        EIMI: "em", EEM: "em", VWO: "em", AEEM: "em",
        IMEU: "europe", VGK: "europe", IEUG: "europe", SMEA: "europe",
        ISF:  "uk", VUKE: "uk",
      };

      // Compute effective geographic exposure across portfolio
      const effectiveExposure: Record<string, number> = {};
      const broadPositions: Array<{ ticker: string; weight: number }> = [];
      const regionalPositions: Array<{ ticker: string; region: string; weight: number; hasThesis: boolean }> = [];

      for (const p of nonCashPositions) {
        if (!p.market_value || !totalPortfolioValue) continue;
        const w = p.market_value / totalPortfolioValue;
        const ticker = p.ticker.toUpperCase();

        if (BROAD_ETF_WEIGHTS[ticker]) {
          broadPositions.push({ ticker, weight: w });
          for (const [region, share] of Object.entries(BROAD_ETF_WEIGHTS[ticker])) {
            effectiveExposure[region] = (effectiveExposure[region] ?? 0) + w * share;
          }
        } else if (REGIONAL_ETF_MAP[ticker]) {
          const region = REGIONAL_ETF_MAP[ticker];
          const hasThesis = !!(p as any).thesis_notes && (p as any).thesis_notes.trim().length > 10;
          regionalPositions.push({ ticker, region, weight: w, hasThesis });
          effectiveExposure[region] = (effectiveExposure[region] ?? 0) + w;
        }
      }

      // Compute VWRA-baseline exposure for each region (what you'd have with VWRA only at same total broad-ETF weight)
      const totalBroadWeight = broadPositions.reduce((s, p) => s + p.weight, 0);
      const primaryBroadETF = [...broadPositions].sort((a, b) => b.weight - a.weight)[0]?.ticker ?? "VWRA";
      const baselineWeights = BROAD_ETF_WEIGHTS[primaryBroadETF] ?? BROAD_ETF_WEIGHTS.VWRA;

      const etfOverlapData = {
        broad_etfs: broadPositions,
        regional_etfs: regionalPositions,
        effective_exposure: effectiveExposure,
        baseline_weights: baselineWeights,
        tilts: regionalPositions.map(rp => ({
          ticker: rp.ticker,
          region: rp.region,
          direct_weight_pct: parseFloat((rp.weight * 100).toFixed(1)),
          baseline_pct: parseFloat(((baselineWeights[rp.region] ?? 0) * totalBroadWeight * 100).toFixed(1)),
          effective_total_pct: parseFloat(((effectiveExposure[rp.region] ?? 0) * 100).toFixed(1)),
          has_thesis: rp.hasThesis,
        })),
      };

      const { data, error } = await supabase.functions.invoke("analyze-portfolio", {
        body: {
          positions: nonCashPositions,
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
          intelligence_brief: intelligenceBrief ? {
            ...intelligenceBrief,
            generated_at: intelligenceBrief.generated_at ?? null,
          } : null,
          stock_fundamentals: stockFundamentals,
          etf_overlap: etfOverlapData,
          portfolio_mode: settings.portfolioMode ?? "balanced",
          risk_profile: activeProfile ? {
            profile: activeProfile.profile,
            score: activeProfile.score,
            dimension_scores: activeProfile.dimension_scores,
          } : null,
          behavioral_alignment: (() => {
            if (!behavioralSignals || behavioralSignals.length === 0) return null;
            const aligned = behavioralSignals.filter(s => s.aligned).length;
            const total = behavioralSignals.length;
            return {
              aligned_ratio: parseFloat((aligned / total).toFixed(2)),
              total_signals: total,
              aligned_count: aligned,
            };
          })(),
          portfolio_strategy: strategy ? {
            mandate: strategy.mandate,
            philosophy: strategy.philosophy,
            target_description: strategy.target_description,
            priorities: strategy.priorities,
            positions_to_build: strategy.positions_to_build,
            positions_to_exit: strategy.positions_to_exit,
            constraints: strategy.constraints,
          } : null,
          north_star: nsPositions.length > 0 ? nsPositions.map(ns => ({
            ticker: ns.ticker,
            name: ns.name,
            target_weight_ideal: ns.target_weight_ideal,
            target_weight_min: ns.target_weight_min,
            target_weight_max: ns.target_weight_max,
            status: ns.status,
            priority: ns.priority,
          })) : null,
          book_principles: bookPrinciples.filter(bp => bp.is_active).map(bp => ({
            author: bp.author,
            category: bp.category,
            condition: bp.condition,
            principle: bp.principle,
            action_implication: bp.action_implication,
          })),
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
        market_signals: data.market_signals as any,
        recommended_actions: data.recommended_actions as any,
        key_risks: [],
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

  const persistActionState = async (
    index: number,
    updates: { completed?: boolean; dismissed?: boolean; dismiss_reason?: string }
  ) => {
    if (!currentAnalysis?.id || !user) return;
    const action = currentAnalysis.recommended_actions[index];
    if (!action) return;

    await supabase.from("recommended_action_states" as any).upsert({
      user_id: user.id,
      analysis_id: currentAnalysis.id,
      action_index: index,
      action_text: action.action,
      ...updates,
      updated_at: new Date().toISOString(),
    } as any, { onConflict: "analysis_id,action_index" });
  };

  const markActionCompleted = async (index: number) => {
    if (!currentAnalysis) return;
    const updated = { ...currentAnalysis };
    updated.recommended_actions = [...updated.recommended_actions];
    updated.recommended_actions[index] = {
      ...updated.recommended_actions[index],
      completed: true,
    };
    setCurrentAnalysis(updated);
    try {
      await persistActionState(index, { completed: true });
    } catch (e) {
      console.warn("Failed to persist action state:", e);
    }
  };

  const dismissAction = async (index: number, reason: string) => {
    if (!currentAnalysis) return;
    const updated = { ...currentAnalysis };
    updated.recommended_actions = [...updated.recommended_actions];
    updated.recommended_actions[index] = {
      ...updated.recommended_actions[index],
      dismissed: true,
      dismiss_reason: reason,
    };
    setCurrentAnalysis(updated);
    try {
      await persistActionState(index, { dismissed: true, dismiss_reason: reason });
    } catch (e) {
      console.warn("Failed to persist action state:", e);
    }
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
