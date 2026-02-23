import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Position } from "./usePositions";

export interface Fundamentals {
  roic: number | null;
  earnings_yield: number | null;
  pe_ratio: number | null;
  debt_to_equity: number | null;
  revenue_growth_yoy: number | null;
  free_cash_flow_yield: number | null;
  gross_margin: number | null;
  data_quality: "estimated" | "approximate";
  notes: string;
}

interface FundamentalsProgress {
  current: number;
  total: number;
  status: "idle" | "fetching" | "complete" | "error";
}

const BATCH_SIZE = 6;

export function useFundamentals() {
  const [isFetching, setIsFetching] = useState(false);
  const [progress, setProgress] = useState<FundamentalsProgress>({
    current: 0,
    total: 0,
    status: "idle",
  });
  const queryClient = useQueryClient();

  const fetchFundamentals = useCallback(async (positions: Position[]) => {
    // Only fetch for stocks, not ETFs
    const stockPositions = positions.filter(p => p.position_type === "stock");

    if (stockPositions.length === 0) {
      toast.info("No stock positions to fetch fundamentals for");
      return;
    }

    setIsFetching(true);
    setProgress({ current: 0, total: stockPositions.length, status: "fetching" });

    try {
      // Process in batches
      const batches: Position[][] = [];
      for (let i = 0; i < stockPositions.length; i += BATCH_SIZE) {
        batches.push(stockPositions.slice(i, i + BATCH_SIZE));
      }

      let totalUpdated = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const tickers = batch.map(p => p.ticker);

        setProgress({
          current: i * BATCH_SIZE + 1,
          total: stockPositions.length,
          status: "fetching",
        });

        const { data, error } = await supabase.functions.invoke("fetch-fundamentals", {
          body: { tickers },
        });

        if (error) {
          console.error("Fundamentals fetch error:", error);
          toast.error(`Failed to fetch fundamentals for batch ${i + 1}`);
          continue;
        }

        if (data?.fundamentals) {
          for (const pos of batch) {
            const fundData = data.fundamentals[pos.ticker];
            if (fundData) {
              const { error: updateError } = await supabase
                .from("positions")
                .update({
                  fundamentals: fundData as any,
                  last_fundamentals_refresh: new Date().toISOString(),
                })
                .eq("id", pos.id);

              if (!updateError) totalUpdated++;
            }
          }
        }

        // Delay between batches
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      setProgress({ current: stockPositions.length, total: stockPositions.length, status: "complete" });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      toast.success(`Fetched fundamentals for ${totalUpdated} stocks`);
    } catch (error) {
      console.error("Fundamentals fetch failed:", error);
      setProgress({ current: 0, total: stockPositions.length, status: "error" });
      toast.error("Failed to fetch fundamentals");
    } finally {
      setIsFetching(false);
    }
  }, [queryClient]);

  return {
    fetchFundamentals,
    isFetching,
    progress,
  };
}
