import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ETFMetadata {
  ticker: string;
  full_name: string | null;
  issuer: string | null;
  tracks: string | null;
  category: string | null;
  sub_category: string | null;
  geography: string | null;
  is_broad_market: boolean | null;
  asset_class_details: string | null;
  expense_ratio: number | null;
  classified_at: string;
}

export function useETFMetadata(tickers: string[]) {
  return useQuery({
    queryKey: ["etf_metadata", tickers],
    queryFn: async () => {
      if (tickers.length === 0) return {};

      const { data, error } = await supabase
        .from("etf_metadata")
        .select("*")
        .in("ticker", tickers);

      if (error) throw error;

      // Return as a map for easy lookup
      const metadataMap: Record<string, ETFMetadata> = {};
      for (const item of data || []) {
        metadataMap[item.ticker] = item as ETFMetadata;
      }
      return metadataMap;
    },
    enabled: tickers.length > 0,
  });
}
