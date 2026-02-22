import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface KeyPoint {
  title: string;
  detail: string;
  relevance: "high" | "medium" | "low";
  category: "macro" | "sector" | "stock" | "risk" | "opportunity";
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
  portfolio_impact: string;
}

export interface InsightsSummary {
  executive_summary: string;
  key_points: KeyPoint[];
  action_items: ActionItem[];
  market_themes: MarketTheme[];
  contrarian_signals: string[];
  newsletters_analyzed: number;
  insights_analyzed: number;
  generated_at: string;
}

export function useInsightsSummary() {
  const [summary, setSummary] = useState<InsightsSummary | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("summarize-insights");
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data as InsightsSummary;
    },
    onSuccess: (data) => {
      setSummary(data);
      toast.success("Intelligence brief generated");
    },
    onError: (error) => {
      console.error("Summary generation failed:", error);
      toast.error("Failed to generate summary: " + error.message);
    },
  });

  return {
    summary,
    setSummary,
    generateSummary: mutation.mutate,
    isGenerating: mutation.isPending,
  };
}
