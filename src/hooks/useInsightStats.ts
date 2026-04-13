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

export function useInsightStats() {
  const { user } = useAuth();
  const windowDays = 30;

  return useQuery({
    queryKey: ["insight-stats", user?.id],
    queryFn: async (): Promise<InsightStats> => {
      // Get all newsletters for this user
      const { data: newsletters, error: nlError } = await supabase
        .from("newsletters")
        .select("id, is_archived, created_at")
        .eq("user_id", user!.id);

      if (nlError) throw nlError;

      const totalNewsletters = newsletters?.length ?? 0;
      const archivedNewsletters = newsletters?.filter((n) => n.is_archived).length ?? 0;

      // Get insights scoped to this user's newsletters
      const newsletterIds = (newsletters ?? []).map(n => n.id);
      if (newsletterIds.length === 0) {
        return {
          totalNewsletters,
          totalInsights: 0,
          activeInsights: 0,
          archivedNewsletters,
          insightsInLastAnalysis: 0,
          healthStatus: "green" as const,
        };
      }

      const { data: allInsights, error: insError } = await supabase
        .from("insights")
        .select("id, created_at, is_summarized")
        .in("newsletter_id", newsletterIds);

      if (insError) throw insError;

      const totalInsights = allInsights?.length ?? 0;

      // Calculate active insights based on window
      const now = new Date();
      const windowDate = subDays(now, windowDays);

      const activeInsights = allInsights?.filter(
            (i) => !i.is_summarized && new Date(i.created_at) >= windowDate
          ).length ?? 0;

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
