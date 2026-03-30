import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface StockToResearch {
  ticker: string;
  name: string;
  setup?: string;
  thesis: string;
  trigger?: string;
  time_horizon?: string;
  risk_level?: string;
  mentioned_in: number;
  source_confidence_avg?: number;
  consensus_or_edge?: string;
}

export interface CountryTilt {
  region: string;
  direction: string;
  conviction?: string;
  etf_proxy: string;
  in_portfolio: boolean;
  reasoning?: string;
  signal_type?: string;
  vs_prior_brief?: string;
}

export interface SectorTilt {
  sector: string;
  direction: string;
  conviction: string;
  portfolio_tickers?: string[];
  reasoning?: string;
  signal_type?: string;
  vs_prior_brief?: string;
  earnings_pattern?: string;
}

export interface ContrarianOpportunity {
  title: string;
  macro_tailwind: string;
  why_not_crowded: string;
  second_order_logic: string;
  ticker: string;
  ticker_name: string;
  in_portfolio: boolean;
  time_horizon: string;
  conviction: string;
}

export interface TemporalShift {
  topic: string;
  prior_view: string;
  current_view: string;
  weeks_tracked?: number;
  significance: string;
}

export interface InsightsSummary {
  letter: string;
  section_titles: {
    market: string;
    portfolio: string;
    invest: string;
    watch: string;
  };
  stocks_to_research: StockToResearch[];
  country_tilts: CountryTilt[];
  sector_tilts: SectorTilt[];
  contrarian_opportunities: ContrarianOpportunity[];
  crowded_trades: string[];
  temporal_shifts?: TemporalShift[];
  weekly_priority: string | null;
  signal_quality?: string;
  newsletters_analyzed: number;
  insights_analyzed: number;
  generated_at: string;
  executive_summary?: string;
}

export function useInsightsSummary() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: summary, isLoading } = useQuery({
    queryKey: ["intelligence_brief", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("intelligence_briefs")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        letter: data.letter ?? null,
        section_titles: (data.section_titles as InsightsSummary["section_titles"]) ?? {
          market: "State of the Market",
          portfolio: "Consensus vs Divergence",
          invest: "Where to Invest",
          watch: "Watch This Week",
        },
        stocks_to_research: (data.stocks_to_research as unknown as StockToResearch[]) ?? [],
        country_tilts: (data.country_tilts as unknown as CountryTilt[]) ?? [],
        sector_tilts: (data.sector_tilts as unknown as SectorTilt[]) ?? [],
        contrarian_opportunities: (data.contrarian_opportunities as unknown as ContrarianOpportunity[]) ?? [],
        crowded_trades: data.crowded_trades ?? [],
        temporal_shifts: (data.temporal_shifts as unknown as TemporalShift[]) ?? [],
        weekly_priority: data.weekly_priority ?? null,
        executive_summary: data.executive_summary ?? "",
        newsletters_analyzed: data.newsletters_analyzed ?? 0,
        insights_analyzed: data.insights_analyzed ?? 0,
        generated_at: data.generated_at,
      } as InsightsSummary;
    },
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      // Get fresh session token (supabase.functions.invoke uses cached token which can go stale)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("You must be logged in to generate summaries");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-insights`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({}),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Summary generation failed");
      }
      if (data.error) throw new Error(data.error);

      // Brief is persisted server-side by the edge function
      return data as InsightsSummary;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["intelligence_brief"] });
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      if ((data as any)?.market_context_available === false) {
        toast.warning("Brief generated without real-time market data — claims are not cross-checked against live prices");
      } else {
        toast.success("Intelligence brief generated");
      }
    },
    onError: (error) => {
      console.error("Summary generation failed:", error);
      toast.error("Failed to generate summary: " + error.message);
    },
  });

  return {
    summary: summary ?? null,
    isLoading,
    generateSummary: mutation.mutate,
    isGenerating: mutation.isPending,
  };
}
