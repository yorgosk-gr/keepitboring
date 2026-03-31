import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIBCurrentWeights } from "./useIBCurrentWeights";

export type ActionSource =
  | "conviction_review"
  | "rule_violation"
  | "north_star"
  | "newsletter_mention"
  | "stale_data";

export type ActionSeverity = "critical" | "warning" | "info";

export interface ActionItem {
  id: string;
  source: ActionSource;
  ticker?: string;
  title: string;
  description: string;
  severity: ActionSeverity;
  triggeredAt: string;
  link?: string;
}

export function useActionFeed() {
  const { user } = useAuth();
  const { weights } = useIBCurrentWeights();
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
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // 2. Unresolved rule violations
  const alertsQuery = useQuery({
    queryKey: ["action-feed-alerts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id, alert_type, severity, message, created_at")
        .eq("user_id", user!.id)
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // 3. North Star positions needing action (build/reduce/exit)
  const nsQuery = useQuery({
    queryKey: ["action-feed-northstar", user?.id],
    queryFn: async () => {
      // Get the portfolio first
      const { data: portfolio } = await supabase
        .from("north_star_portfolio" as any)
        .select("id")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!portfolio) return [];

      const { data, error } = await supabase
        .from("north_star_positions" as any)
        .select("id, ticker, name, status, target_weight_ideal, rationale")
        .eq("portfolio_id", (portfolio as any).id)
        .in("status", ["build", "reduce", "exit"])
        .order("priority", { ascending: true })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // 4. Recent newsletter mentions of held tickers (last 14 days)
  const mentionsQuery = useQuery({
    queryKey: ["action-feed-mentions", user?.id, heldTickers.sort().join(",")],
    queryFn: async () => {
      if (heldTickers.length === 0) return [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);

      const { data, error } = await supabase
        .from("insights")
        .select("id, content, tickers_mentioned, sentiment, insight_type, created_at")
        .overlaps("tickers_mentioned", heldTickers)
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && heldTickers.length > 0,
    staleTime: 5 * 60_000,
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

  const actions = useMemo(() => {
    const items: ActionItem[] = [];

    // Conviction reviews → actions
    for (const r of reviewsQuery.data ?? []) {
      const typeLabels: Record<string, string> = {
        conviction_check: "Conviction check due",
        volatility_alert: "Volatility alert",
        thesis_drift: "Thesis drift detected",
        anniversary: "Position anniversary review",
      };
      items.push({
        id: `review-${r.id}`,
        source: "conviction_review",
        ticker: r.ticker,
        title: `${r.ticker}: ${typeLabels[r.review_type] ?? r.review_type}`,
        description: r.price_change_pct
          ? `Price moved ${r.price_change_pct > 0 ? "+" : ""}${Number(r.price_change_pct).toFixed(1)}% — review your thesis`
          : "Time to review your conviction in this position",
        severity: r.review_type === "volatility_alert" ? "critical" : "warning",
        triggeredAt: r.triggered_at,
        link: "/portfolio",
      });
    }

    // Rule violations → actions
    for (const a of alertsQuery.data ?? []) {
      items.push({
        id: `alert-${a.id}`,
        source: "rule_violation",
        title: a.message.length > 60 ? a.message.substring(0, 57) + "…" : a.message,
        description: a.message,
        severity: a.severity === "critical" ? "critical" : a.severity === "warning" ? "warning" : "info",
        triggeredAt: a.created_at ?? "",
        link: "/philosophy",
      });
    }

    // North Star deviations → actions
    for (const ns of nsQuery.data ?? []) {
      const statusAction: Record<string, string> = {
        build: "Build position",
        reduce: "Reduce position",
        exit: "Exit position",
      };
      items.push({
        id: `ns-${ns.id}`,
        source: "north_star",
        ticker: ns.ticker,
        title: `${ns.ticker}: ${statusAction[ns.status] ?? ns.status}`,
        description: ns.rationale
          ? ns.rationale.substring(0, 100)
          : `Target weight: ${ns.target_weight_ideal?.toFixed(1) ?? "?"}%`,
        severity: ns.status === "exit" ? "critical" : "info",
        triggeredAt: "",
        link: "/north-star",
      });
    }

    // Newsletter mentions → actions
    for (const m of mentionsQuery.data ?? []) {
      const tickers = (m.tickers_mentioned as string[]) ?? [];
      const relevantTickers = tickers.filter(t => heldTickers.includes(t));
      if (relevantTickers.length === 0) continue;
      const tickerStr = relevantTickers.join(", ");
      items.push({
        id: `mention-${m.id}`,
        source: "newsletter_mention",
        ticker: relevantTickers[0],
        title: `${tickerStr} mentioned in newsletter`,
        description: (m.content ?? "").substring(0, 100),
        severity: m.sentiment === "bearish" ? "warning" : "info",
        triggeredAt: m.created_at ?? "",
        link: "/newsletters",
      });
    }

    // Stale data → action
    if (stalenessQuery.data?.created_at) {
      const daysSince = Math.floor(
        (Date.now() - new Date(stalenessQuery.data.created_at).getTime()) / 86_400_000
      );
      if (daysSince >= 7) {
        items.push({
          id: "stale-prices",
          source: "stale_data",
          title: "Prices may be outdated",
          description: `Last refresh was ${daysSince} days ago — consider refreshing`,
          severity: daysSince >= 14 ? "critical" : "warning",
          triggeredAt: stalenessQuery.data.created_at,
        });
      }
    }

    // Sort: critical first, then warning, then info, then by date
    const severityOrder: Record<ActionSeverity, number> = { critical: 0, warning: 1, info: 2 };
    items.sort((a, b) => {
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      if (!a.triggeredAt) return 1;
      if (!b.triggeredAt) return -1;
      return new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime();
    });

    return items;
  }, [reviewsQuery.data, alertsQuery.data, nsQuery.data, mentionsQuery.data, stalenessQuery.data, heldTickers]);

  const isLoading = reviewsQuery.isLoading || alertsQuery.isLoading || nsQuery.isLoading;

  return { actions, isLoading };
}
