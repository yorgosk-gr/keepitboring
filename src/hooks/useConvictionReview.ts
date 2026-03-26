import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePositions } from "./usePositions";
import { toast } from "sonner";
import { subDays } from "date-fns";

export interface PositionReview {
  id: string;
  ticker: string;
  review_type: "conviction_check" | "volatility_alert" | "thesis_drift" | "anniversary";
  triggered_at: string;
  dismissed_at: string | null;
  notes: string | null;
  original_thesis: string | null;
  original_confidence: number | null;
  price_at_trigger: number | null;
  price_change_pct: number | null;
}

export function useConvictionReview() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { positions, isLoading: positionsLoading } = usePositions();

  // Fetch undismissed reviews
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ["position_reviews", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("position_reviews" as any)
        .select("*")
        .eq("user_id", user!.id)
        .is("dismissed_at", null)
        .order("triggered_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PositionReview[];
    },
    enabled: !!user,
  });

  // Generate reviews based on current positions
  const generateReviews = useMutation({
    mutationFn: async () => {
      if (!user || positions.length === 0 || positionsLoading) return [];
      const newReviews: any[] = [];
      const now = new Date();
      const ninetyDaysAgo = subDays(now, 90);

      for (const pos of positions) {
        // High conviction positions not reviewed in 90+ days
        if (
          (pos.confidence_level ?? 0) >= 7 &&
          pos.last_review_date &&
          new Date(pos.last_review_date) < ninetyDaysAgo
        ) {
          newReviews.push({
            user_id: user.id,
            ticker: pos.ticker,
            review_type: "conviction_check",
            original_thesis: pos.thesis_notes,
            original_confidence: pos.confidence_level,
            price_at_trigger: pos.current_price,
          });
        }

        // Low conviction positions (legacy holds) not actioned
        if (
          (pos.confidence_level ?? 10) <= 4 &&
          pos.bet_type === "legacy_hold"
        ) {
          newReviews.push({
            user_id: user.id,
            ticker: pos.ticker,
            review_type: "thesis_drift",
            original_thesis: pos.thesis_notes,
            original_confidence: pos.confidence_level,
            price_at_trigger: pos.current_price,
          });
        }
      }

      if (newReviews.length === 0) return [];

      // Check which ones don't already have an active review
      const tickers = newReviews.map(r => r.ticker);
      const { data: existing } = await supabase
        .from("position_reviews" as any)
        .select("ticker, review_type")
        .eq("user_id", user.id)
        .in("ticker", tickers)
        .is("dismissed_at", null);

      const existingKeys = new Set(
        (existing ?? []).map((r: any) => `${r.ticker}-${r.review_type}`)
      );

      const toInsert = newReviews.filter(
        r => !existingKeys.has(`${r.ticker}-${r.review_type}`)
      );

      if (toInsert.length > 0) {
        await supabase.from("position_reviews" as any).insert(toInsert);
      }

      return toInsert;
    },
    onSuccess: (inserted) => {
      if (inserted.length > 0) {
        queryClient.invalidateQueries({ queryKey: ["position_reviews"] });
      }
    },
  });

  // Dismiss a review
  const dismissReview = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      const { error } = await supabase
        .from("position_reviews" as any)
        .update({ dismissed_at: new Date().toISOString(), notes: notes ?? null })
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["position_reviews"] });
      toast.success("Review dismissed");
    },
  });

  const convictionChecks = reviews.filter(r => r.review_type === "conviction_check");
  const thesisDrifts = reviews.filter(r => r.review_type === "thesis_drift");
  const volatilityAlerts = reviews.filter(r => r.review_type === "volatility_alert");

  return {
    reviews,
    convictionChecks,
    thesisDrifts,
    volatilityAlerts,
    isLoading,
    generateReviews: generateReviews.mutate,
    dismissReview: dismissReview.mutate,
    isDismissing: dismissReview.isPending,
    totalPending: reviews.length,
  };
}
