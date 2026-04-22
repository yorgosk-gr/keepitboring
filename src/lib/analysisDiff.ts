import type { RecommendedAction } from "@/hooks/usePortfolioAnalysis";

export type DiffStatus = "new" | "reiterated" | "dropped";

export interface DiffInfo {
  status: DiffStatus;
  streak: number;
}

function keyOf(a: RecommendedAction): string {
  const tickers = (a.trades_involved ?? [])
    .map((t) => t.replace(/^(BUY|SELL|HOLD)\s+/i, "").trim())
    .filter(Boolean)
    .sort()
    .join(",");
  const verb = (a.trades_involved ?? [])[0]?.split(/\s+/)[0]?.toUpperCase() ?? "";
  // When tickers are present, key on verb+tickers only — robust to Claude
  // rewording the same rec. Fall back to action text when no tickers.
  if (tickers) return `${verb}|${tickers}`;
  return `|${a.action.slice(0, 40).toLowerCase()}`;
}

export function diffRecommendations(
  current: RecommendedAction[] | null | undefined,
  history: Array<{ recommended_actions: RecommendedAction[] | null }>,
): Map<number, DiffInfo> {
  const result = new Map<number, DiffInfo>();
  if (!current) return result;

  current.forEach((action, idx) => {
    const k = keyOf(action);
    let streak = 1;
    for (const past of history) {
      const pastActions = past.recommended_actions ?? [];
      if (pastActions.some((p) => keyOf(p) === k)) streak += 1;
      else break;
    }
    result.set(idx, {
      status: streak === 1 ? "new" : "reiterated",
      streak,
    });
  });

  return result;
}

export function findDroppedRecommendations(
  current: RecommendedAction[] | null | undefined,
  previous: RecommendedAction[] | null | undefined,
): RecommendedAction[] {
  if (!previous || previous.length === 0) return [];
  const currentKeys = new Set((current ?? []).map(keyOf));
  return previous.filter((p) => !currentKeys.has(keyOf(p)));
}
