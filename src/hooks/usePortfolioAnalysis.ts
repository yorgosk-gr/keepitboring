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
  const { principles: bookPrinciples } = useBookPrinciples();
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);

  // Cash balance from ib_accounts — useQuery so it's cached and ready when mutation runs.
  // This is the same pattern useDashboardData uses (which shows cash correctly on Portfolio page).
  const ibAccountQuery = useQuery({
    queryKey: ["ib-account", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ib_accounts")
        .select("cash_balance")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

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

      // Fetch cash_balance directly at mutation time — the cached query may not
      // have resolved yet when the user clicks "Run Analysis", and a missing value
      // silently collapses total_portfolio_value to non-cash only, producing 0%
      // cash in the analysis output.
      const { data: ibAccountRow, error: ibAccountErr } = await supabase
        .from("ib_accounts")
        .select("cash_balance")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (ibAccountErr) throw ibAccountErr;
      const cashBalance = Number(ibAccountRow?.cash_balance ?? 0);

      // Filter out any cash-type positions (defensive — IB doesn't normally put cash here)
      const CASH_ASSET_CLASSES = new Set(["CASH", "FX", "FXCONV"]);
      const isCashPosition = (p: any) =>
        p.position_type === "cash" ||
        CASH_ASSET_CLASSES.has((p.asset_class ?? "").toUpperCase());
      const nonCashPositions = positions.filter((p) => !isCashPosition(p));

      const livePositionsValue = nonCashPositions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
      const totalPortfolioValue = livePositionsValue + cashBalance;

      console.log("[Analysis] Cash:", {
        ibAccountCash: ibAccountQuery.data?.cash_balance,
        cashBalance,
        livePositionsValue,
        totalPortfolioValue,
        cashPercent: ((cashBalance / totalPortfolioValue) * 100).toFixed(1) + "%",
      });

      // Read the latest intelligence brief (user generates these via the Newsletters page)
      const { data: intelligenceBrief } = await supabase
        .from("intelligence_briefs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

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

      // ── Sector Momentum Analysis ──────────────────────────────────────
      // Derive sector from tickers_mentioned in each insight, fallback to content keywords.
      // Produces per-sector net bullish/bearish signal to temper buy conviction in "hot" sectors.
      const TICKER_SECTOR_MAP: Record<string, string> = {
        // Energy / Oil & Gas
        XOM: "energy", CVX: "energy", BP: "energy", SHEL: "energy", TTE: "energy",
        COP: "energy", OXY: "energy", SLB: "energy", HAL: "energy", MPC: "energy",
        VLO: "energy", PSX: "energy", XLE: "energy", RDSB: "energy", ENB: "energy",
        // Technology
        AAPL: "technology", MSFT: "technology", GOOGL: "technology", GOOG: "technology",
        META: "technology", NVDA: "technology", AMZN: "technology", TSLA: "technology",
        INTC: "technology", AMD: "technology", QCOM: "technology", CRM: "technology",
        ORCL: "technology", IBM: "technology", ADBE: "technology", QQQ: "technology",
        SMH: "technology", XLK: "technology", SOXX: "technology", PLTR: "technology",
        // Financials
        JPM: "financials", BAC: "financials", GS: "financials", MS: "financials",
        WFC: "financials", C: "financials", BRK: "financials", V: "financials",
        MA: "financials", AXP: "financials", XLF: "financials", BX: "financials",
        // Healthcare
        JNJ: "healthcare", UNH: "healthcare", PFE: "healthcare", ABBV: "healthcare",
        MRK: "healthcare", LLY: "healthcare", BMY: "healthcare", ABT: "healthcare",
        XLV: "healthcare", ISRG: "healthcare",
        // Consumer Discretionary
        HD: "consumer_discretionary", MCD: "consumer_discretionary", NKE: "consumer_discretionary",
        SBUX: "consumer_discretionary", TGT: "consumer_discretionary", XLY: "consumer_discretionary",
        // Consumer Staples
        WMT: "consumer_staples", PG: "consumer_staples", KO: "consumer_staples",
        PEP: "consumer_staples", PM: "consumer_staples", XLP: "consumer_staples",
        // Industrials / Defense
        LMT: "defense", RTX: "defense", NOC: "defense", GD: "defense", BA: "defense",
        CAT: "industrials", DE: "industrials", XLI: "industrials", GE: "industrials",
        // Materials / Gold
        GLD: "gold", IAU: "gold", SGOL: "gold", PHAU: "gold",
        SLV: "silver", XLB: "materials", FCX: "materials",
        // Utilities
        NEE: "utilities", DUK: "utilities", XLU: "utilities",
        // Real Estate
        VNQ: "real_estate",
      };

      const SECTOR_KEYWORDS: Array<{ keywords: string[]; sector: string }> = [
        { keywords: ["oil", "crude", "petroleum", "opec", "refin", "brent", "wti", "natural gas", "lng", "hormuz", "pipeline", "energy sector"], sector: "energy" },
        { keywords: ["chip", "semiconductor", "artificial intelligence", "cloud computing", "software stock", "tech stock", "nvidia", "gpu"], sector: "technology" },
        { keywords: ["bank", "banking sector", "financial stock", "interest rate", "yield curve", "credit market"], sector: "financials" },
        { keywords: ["pharma", "biotech", "drug approval", "fda approval", "healthcare stock"], sector: "healthcare" },
        { keywords: ["defense stock", "military spending", "lockheed", "raytheon", "pentagon budget", "nato spending"], sector: "defense" },
        { keywords: ["gold price", "precious metals", "gold rally", "gold etf", "inflation hedge"], sector: "gold" },
        { keywords: ["real estate", "reit", "housing market", "commercial property", "property market"], sector: "real_estate" },
        { keywords: ["consumer spending", "retail sales", "discretionary spending"], sector: "consumer_discretionary" },
      ];

      const sectorBuckets: Record<string, { bullish: number; bearish: number; neutral: number }> = {};
      const addToSector = (sector: string, sentiment: string) => {
        if (!sectorBuckets[sector]) sectorBuckets[sector] = { bullish: 0, bearish: 0, neutral: 0 };
        if (sentiment === "bullish") sectorBuckets[sector].bullish++;
        else if (sentiment === "bearish") sectorBuckets[sector].bearish++;
        else sectorBuckets[sector].neutral++;
      };

      for (const insight of selectedInsights) {
        const sentiment = insight.sentiment ?? "neutral";
        let assigned = false;
        // 1. Map via tickers_mentioned
        for (const ticker of (insight.tickers_mentioned ?? [])) {
          const sector = TICKER_SECTOR_MAP[ticker.toUpperCase()];
          if (sector) { addToSector(sector, sentiment); assigned = true; }
        }
        // 2. Fallback: keyword scan on content
        if (!assigned) {
          const contentLower = (insight.content ?? "").toLowerCase();
          for (const { keywords, sector } of SECTOR_KEYWORDS) {
            if (keywords.some(kw => contentLower.includes(kw))) {
              addToSector(sector, sentiment);
              break;
            }
          }
        }
      }

      const sectorMomentum = Object.entries(sectorBuckets).map(([sector, counts]) => {
        const total = counts.bullish + counts.bearish + counts.neutral;
        const netRatio = total > 0 ? (counts.bullish - counts.bearish) / total : 0;
        let signal: "hot" | "cold" | "mixed" | "insufficient_data" = "mixed";
        if (total < 3) signal = "insufficient_data";
        else if (netRatio > 0.50) signal = "hot";
        else if (netRatio < -0.50) signal = "cold";
        return { sector, bullish: counts.bullish, bearish: counts.bearish, neutral: counts.neutral,
          total, net_ratio: parseFloat(netRatio.toFixed(2)), signal };
      }).sort((a, b) => b.total - a.total);

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
          sector_momentum: sectorMomentum,
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
