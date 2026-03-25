import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SourceReputation {
  id: string;
  source_name: string;
  total_insights: number;
  high_conviction_insights: number;
  data_backed_insights: number;
  avg_confidence_score: number;
  style: string | null;
  first_seen_at: string;
  last_seen_at: string;
  // Derived
  quality_tier: "elite" | "reliable" | "average" | "noise";
  quality_pct: number;
}

function deriveQualityTier(avgConfidence: number, dataBackedRatio: number): "elite" | "reliable" | "average" | "noise" {
  const score = (avgConfidence * 0.6) + (dataBackedRatio * 0.4);
  if (score >= 0.75) return "elite";
  if (score >= 0.55) return "reliable";
  if (score >= 0.35) return "average";
  return "noise";
}

export function useSourceReputation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ["source_reputation", user?.id],
    queryFn: async (): Promise<SourceReputation[]> => {
      const { data, error } = await supabase
        .from("newsletter_sources" as any)
        .select("*")
        .order("avg_confidence_score", { ascending: false });
      if (error) throw error;

      return ((data ?? []) as any[]).map(s => {
        const dataBackedRatio = s.total_insights > 0
          ? s.data_backed_insights / s.total_insights
          : 0;
        return {
          ...s,
          quality_tier: deriveQualityTier(s.avg_confidence_score, dataBackedRatio),
          quality_pct: Math.round(s.avg_confidence_score * 100),
        };
      });
    },
    enabled: !!user,
  });

  // Rebuild reputation scores from existing insights
  const rebuildReputation = useMutation({
    mutationFn: async () => {
      if (!user) return;

      // Fetch all processed newsletters with their insights
      const { data: newsletters } = await supabase
        .from("newsletters")
        .select("id, source_name, created_at")
        .eq("processed", true);

      if (!newsletters || newsletters.length === 0) return;

      const { data: insights } = await supabase
        .from("insights")
        .select("newsletter_id, metadata")
        .in("newsletter_id", newsletters.map(n => n.id));

      // Group by source name
      const sourceMap: Record<string, {
        source_name: string;
        total: number;
        high_conviction: number;
        data_backed: number;
        confidence_scores: number[];
        first_seen: string;
        last_seen: string;
        style: string | null;
      }> = {};

      for (const newsletter of newsletters) {
        const name = newsletter.source_name;
        if (!sourceMap[name]) {
          sourceMap[name] = {
            source_name: name,
            total: 0,
            high_conviction: 0,
            data_backed: 0,
            confidence_scores: [],
            first_seen: newsletter.created_at,
            last_seen: newsletter.created_at,
            style: null,
          };
        }

        const src = sourceMap[name];
        if (newsletter.created_at < src.first_seen) src.first_seen = newsletter.created_at;
        if (newsletter.created_at > src.last_seen) src.last_seen = newsletter.created_at;
      }

      for (const insight of insights ?? []) {
        const newsletter = newsletters.find(n => n.id === insight.newsletter_id);
        if (!newsletter) continue;

        const name = newsletter.source_name;
        const src = sourceMap[name];
        const meta = insight.metadata as any;

        src.total++;

        if (meta?.source_confidence) {
          src.confidence_scores.push(meta.source_confidence);
        }

        if (meta?.source_confidence >= 0.8 || meta?.conviction_level === "high") {
          src.high_conviction++;
        }

        if (meta?.data_backed === true) {
          src.data_backed++;
        }
      }

      // Upsert all sources
      const upserts = Object.values(sourceMap).map(src => ({
        user_id: user.id,
        source_name: src.source_name,
        total_insights: src.total,
        high_conviction_insights: src.high_conviction,
        data_backed_insights: src.data_backed,
        avg_confidence_score: src.confidence_scores.length > 0
          ? src.confidence_scores.reduce((a, b) => a + b, 0) / src.confidence_scores.length
          : 0.5,
        first_seen_at: src.first_seen,
        last_seen_at: src.last_seen,
      }));

      if (upserts.length > 0) {
        await supabase
          .from("newsletter_sources" as any)
          .upsert(upserts, { onConflict: "user_id,source_name" });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["source_reputation"] });
    },
  });

  const eliteSources = sources.filter(s => s.quality_tier === "elite");
  const noiseSources = sources.filter(s => s.quality_tier === "noise");

  return {
    sources,
    isLoading,
    eliteSources,
    noiseSources,
    rebuildReputation: rebuildReputation.mutate,
    isRebuilding: rebuildReputation.isPending,
  };
}
