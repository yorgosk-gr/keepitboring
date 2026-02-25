import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PriceUpdate {
  ticker: string;
  current_price: number;    // USD-converted price
  local_price: number;      // price in original currency
  currency: string;         // original currency
  fx_rate: number;          // 1 local = fx_rate USD
  price_date: string;
  source: string;
}

interface PriceRefreshProgress {
  current: number;
  total: number;
  status: "idle" | "fetching" | "complete" | "error";
}

export interface TickerInfo {
  ticker: string;
  currency?: string;
  exchange?: string;
  instrumentType?: string;
}

const BATCH_SIZE = 10;

export function usePriceRefresh() {
  const [isFetching, setIsFetching] = useState(false);
  const [progress, setProgress] = useState<PriceRefreshProgress>({
    current: 0,
    total: 0,
    status: "idle",
  });

  const fetchPrices = useCallback(async (
    tickers: (string | TickerInfo)[]
  ): Promise<{ prices: PriceUpdate[]; notFound: string[] }> => {
    if (tickers.length === 0) return { prices: [], notFound: [] };

    const items: TickerInfo[] = tickers.map(t =>
      typeof t === "string" ? { ticker: t } : t
    );

    setIsFetching(true);
    setProgress({ current: 0, total: items.length, status: "fetching" });

    const allPrices: PriceUpdate[] = [];
    const allNotFound: string[] = [];
    const batches: TickerInfo[][] = [];

    // Split into batches
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const startIndex = i * BATCH_SIZE;

        setProgress({
          current: startIndex + 1,
          total: items.length,
          status: "fetching",
        });

        const { data, error } = await supabase.functions.invoke("refresh-prices", {
          body: { tickers: batch },
        });

        if (error) {
          console.error("Price fetch error:", error);
          allNotFound.push(...batch.map(b => b.ticker));
          continue;
        }

        if (data?.prices) {
          allPrices.push(...data.prices);
        }
        
        if (data?.not_found) {
          allNotFound.push(...data.not_found);
        }

        // Add a small delay between batches to avoid rate limiting
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      setProgress({ current: items.length, total: items.length, status: "complete" });
      return { prices: allPrices, notFound: allNotFound };

    } catch (error) {
      console.error("Price fetch failed:", error);
      setProgress({ current: 0, total: items.length, status: "error" });
      toast.error("Price refresh failed. Please try again.");
      return { prices: [], notFound: items.map(i => i.ticker) };

    } finally {
      setIsFetching(false);
    }
  }, []);

  return {
    fetchPrices,
    isFetching,
    progress,
  };
}
