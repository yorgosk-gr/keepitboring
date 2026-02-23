import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface KeyPoint {
  title: string;
  detail: string;
  relevance: "high" | "medium" | "low";
  category: "macro" | "sector" | "stock" | "risk" | "opportunity";
  portfolio_alignment_score?: number;
  exposed_tickers?: string[];
  source_count?: number;
  source_names?: string[];
  single_source?: boolean;
}

export interface ActionItem {
  action: string;
  urgency: "high" | "medium" | "low";
  reasoning: string;
}

export interface MarketTheme {
  theme: string;
  sentiment: "bullish" | "bearish" | "mixed";
  source_count: number;
  source_names?: string[];
  portfolio_impact: string;
  portfolio_alignment_score?: number;
  exposed_tickers?: string[];
}

export interface ContrarianSignal {
  topic: string;
  bull_case: string;
  bear_case: string;
  your_exposure: string[];
  recommended_stance: string;
}

export interface PersistentSignal {
  signal: string;
  weeks_active: number;
  trend: "strengthening" | "stable" | "weakening";
}

export interface InsightsSummary {
  executive_summary: string;
  weekly_priority?: string | null;
  key_points: KeyPoint[];
  action_items: ActionItem[];
  market_themes: MarketTheme[];
  contrarian_signals: (string | ContrarianSignal)[];
  persistent_signals?: PersistentSignal[];
  newsletters_analyzed: number;
  insights_analyzed: number;
  generated_at: string;
}

export function useInsightsSummary() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Load the latest persisted brief
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
        executive_summary: data.executive_summary ?? "",
        weekly_priority: (data as any).weekly_priority ?? null,
        key_points: (data.key_points as any[] ?? []) as KeyPoint[],
        action_items: (data.action_items as any[] ?? []) as ActionItem[],
        market_themes: (data.market_themes as any[] ?? []) as MarketTheme[],
        contrarian_signals: data.contrarian_signals ?? [],
        persistent_signals: ((data as any).persistent_signals as PersistentSignal[] ?? []),
        newsletters_analyzed: data.newsletters_analyzed ?? 0,
        insights_analyzed: data.insights_analyzed ?? 0,
        generated_at: data.generated_at,
      } as InsightsSummary;
    },
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      // 1. Generate the brief
      const { data, error } = await supabase.functions.invoke("summarize-insights");
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      const brief = data as InsightsSummary;

      // 2. Delete old briefs for this user, then insert the new one
      await supabase.from("intelligence_briefs").delete().eq("user_id", user!.id);

      const { error: insertError } = await supabase.from("intelligence_briefs").insert({
        user_id: user!.id,
        executive_summary: brief.executive_summary,
        key_points: brief.key_points as any,
        action_items: brief.action_items as any,
        market_themes: brief.market_themes as any,
        contrarian_signals: brief.contrarian_signals as any,
        newsletters_analyzed: brief.newsletters_analyzed,
        insights_analyzed: brief.insights_analyzed,
        generated_at: brief.generated_at,
      });

      if (insertError) {
        console.error("Failed to persist brief:", insertError);
      }

      // 3. Delete newsletters older than 60 days and their insights
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
        const { error: deleteError } = await supabase
          .from("newsletters")
          .delete()
          .in("id", oldIds);

        if (deleteError) {
          console.error("Failed to clean up old newsletters:", deleteError);
        } else if (oldNewsletters.length > 0) {
          toast.info(`Cleaned up ${oldNewsletters.length} newsletters older than 60 days`);
        }
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
