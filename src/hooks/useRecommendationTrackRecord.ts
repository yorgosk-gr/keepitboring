import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TrackRecordStats {
  totalRecommendations: number;
  followed: number;
  followRate: number;
  withOutcome: number;
  correct: number;
  hitRate: number;
}

export function useRecommendationTrackRecord() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["recommendation_track_record", user?.id],
    queryFn: async (): Promise<TrackRecordStats> => {
      const { data: history, error: histErr } = await supabase
        .from("analysis_history")
        .select("id, recommended_actions")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (histErr) throw histErr;

      const totalRecommendations = (history ?? []).reduce(
        (sum, h: any) => sum + ((h.recommended_actions as any[] | null)?.length ?? 0),
        0,
      );

      const { data: decisions, error: decErr } = await supabase
        .from("decision_log")
        .select("source_analysis_id, was_correct, outcome_30d")
        .eq("user_id", user!.id)
        .not("source_analysis_id", "is", null);
      if (decErr) throw decErr;

      const followed = (decisions ?? []).length;
      const withOutcome = (decisions ?? []).filter(
        (d: any) => d.was_correct !== null || d.outcome_30d !== null,
      ).length;
      const correct = (decisions ?? []).filter((d: any) => d.was_correct === true).length;

      return {
        totalRecommendations,
        followed,
        followRate: totalRecommendations > 0 ? followed / totalRecommendations : 0,
        withOutcome,
        correct,
        hitRate: withOutcome > 0 ? correct / withOutcome : 0,
      };
    },
    enabled: !!user,
  });
}
