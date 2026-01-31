import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { subDays } from "date-fns";

export interface InsightStats {
  totalNewsletters: number;
  totalInsights: number;
  activeInsights: number;
  archivedNewsletters: number;
  insightsInLastAnalysis: number;
  healthStatus: "green" | "amber" | "red";
}

export type InsightsWindow = "7" | "30" | "90" | "all";

export function useInsightStats(insightsWindow: InsightsWindow = "30") {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["insight-stats", user?.id, insightsWindow],
    queryFn: async (): Promise<InsightStats> => {
      // Get all newsletters
      const { data: newsletters, error: nlError } = await supabase
        .from("newsletters")
        .select("id, is_archived, created_at");

      if (nlError) throw nlError;

      const totalNewsletters = newsletters?.length ?? 0;
      const archivedNewsletters = newsletters?.filter((n) => n.is_archived).length ?? 0;

      // Get all insights
      const { data: allInsights, error: insError } = await supabase
        .from("insights")
        .select("id, created_at, is_summarized");

      if (insError) throw insError;

      const totalInsights = allInsights?.length ?? 0;

      // Calculate active insights based on window
      const now = new Date();
      let windowDate: Date | null = null;
      if (insightsWindow !== "all") {
        windowDate = subDays(now, parseInt(insightsWindow));
      }

      const activeInsights = windowDate
        ? allInsights?.filter(
            (i) => !i.is_summarized && new Date(i.created_at) >= windowDate
          ).length ?? 0
        : allInsights?.filter((i) => !i.is_summarized).length ?? 0;

      // For now, assume last analysis used 50 max (we'll update this when analysis runs)
      const insightsInLastAnalysis = Math.min(activeInsights, 50);

      // Health status based on active insights
      let healthStatus: "green" | "amber" | "red" = "green";
      if (activeInsights > 50) {
        healthStatus = "red";
      } else if (activeInsights > 30) {
        healthStatus = "amber";
      }

      return {
        totalNewsletters,
        totalInsights,
        activeInsights,
        archivedNewsletters,
        insightsInLastAnalysis,
        healthStatus,
      };
    },
    enabled: !!user,
  });
}
