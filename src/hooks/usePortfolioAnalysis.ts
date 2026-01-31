import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePositions } from "./usePositions";
import { usePhilosophyRules } from "./usePhilosophyRules";
import { useDecisionLogs } from "./useDecisionLogs";
import { useAllETFMetadata } from "./useAllETFMetadata";
import { toast } from "sonner";

export interface AllocationCheck {
  stocks_percent: number;
  stocks_status: "ok" | "warning" | "critical";
  etfs_percent: number;
  etfs_status: "ok" | "warning" | "critical";
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
}

export interface RecommendedAction {
  priority: number;
  action: string;
  reasoning: string;
  confidence: "high" | "medium" | "low";
  completed?: boolean;
  dismissed?: boolean;
  dismiss_reason?: string;
}

export interface AnalysisResult {
  id?: string;
  created_at?: string;
  allocation_check: AllocationCheck;
  position_alerts: PositionAlert[];
  thesis_checks: ThesisCheck[];
  market_signals: MarketSignals;
  recommended_actions: RecommendedAction[];
  portfolio_health_score: number;
  key_risks: string[];
  summary: string;
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
}

export function usePortfolioAnalysis() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { positions } = usePositions();
  const { rules } = usePhilosophyRules();
  const { decisions } = useDecisionLogs();
  const { data: etfMetadata = {} } = useAllETFMetadata();
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);

  // Fetch recent insights (last 30 days)
  const insightsQuery = useQuery({
    queryKey: ["insights", "recent", user?.id],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from("insights")
        .select(`
          *,
          newsletters (
            source_name,
            upload_date
          )
        `)
        .gte("created_at", thirtyDaysAgo.toISOString())
        .order("created_at", { ascending: false });

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
      })) as AnalysisHistory[];
    },
    enabled: !!user,
  });

  // Run analysis mutation
  const analysisMutation = useMutation({
    mutationFn: async () => {
      const activeRules = rules.filter((r) => r.is_active);
      const recentInsights = insightsQuery.data ?? [];
      const recentDecisions = decisions.slice(0, 10);

      // Prepare ETF classification data for the analysis
      const etfClassifications = positions
        .filter(p => p.position_type === "etf" && etfMetadata[p.ticker])
        .map(p => ({
          ticker: p.ticker,
          ...etfMetadata[p.ticker],
        }));

      const { data, error } = await supabase.functions.invoke("analyze-portfolio", {
        body: {
          positions,
          rules: activeRules,
          insights: recentInsights,
          decisions: recentDecisions,
          etf_classifications: etfClassifications,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      return data as AnalysisResult;
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
