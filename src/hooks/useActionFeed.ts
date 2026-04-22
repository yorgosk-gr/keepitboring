import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIBCurrentWeights } from "./useIBCurrentWeights";

export type ActionSource =
  | "rebalance"
  | "conviction_review"
  | "thesis_missing"
  | "newsletter_bearish"
  | "stale_data";

export type ActionSeverity = "critical" | "warning" | "info";

export interface ActionItem {
  id: string;
  source: ActionSource;
  ticker?: string;
  title: string;
  severity: ActionSeverity;
  link?: string;
  dismissible?: boolean;
  _reviewIds?: string[];
}

export function useActionFeed() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { weights, cashWeight, totalValue } = useIBCurrentWeights();
  const heldTickers = useMemo(() => Object.keys(weights), [weights]);

  // 1. Undismissed conviction reviews
  const reviewsQuery = useQuery({
    queryKey: ["action-feed-reviews", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("position_reviews" as any)
        .select("id, ticker, review_type, triggered_at, price_change_pct")
        .eq("user_id", user!.id)
        .is("dismissed_at", null)
        .order("triggered_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // 2. Bearish newsletter mentions (last 14 days)
  const mentionsQuery = useQuery({
    queryKey: ["action-feed-mentions", user?.id, [...heldTickers].sort().join(",")],
    queryFn: async () => {
      if (heldTickers.length === 0) return [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);

      const { data, error } = await supabase
        .from("insights")
        .select("id, content, tickers_mentioned, sentiment, created_at")
        .overlaps("tickers_mentioned", heldTickers)
        .eq("sentiment", "bearish")
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && heldTickers.length > 0,
    staleTime: 5 * 60_000,
  });

  // 4. Positions missing thesis
  const positionsQuery = useQuery({
    queryKey: ["action-feed-thesis", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ib_positions")
        .select("symbol")
        .eq("user_id", user!.id);
      if (error) throw error;

      const symbols = (data ?? []).map((p: any) => p.symbol);
      if (symbols.length === 0) return { total: 0, missing: 0 };

      const { data: annotations } = await supabase
        .from("positions")
        .select("ticker, thesis_notes")
        .eq("user_id", user!.id)
        .in("ticker", symbols);

      const annotated = new Set((annotations ?? []).filter((a) => a.thesis_notes).map((a) => a.ticker));
      return { total: symbols.length, missing: symbols.length - annotated.size };
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // 5. Stale data check
  const stalenessQuery = useQuery({
    queryKey: ["action-feed-staleness", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("portfolio_snapshots")
        .select("created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Dismiss conviction reviews
  const dismissReview = useMutation({
    mutationFn: async (reviewIds: string[]) => {
      for (const id of reviewIds) {
        await supabase
          .from("position_reviews" as any)
          .update({ dismissed_at: new Date().toISOString() } as any)
          .eq("id", id)
          .eq("user_id", user!.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-feed-reviews"] });
    },
  });

  const dismissKey = user?.id ? `action-feed-dismissed-v1:${user.id}` : null;
  const [dismissedKeys, setDismissedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!dismissKey) return;
    try {
      const raw = localStorage.getItem(dismissKey);
      setDismissedKeys(new Set(raw ? JSON.parse(raw) : []));
    } catch {
      setDismissedKeys(new Set());
    }
  }, [dismissKey]);

  useEffect(() => {
    if (!dismissKey) return;
    try {
      localStorage.setItem(dismissKey, JSON.stringify([...dismissedKeys]));
    } catch {}
  }, [dismissKey, dismissedKeys]);

  const dismiss = (item: ActionItem) => {
    if (item._reviewIds) {
      dismissReview.mutate(item._reviewIds);
      return;
    }
    setDismissedKeys((prev) => new Set(prev).add(item.id));
  };

  const actions = useMemo(() => {
    const items: ActionItem[] = [];

    // Conviction reviews — actionable: "Review your thesis on X"
    const reviews = reviewsQuery.data ?? [];
    if (reviews.length > 0) {
      const volatility = reviews.filter((r: any) => r.review_type === "volatility_alert");
      const others = reviews.filter((r: any) => r.review_type !== "volatility_alert");

      if (volatility.length > 0) {
        const tickers = volatility.map((r: any) => r.ticker).join(", ");
        const topMove = volatility.reduce((best: any, r: any) =>
          Math.abs(r.price_change_pct ?? 0) > Math.abs(best.price_change_pct ?? 0) ? r : best
        , volatility[0]);
        items.push({
          id: "vol-reviews",
          source: "conviction_review",
          ticker: volatility[0].ticker,
          title: `${tickers} moved sharply (${topMove.price_change_pct > 0 ? "+" : ""}${Number(topMove.price_change_pct).toFixed(0)}%) — review thesis`,
          severity: "critical",
          link: "/portfolio",
          dismissible: true,
          _reviewIds: volatility.map((r: any) => r.id),
        });
      }

      if (others.length > 0) {
        const tickers = others.map((r: any) => r.ticker).join(", ");
        items.push({
          id: "other-reviews",
          source: "conviction_review",
          ticker: others[0].ticker,
          title: `Review due: ${tickers}`,
          severity: "info",
          link: "/portfolio",
          dismissible: true,
          _reviewIds: others.map((r: any) => r.id),
        });
      }
    }

    // Bearish newsletter mentions — "heads up" on held positions
    const bearishMentions = mentionsQuery.data ?? [];
    if (bearishMentions.length > 0) {
      const mentionedTickers = new Set<string>();
      for (const m of bearishMentions) {
        for (const t of (m.tickers_mentioned as string[]) ?? []) {
          if (heldTickers.includes(t)) mentionedTickers.add(t);
        }
      }
      if (mentionedTickers.size > 0) {
        const tickerList = [...mentionedTickers].sort();
        items.push({
          id: `bearish-mentions:${tickerList.join(",")}`,
          source: "newsletter_bearish",
          title: `Bearish signals on ${tickerList.join(", ")} in recent newsletters`,
          severity: "warning",
          link: "/newsletters",
          dismissible: true,
        });
      }
    }

    // Missing thesis — nudge to add
    const thesisData = positionsQuery.data;
    if (thesisData && thesisData.missing > 0 && thesisData.missing >= thesisData.total * 0.5) {
      items.push({
        id: "missing-thesis",
        source: "thesis_missing",
        title: `${thesisData.missing} of ${thesisData.total} positions have no thesis — add one`,
        severity: "info",
        link: "/portfolio",
      });
    }

    // Stale data
    if (stalenessQuery.data?.created_at) {
      const daysSince = Math.floor(
        (Date.now() - new Date(stalenessQuery.data.created_at).getTime()) / 86_400_000
      );
      if (daysSince >= 7) {
        const bucket = daysSince >= 30 ? "30+" : daysSince >= 14 ? "14+" : "7+";
        items.push({
          id: `stale-prices:${bucket}`,
          source: "stale_data",
          title: `Prices are ${daysSince} days old — refresh needed`,
          severity: daysSince >= 14 ? "critical" : "warning",
          link: "/portfolio",
          dismissible: true,
        });
      }
    }

    // Sort: critical > warning > info
    const severityOrder: Record<ActionSeverity, number> = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return items.filter((i) => !dismissedKeys.has(i.id));
  }, [reviewsQuery.data, mentionsQuery.data, positionsQuery.data, stalenessQuery.data, heldTickers, dismissedKeys]);

  const isLoading = reviewsQuery.isLoading;

  return { actions, isLoading, dismiss };
}
