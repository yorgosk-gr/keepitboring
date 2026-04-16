import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { subDays } from "date-fns";

export interface ChecklistItem {
  id: string;
  category: "rule" | "signal" | "conviction" | "recency";
  severity: "pass" | "warn" | "block";
  title: string;
  detail: string;
  source?: string;
}

export interface PreTradeChecklistResult {
  ticker: string | null;
  actionType: string;
  items: ChecklistItem[];
  canProceed: boolean;
  blockCount: number;
  warnCount: number;
  passCount: number;
}

export function usePreTradeChecklist() {
  const { user } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<PreTradeChecklistResult | null>(null);

  const runChecklist = useCallback(async (
    ticker: string | null,
    actionType: string,
    positionId: string | null
  ) => {
    if (!user) return;
    setIsChecking(true);
    setResult(null);

    const items: ChecklistItem[] = [];

    try {
      // 1. Check philosophy rules for position sizing
      const { data: rules } = await supabase
        .from("philosophy_rules")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (ticker && (actionType === "buy" || actionType === "add")) {
        // Check single position size rules
        const sizeRules = (rules ?? []).filter(r =>
          r.rule_type === "position_size" || r.category === "size"
        );

        if (sizeRules.length > 0) {
          // Get current position weight
          const { data: ibPos } = await supabase
            .from("ib_positions")
            .select("percent_of_nav")
            .eq("user_id", user.id)
            .eq("symbol", ticker)
            .maybeSingle();

          const currentWeight = ibPos?.percent_of_nav ?? 0;

          for (const rule of sizeRules) {
            const max = rule.threshold_max;
            if (max && currentWeight >= max * 0.8) {
              items.push({
                id: `rule-size-${rule.id}`,
                category: "rule",
                severity: currentWeight >= max ? "block" : "warn",
                title: `Position size rule: ${rule.name}`,
                detail: `${ticker} is at ${currentWeight.toFixed(1)}% of portfolio. Rule max: ${max}%. ${rule.message_on_breach || ""}`,
                source: rule.source_books?.join(", ") ?? undefined,
              });
            }
          }
        }

        // Check allocation rules — buying more equity when already at max
        const allocationRules = (rules ?? []).filter(r =>
          r.category === "allocation" && r.rule_enforcement === "hard"
        );

        if (allocationRules.length > 0) {
          const { data: account } = await supabase
            .from("ib_accounts")
            .select("cash_balance")
            .eq("user_id", user.id)
            .maybeSingle();

          const cashBalance = account?.cash_balance ?? 0;

          if (cashBalance < 500) {
            items.push({
              id: "rule-cash",
              category: "rule",
              severity: "warn",
              title: "Low cash balance",
              detail: `Cash is ~$${Math.round(cashBalance)}. Buying requires selling another position first. Check allocation rules before proceeding.`,
            });
          }
        }
      }

      // 2. Check recent newsletter signals on this ticker
      if (ticker) {
        const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
        const { data: signals } = await supabase
          .from("insights")
          .select("*, newsletters(source_name, created_at)")
          .contains("tickers_mentioned", [ticker])
          .gte("created_at", thirtyDaysAgo)
          .order("created_at", { ascending: false })
          .limit(5);

        if (signals && signals.length > 0) {
          const bullish = signals.filter(s => s.sentiment === "bullish");
          const bearish = signals.filter(s => s.sentiment === "bearish");

          if (actionType === "buy" || actionType === "add") {
            if (bearish.length > bullish.length) {
              items.push({
                id: "signal-bearish",
                category: "signal",
                severity: "warn",
                title: `${bearish.length} bearish signal${bearish.length > 1 ? "s" : ""} on ${ticker} in last 30 days`,
                detail: bearish.slice(0, 2).map(s =>
                  `[${(s.newsletters as any)?.source_name ?? "Newsletter"}] ${s.content?.substring(0, 100)}...`
                ).join(" | "),
              });
            } else if (bullish.length > 0) {
              items.push({
                id: "signal-bullish",
                category: "signal",
                severity: "pass",
                title: `${bullish.length} bullish signal${bullish.length > 1 ? "s" : ""} on ${ticker} in last 30 days`,
                detail: bullish.slice(0, 1).map(s =>
                  `[${(s.newsletters as any)?.source_name ?? "Newsletter"}] ${s.content?.substring(0, 120)}...`
                ).join(""),
              });
            }
          } else if (actionType === "sell" || actionType === "trim") {
            if (bullish.length > bearish.length) {
              items.push({
                id: "signal-conflicting",
                category: "signal",
                severity: "warn",
                title: `${bullish.length} bullish signal${bullish.length > 1 ? "s" : ""} on ${ticker} conflict with sell intent`,
                detail: bullish.slice(0, 2).map(s =>
                  `[${(s.newsletters as any)?.source_name ?? "Newsletter"}] ${s.content?.substring(0, 100)}...`
                ).join(" | "),
              });
            }
          }
        } else {
          items.push({
            id: "signal-none",
            category: "signal",
            severity: "pass",
            title: `No recent newsletter signals on ${ticker}`,
            detail: "No signals found in the last 30 days. Decision based on your own analysis.",
          });
        }
      }

      // 3. Check conviction level on existing position
      if (ticker && positionId) {
        const { data: annotation } = await supabase
          .from("positions")
          .select("confidence_level, thesis_notes, bet_type, invalidation_trigger")
          .eq("user_id", user.id)
          .eq("ticker", ticker)
          .maybeSingle();

        if (annotation) {
          const confidence = annotation.confidence_level ?? 5;

          if ((actionType === "sell" || actionType === "trim") && confidence >= 8) {
            items.push({
              id: "conviction-high",
              category: "conviction",
              severity: "warn",
              title: `High conviction position (${confidence}/10) — are you sure?`,
              detail: annotation.thesis_notes
                ? `Your thesis: "${annotation.thesis_notes.substring(0, 150)}..."`
                : "You rated this position as high conviction. Consider whether your thesis has changed.",
            });
          }

          if ((actionType === "buy" || actionType === "add") && confidence <= 3) {
            items.push({
              id: "conviction-low",
              category: "conviction",
              severity: "warn",
              title: `Low conviction position (${confidence}/10) — adding to a weak conviction?`,
              detail: "You rated this position as low conviction. Consider exiting instead of adding.",
            });
          }

          if (annotation.invalidation_trigger && (actionType === "sell" || actionType === "trim")) {
            items.push({
              id: "conviction-invalidation",
              category: "conviction",
              severity: "pass",
              title: "Invalidation trigger defined",
              detail: `Your invalidation trigger: "${annotation.invalidation_trigger}". Confirm this has been met.`,
            });
          }
        }
      }

      // 4. Check recency — have you traded this recently?
      if (ticker) {
        const sevenDaysAgo = subDays(new Date(), 7).toISOString();
        const { data: recentDecisions } = await supabase
          .from("decision_log" as any)
          .select("action_type, created_at")
          .eq("ticker", ticker)
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false });

        if (recentDecisions && recentDecisions.length > 0) {
          items.push({
            id: "recency",
            category: "recency",
            severity: "warn",
            title: `You already logged a ${(recentDecisions[0] as any).action_type} on ${ticker} this week`,
            detail: "Multiple decisions on the same position in a short period may indicate emotional trading. Pause and reflect.",
          });
        }
      }

      // If no items at all, add a pass
      if (items.length === 0) {
        items.push({
          id: "all-clear",
          category: "rule",
          severity: "pass",
          title: "All checks passed",
          detail: "No rule violations or conflicting signals detected. Proceed with your decision.",
        });
      }

      const blockCount = items.filter(i => i.severity === "block").length;
      const warnCount = items.filter(i => i.severity === "warn").length;
      const passCount = items.filter(i => i.severity === "pass").length;

      setResult({
        ticker,
        actionType,
        items,
        canProceed: blockCount === 0,
        blockCount,
        warnCount,
        passCount,
      });
    } catch (err) {
      console.error("Pre-trade checklist error:", err);
    } finally {
      setIsChecking(false);
    }
  }, [user]);

  const reset = () => setResult(null);

  return { runChecklist, isChecking, result, reset };
}
