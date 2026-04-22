import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface TickerMention {
  ticker: string;
  insightId: string;
  content: string;
  sentiment: string | null;
  insightType: string | null;
  newsletterName: string | null;
  createdAt: string;
}

/** Map of ticker → recent newsletter mentions */
export type TickerMentionsMap = Record<string, TickerMention[]>;

export function useTickerMentions(heldTickers: string[]) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["ticker-mentions", user?.id, [...heldTickers].sort().join(",")],
    queryFn: async (): Promise<TickerMentionsMap> => {
      if (heldTickers.length === 0) return {};

      // Query insights that mention any of our held tickers (last 90 days)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);

      const { data, error } = await supabase
        .from("insights")
        .select(`
          id,
          content,
          tickers_mentioned,
          sentiment,
          insight_type,
          created_at,
          newsletters!inner(title, source_name)
        `)
        .overlaps("tickers_mentioned", heldTickers)
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      const map: TickerMentionsMap = {};
      for (const row of data ?? []) {
        const tickers = (row.tickers_mentioned as string[]) ?? [];
        const nl = (row.newsletters as any);
        const newsletterName = nl?.title ?? nl?.source_name ?? null;

        for (const ticker of tickers) {
          if (!heldTickers.includes(ticker)) continue;
          if (!map[ticker]) map[ticker] = [];
          map[ticker].push({
            ticker,
            insightId: row.id,
            content: row.content ?? "",
            sentiment: row.sentiment,
            insightType: row.insight_type,
            newsletterName,
            createdAt: row.created_at ?? "",
          });
        }
      }

      return map;
    },
    enabled: !!user && heldTickers.length > 0,
    staleTime: 5 * 60_000,
  });
}
