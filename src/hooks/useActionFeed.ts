import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  dismissible?: boolean;
}

export function useActionFeed() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
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
        .limit(10);
      if (error) throw error;
      return (data ?? []) as any[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // 2. Unresolved rule violations (limit to 10, we'll group them)
  const alertsQuery = useQuery({
    queryKey: ["action-feed-alerts", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id, alert_type, severity, message, created_at")
        .eq("user_id", user!.id)
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(30);
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
        .limit(10);
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
        .limit(5);
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

  // Dismiss an alert (resolve it)
  const dismissAlert = useMutation({
    mutationFn: async (alertId: string) => {
      await supabase
        .from("alerts")
        .update({ resolved: true })
        .eq("id", alertId)
        .eq("user_id", user!.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-feed-alerts"] });
    },
  });

  // Dismiss a conviction review
  const dismissReview = useMutation({
    mutationFn: async (reviewId: string) => {
      await supabase
        .from("position_reviews" as any)
        .update({ dismissed_at: new Date().toISOString() } as any)
        .eq("id", reviewId)
        .eq("user_id", user!.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["action-feed-reviews"] });
    },
  });

  const dismiss = (item: ActionItem) => {
    const rawId = item.id.replace(/^(alert-|review-)/, "");
    if (item.source === "rule_violation") {
      // Dismiss all alerts in a grouped item
      const alertIds = (item as any)._alertIds ?? [rawId];
      for (const id of alertIds) {
        dismissAlert.mutate(id);
      }
    } else if (item.source === "conviction_review") {
      dismissReview.mutate(rawId);
    }
  };

  const actions = useMemo(() => {
    const items: ActionItem[] = [];

    // Conviction reviews → group by review_type, show count
    const reviewsByType = new Map<string, any[]>();
    for (const r of reviewsQuery.data ?? []) {
      const key = r.review_type;
      if (!reviewsByType.has(key)) reviewsByType.set(key, []);
      reviewsByType.get(key)!.push(r);
    }
    for (const [type, reviews] of reviewsByType) {
      const typeLabels: Record<string, string> = {
        conviction_check: "Conviction check due",
        volatility_alert: "Volatility alert",
        thesis_drift: "Thesis drift detected",
        anniversary: "Position anniversary",
      };
      const tickers = reviews.map(r => r.ticker).join(", ");
      items.push({
        id: `review-${reviews[0].id}`,
        source: "conviction_review",
        ticker: reviews[0].ticker,
        title: `${typeLabels[type] ?? type}: ${tickers}`,
        description: reviews.length > 1
          ? `${reviews.length} positions need review`
          : reviews[0].price_change_pct
            ? `Price moved ${reviews[0].price_change_pct > 0 ? "+" : ""}${Number(reviews[0].price_change_pct).toFixed(1)}%`
            : "Review your thesis",
        severity: type === "volatility_alert" ? "critical" : "warning",
        triggeredAt: reviews[0].triggered_at,
        link: "/portfolio",
        dismissible: true,
      });
    }

    // Rule violations → group by category, deduplicate
    const alerts = alertsQuery.data ?? [];
    // Categorize alerts
    const allocationAlerts: typeof alerts = [];
    const positionAlerts: typeof alerts = [];
    for (const a of alerts) {
      const msg = a.message.toLowerCase();
      if (msg.includes("percent") || msg.includes("allocation") || msg.includes("diversification")) {
        allocationAlerts.push(a);
      } else {
        positionAlerts.push(a);
      }
    }

    // Show allocation alerts as one grouped item
    if (allocationAlerts.length > 0) {
      const critCount = allocationAlerts.filter(a => a.severity === "critical").length;
      const item: ActionItem & { _alertIds?: string[] } = {
        id: `alert-${allocationAlerts[0].id}`,
        source: "rule_violation",
        title: `${allocationAlerts.length} allocation rule${allocationAlerts.length > 1 ? "s" : ""} outside target`,
        description: allocationAlerts.slice(0, 3).map(a => {
          // Extract just the metric name and value
          const match = a.message.match(/^(.+?) at ([\d.]+%)/);
          return match ? `${match[1]}: ${match[2]}` : a.message.substring(0, 40);
        }).join(" · "),
        severity: critCount > 0 ? "critical" : "warning",
        triggeredAt: allocationAlerts[0].created_at ?? "",
        link: "/philosophy",
        dismissible: true,
        _alertIds: allocationAlerts.map(a => a.id),
      };
      items.push(item);
    }

    // Show position-level alerts as one grouped item
    if (positionAlerts.length > 0) {
      const item: ActionItem & { _alertIds?: string[] } = {
        id: `alert-pos-${positionAlerts[0].id}`,
        source: "rule_violation",
        title: `${positionAlerts.length} position alert${positionAlerts.length > 1 ? "s" : ""}`,
        description: positionAlerts.slice(0, 3).map(a => a.message.substring(0, 40)).join(" · "),
        severity: "warning",
        triggeredAt: positionAlerts[0].created_at ?? "",
        link: "/portfolio",
        dismissible: true,
        _alertIds: positionAlerts.map(a => a.id),
      };
      items.push(item);
    }

    // North Star deviations → only show exit and reduce (build is low priority)
    for (const ns of (nsQuery.data ?? []).filter((n: any) => n.status === "exit" || n.status === "reduce")) {
      items.push({
        id: `ns-${ns.id}`,
        source: "north_star",
        ticker: ns.ticker,
        title: `${ns.ticker}: ${ns.status === "exit" ? "Exit position" : "Reduce position"}`,
        description: `Target: ${ns.target_weight_ideal?.toFixed(1) ?? "?"}%`,
        severity: ns.status === "exit" ? "critical" : "warning",
        triggeredAt: "",
        link: "/north-star",
      });
    }

    // Newsletter mentions → only bearish ones (actionable)
    for (const m of mentionsQuery.data ?? []) {
      if (m.sentiment !== "bearish") continue;
      const tickers = (m.tickers_mentioned as string[]) ?? [];
      const relevantTickers = tickers.filter(t => heldTickers.includes(t));
      if (relevantTickers.length === 0) continue;
      items.push({
        id: `mention-${m.id}`,
        source: "newsletter_mention",
        ticker: relevantTickers[0],
        title: `Bearish signal: ${relevantTickers.join(", ")}`,
        description: (m.content ?? "").substring(0, 80),
        severity: "warning",
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
          description: `Last refresh ${daysSince} days ago`,
          severity: daysSince >= 14 ? "critical" : "warning",
          triggeredAt: stalenessQuery.data.created_at,
        });
      }
    }

    // Sort: critical first, then warning, then info
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

  return { actions, isLoading, dismiss };
}
