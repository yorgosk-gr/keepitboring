import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ETFMetadataItem {
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

export function useAllETFMetadata() {
  return useQuery({
    queryKey: ["etf_metadata", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etf_metadata")
        .select("*");

      if (error) throw error;

      // Return as a map for easy lookup
      const metadataMap: Record<string, ETFMetadataItem> = {};
      for (const item of data || []) {
        metadataMap[item.ticker] = item as ETFMetadataItem;
      }
      return metadataMap;
    },
  });
}
