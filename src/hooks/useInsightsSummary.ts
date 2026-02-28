import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface StockToResearch {
  ticker: string;
  name: string;
  thesis: string;
  mentioned_in: number;
}

export interface CountryTilt {
  region: string;
  direction: string;
  etf_proxy: string;
  in_portfolio: boolean;
}

export interface SectorTilt {
  sector: string;
  direction: string;
  conviction: string;
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
  crowded_trades: string[];
  weekly_priority: string | null;
  newsletters_analyzed: number;
  insights_analyzed: number;
  generated_at: string;
  // Legacy fields for backward compat
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
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        letter: (data as any).letter ?? data.executive_summary ?? "",
        section_titles: (data as any).section_titles ?? {
          market: "State of the Market",
          portfolio: "What This Means For Your Portfolio",
          invest: "Where to Invest",
          watch: "Watch This Week",
        },
        stocks_to_research: ((data as any).stocks_to_research as StockToResearch[] ?? []),
        country_tilts: ((data as any).country_tilts as CountryTilt[] ?? []),
        sector_tilts: ((data as any).sector_tilts as SectorTilt[] ?? []),
        crowded_trades: ((data as any).crowded_trades as string[] ?? []),
        weekly_priority: (data as any).weekly_priority ?? null,
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
      const { data, error } = await supabase.functions.invoke("summarize-insights");
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      const brief = data as InsightsSummary;

      await supabase.from("intelligence_briefs").delete().eq("user_id", user!.id);

      const { error: insertError } = await supabase.from("intelligence_briefs").insert({
        user_id: user!.id,
        executive_summary: brief.letter?.substring(0, 500) ?? brief.executive_summary ?? "",
        letter: brief.letter,
        section_titles: brief.section_titles as any,
        stocks_to_research: brief.stocks_to_research as any,
        country_tilts: brief.country_tilts as any,
        sector_tilts: brief.sector_tilts as any,
        crowded_trades: brief.crowded_trades,
        weekly_priority: brief.weekly_priority,
        key_points: [] as any,
        action_items: [] as any,
        market_themes: [] as any,
        contrarian_signals: brief.crowded_trades ?? [],
        newsletters_analyzed: brief.newsletters_analyzed,
        insights_analyzed: brief.insights_analyzed,
        generated_at: brief.generated_at,
      } as any);

      if (insertError) {
        console.error("Failed to persist brief:", insertError);
        throw insertError;
      }

      // Cleanup old newsletters (60 days)
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 60);
      const cutoffISO = cutoffDate.toISOString();

      const { data: oldNewsletters } = await supabase
        .from("newsletters")
        .select("id")
        .lt("created_at", cutoffISO);

      if (oldNewsletters && oldNewsletters.length > 0) {
        const oldIds = oldNewsletters.map((n) => n.id);
        await supabase.from("insights").delete().in("newsletter_id", oldIds);
        await supabase.from("newsletters").delete().in("id", oldIds);
      }

      return brief;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["intelligence_brief"] });
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      toast.success("Intelligence brief generated");
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
