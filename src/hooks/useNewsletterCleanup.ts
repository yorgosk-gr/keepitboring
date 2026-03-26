import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { subDays, subMonths, startOfWeek, format } from "date-fns";

export interface CleanupPreview {
  archiveOld: {
    count: number;
    newsletters: { id: string; source_name: string; upload_date: string }[];
  };
  duplicateInsights: {
    count: number;
    groups: { ticker: string; sentiment: string; week: string; keepId: string; removeIds: string[] }[];
  };
  oldUnstarred: {
    count: number;
    insightIds: string[];
  };
}

export function useNewsletterCleanup() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Get preview of what cleanup actions would affect
  const getCleanupPreview = async (): Promise<CleanupPreview> => {
    if (!user) throw new Error("Not authenticated");
    const now = new Date();
    const ninetyDaysAgo = subDays(now, 90);
    const sixMonthsAgo = subMonths(now, 6);

    // 1. Newsletters older than 90 days that aren't archived
    const { data: oldNewsletters } = await supabase
      .from("newsletters")
      .select("id, source_name, upload_date")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .lt("created_at", ninetyDaysAgo.toISOString());

    // Get all user newsletter IDs to scope insight queries
    const { data: userNewsletters } = await supabase
      .from("newsletters")
      .select("id")
      .eq("user_id", user.id);
    const userNewsletterIds = (userNewsletters ?? []).map(n => n.id);

    // 2. Find duplicate insights (same ticker + sentiment in same week)
    const { data: insights } = userNewsletterIds.length > 0
      ? await supabase
          .from("insights")
          .select("id, tickers_mentioned, sentiment, created_at, newsletter_id")
          .in("newsletter_id", userNewsletterIds)
          .order("created_at", { ascending: false })
      : { data: [] };

    const duplicateGroups: CleanupPreview["duplicateInsights"]["groups"] = [];
    const groupMap = new Map<string, string[]>();

    insights?.forEach((insight) => {
      const tickers = insight.tickers_mentioned ?? [];
      const sentiment = insight.sentiment ?? "neutral";
      const week = format(startOfWeek(new Date(insight.created_at)), "yyyy-ww");

      tickers.forEach((ticker) => {
        const key = `${ticker}-${sentiment}-${week}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, []);
        }
        groupMap.get(key)!.push(insight.id);
      });
    });

    groupMap.forEach((ids, key) => {
      if (ids.length > 1) {
        const [ticker, sentiment, week] = key.split("-");
        duplicateGroups.push({
          ticker,
          sentiment,
          week,
          keepId: ids[0], // Keep most recent
          removeIds: ids.slice(1),
        });
      }
    });

    const totalDuplicates = duplicateGroups.reduce(
      (sum, g) => sum + g.removeIds.length,
      0
    );

    // 3. Old unstarred insights (older than 6 months, not starred) — scoped to user
    const { data: oldInsights } = userNewsletterIds.length > 0
      ? await supabase
          .from("insights")
          .select("id")
          .in("newsletter_id", userNewsletterIds)
          .eq("is_starred", false)
          .lt("created_at", sixMonthsAgo.toISOString())
      : { data: [] };

    return {
      archiveOld: {
        count: oldNewsletters?.length ?? 0,
        newsletters: oldNewsletters ?? [],
      },
      duplicateInsights: {
        count: totalDuplicates,
        groups: duplicateGroups,
      },
      oldUnstarred: {
        count: oldInsights?.length ?? 0,
        insightIds: oldInsights?.map((i) => i.id) ?? [],
      },
    };
  };

  // Archive newsletters older than 90 days
  const archiveOldNewsletters = useMutation({
    mutationFn: async () => {
      const ninetyDaysAgo = subDays(new Date(), 90);

      const { data, error } = await supabase
        .from("newsletters")
        .update({ is_archived: true })
        .eq("is_archived", false)
        .lt("created_at", ninetyDaysAgo.toISOString())
        .select("id");

      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      queryClient.invalidateQueries({ queryKey: ["insight-stats"] });
      toast.success(`Archived ${count} newsletters`);
    },
    onError: (error) => {
      toast.error("Failed to archive: " + error.message);
    },
  });

  // Remove duplicate insights
  const removeDuplicates = useMutation({
    mutationFn: async (preview: CleanupPreview) => {
      const idsToRemove = preview.duplicateInsights.groups.flatMap(
        (g) => g.removeIds
      );

      if (idsToRemove.length === 0) return 0;

      const { error } = await supabase
        .from("insights")
        .delete()
        .in("id", idsToRemove);

      if (error) throw error;
      return idsToRemove.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      queryClient.invalidateQueries({ queryKey: ["insight-stats"] });
      toast.success(`Removed ${count} duplicate insights`);
    },
    onError: (error) => {
      toast.error("Failed to remove duplicates: " + error.message);
    },
  });

  // Clear old unstarred insights
  const clearOldUnstarred = useMutation({
    mutationFn: async (insightIds: string[]) => {
      if (insightIds.length === 0) return 0;

      const { error } = await supabase
        .from("insights")
        .delete()
        .in("id", insightIds);

      if (error) throw error;
      return insightIds.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      queryClient.invalidateQueries({ queryKey: ["insights"] });
      queryClient.invalidateQueries({ queryKey: ["insight-stats"] });
      toast.success(`Cleared ${count} old unstarred insights`);
    },
    onError: (error) => {
      toast.error("Failed to clear: " + error.message);
    },
  });

  // Archive/unarchive a single newsletter
  const toggleArchive = useMutation({
    mutationFn: async ({ id, isArchived }: { id: string; isArchived: boolean }) => {
      const { error } = await supabase
        .from("newsletters")
        .update({ is_archived: isArchived })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, { isArchived }) => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      queryClient.invalidateQueries({ queryKey: ["insight-stats"] });
      toast.success(isArchived ? "Newsletter archived" : "Newsletter unarchived");
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  return {
    getCleanupPreview,
    archiveOldNewsletters: archiveOldNewsletters.mutateAsync,
    isArchiving: archiveOldNewsletters.isPending,
    removeDuplicates: removeDuplicates.mutateAsync,
    isRemovingDuplicates: removeDuplicates.isPending,
    clearOldUnstarred: clearOldUnstarred.mutateAsync,
    isClearing: clearOldUnstarred.isPending,
    toggleArchive: toggleArchive.mutate,
    isTogglingArchive: toggleArchive.isPending,
  };
}
