import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import type { PriceUpdate } from "@/hooks/usePriceRefresh";

export interface VolatilityAlert {
  ticker: string;
  changePct: number;
  direction: "up" | "down";
  currentPrice: number;
  thesis: string | null;
  invalidationTrigger: string | null;
  confidence: number | null;
}

const VOLATILITY_THRESHOLD = 0.10; // 10%

export function useVolatilityAlerts() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const checkVolatility = useCallback(async (
    priceUpdates: PriceUpdate[],
    previousPrices: Record<string, number>
  ): Promise<VolatilityAlert[]> => {
    if (!user || priceUpdates.length === 0) return [];

    const alerts: VolatilityAlert[] = [];
    const reviewsToInsert: any[] = [];

    // Find significant movers
    const bigMovers = priceUpdates.filter(update => {
      const prev = previousPrices[update.ticker];
      if (!prev || prev === 0) return false;
      const changePct = Math.abs((update.current_price - prev) / prev);
      return changePct >= VOLATILITY_THRESHOLD;
    });

    if (bigMovers.length === 0) return [];

    // Fetch thesis notes for affected tickers
    const { data: annotations } = await supabase
      .from("positions")
      .select("ticker, thesis_notes, invalidation_trigger, confidence_level, bet_type")
      .eq("user_id", user.id)
      .in("ticker", bigMovers.map(m => m.ticker));

    const annotationMap: Record<string, any> = {};
    for (const ann of annotations ?? []) {
      annotationMap[ann.ticker] = ann;
    }

    for (const update of bigMovers) {
      const prev = previousPrices[update.ticker];
      const changePct = (update.current_price - prev) / prev;
      const ann = annotationMap[update.ticker];

      const alert: VolatilityAlert = {
        ticker: update.ticker,
        changePct: changePct * 100,
        direction: changePct > 0 ? "up" : "down",
        currentPrice: update.current_price,
        thesis: ann?.thesis_notes ?? null,
        invalidationTrigger: ann?.invalidation_trigger ?? null,
        confidence: ann?.confidence_level ?? null,
      };

      alerts.push(alert);

      // Create a position review record for significant drops
      if (changePct <= -VOLATILITY_THRESHOLD) {
        reviewsToInsert.push({
          user_id: user.id,
          ticker: update.ticker,
          review_type: "volatility_alert",
          original_thesis: ann?.thesis_notes ?? null,
          original_confidence: ann?.confidence_level ?? null,
          price_at_trigger: update.current_price,
          price_change_pct: changePct * 100,
        });
      }
    }

    // Insert reviews for drops
    if (reviewsToInsert.length > 0) {
      await supabase.from("position_reviews" as any).insert(reviewsToInsert);
      queryClient.invalidateQueries({ queryKey: ["position_reviews"] });
    }

    return alerts;
  }, [user, queryClient]);

  return { checkVolatility };
}
