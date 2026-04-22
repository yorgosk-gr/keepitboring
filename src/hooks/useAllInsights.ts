import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface InsightWithSource {
  id: string;
  newsletter_id: string;
  insight_type: string | null;
  content: string | null;
  sentiment: string | null;
  tickers_mentioned: string[] | null;
  confidence_words: string[] | null;
  is_starred: boolean;
  quality_score: number | null;
  excluded_from_brief: boolean;
  created_at: string;
  title: string | null;
  source_name: string | null;
  upload_date: string;
}

export function useAllInsights(windowDays: number | "all" = 15) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["all_insights", user?.id, windowDays],
    queryFn: async () => {
      // Filter newsletters at the DB level rather than fetching everything and discarding.
      let newsletterQuery = supabase
        .from("newsletters")
        .select("id")
        .eq("user_id", user!.id)
        .eq("is_archived", false);

      if (windowDays !== "all") {
        const cutoff = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
        newsletterQuery = newsletterQuery.gte("created_at", cutoff);
      }

      const { data: userNewsletters } = await newsletterQuery;

      const newsletterIds = (userNewsletters ?? []).map((n: any) => n.id);
      if (newsletterIds.length === 0) return [];

      const { data, error } = await supabase
        .from("insights")
        .select("id, newsletter_id, insight_type, content, sentiment, tickers_mentioned, confidence_words, is_starred, quality_score, excluded_from_brief, created_at, newsletters(title, source_name, upload_date)")
        .in("newsletter_id", newsletterIds)
        .order("quality_score", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(2000);

      if (error) throw error;

      return (data ?? []).map((row: any) => ({
        id: row.id,
        newsletter_id: row.newsletter_id,
        insight_type: row.insight_type,
        content: row.content,
        sentiment: row.sentiment,
        tickers_mentioned: row.tickers_mentioned,
        confidence_words: row.confidence_words,
        is_starred: row.is_starred,
        quality_score: row.quality_score,
        excluded_from_brief: row.excluded_from_brief,
        created_at: row.created_at,
        title: row.newsletters?.title ?? null,
        source_name: row.newsletters?.source_name ?? null,
        upload_date: row.newsletters?.upload_date ?? "",
      })) as InsightWithSource[];
    },
    enabled: !!user,
  });

  const toggleStarMutation = useMutation({
    mutationFn: async ({ id, isStarred }: { id: string; isStarred: boolean }) => {
      const { error } = await supabase
        .from("insights")
        .update({ is_starred: isStarred })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_insights"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });

  const toggleExcludeMutation = useMutation({
    mutationFn: async ({ id, excluded }: { id: string; excluded: boolean }) => {
      const { error } = await supabase
        .from("insights")
        .update({ excluded_from_brief: excluded })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all_insights"] });
    },
  });

  return {
    insights: query.data ?? [],
    isLoading: query.isLoading,
    toggleStar: toggleStarMutation.mutate,
    toggleExclude: toggleExcludeMutation.mutate,
  };
}
