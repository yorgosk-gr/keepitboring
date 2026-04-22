import { supabase } from "@/integrations/supabase/client";
import { subDays } from "date-fns";

interface Insight {
  id: string;
  newsletter_id: string;
  insight_type: string | null;
  content: string | null;
  sentiment: string | null;
  tickers_mentioned: string[] | null;
  confidence_words: string[] | null;
  is_starred: boolean;
  is_summarized: boolean;
  created_at: string;
  newsletters: {
    title: string | null;
    source_name: string | null;
    upload_date: string;
    is_archived: boolean;
  } | null;
}

interface SmartSelectionResult {
  insights: Insight[];
  meta: {
    total: number;
    portfolioMentions: number;
    bubbleSignals: number;
    macroViews: number;
    other: number;
    oldestDate: string | null;
    newestDate: string | null;
  };
}

export async function selectSmartInsights(
  portfolioTickers: string[]
): Promise<SmartSelectionResult> {
  const now = new Date();
  const ninetyDaysAgo = subDays(now, 90);
  const thirtyDaysAgo = subDays(now, 30);
  const sevenDaysAgo = subDays(now, 7);

  // Use 10-day window for general insights (matches brief analysis window)
  const windowDate = subDays(now, 10);

  // Fetch all recent insights (up to 90 days for the extended rules)
  const { data: allInsights, error } = await supabase
    .from("insights")
    .select(`
      *,
      newsletters (
        title,
        source_name,
        upload_date,
        is_archived
      )
    `)
    .neq("is_summarized", true)
    .gte("created_at", ninetyDaysAgo.toISOString())
    .order("created_at", { ascending: false });

  if (error) throw error;

  const insights = (allInsights ?? []) as Insight[];

  // Priority categories
  const portfolioMentions: Insight[] = [];
  const bubbleSignals: Insight[] = [];
  const macroViews: Insight[] = [];
  const recentStockMentions: Insight[] = [];
  const otherInsights: Insight[] = [];

  const tickerSet = new Set(portfolioTickers.map((t) => t.toUpperCase()));

  for (const insight of insights) {
    // Skip insights from archived newsletters unless they mention portfolio tickers
    const isArchived = insight.newsletters?.is_archived ?? false;
    const createdAt = new Date(insight.created_at);
    const tickersMentioned = insight.tickers_mentioned ?? [];
    const mentionsPortfolio = tickersMentioned.some((t) =>
      t && tickerSet.has(t.toUpperCase())
    );

    // Rule a: Always include portfolio mentions (up to 90 days)
    if (mentionsPortfolio && createdAt >= ninetyDaysAgo) {
      portfolioMentions.push(insight);
      continue;
    }

    // Skip archived insights that don't mention portfolio
    if (isArchived) continue;

    // Rule b: Always include bubble signals (up to 90 days)
    if (insight.insight_type === "bubble_signal" && createdAt >= ninetyDaysAgo) {
      bubbleSignals.push(insight);
      continue;
    }

    // Rule c: Include macro views from last 30 days
    if ((insight.insight_type === "macro" || insight.insight_type === "macro_view" || insight.insight_type === "market_view") && createdAt >= thirtyDaysAgo) {
      macroViews.push(insight);
      continue;
    }

    // Rule d: Stock mentions not in portfolio - only last 7 days
    if (insight.insight_type === "stock_mention" && createdAt >= sevenDaysAgo) {
      recentStockMentions.push(insight);
      continue;
    }

    // Other insights within the user's window setting
    if (!windowDate || createdAt >= windowDate) {
      otherInsights.push(insight);
    }
  }

  // Combine with priority order: portfolio > bubble > macro > recent stock > other
  let combined = [
    ...portfolioMentions,
    ...bubbleSignals,
    ...macroViews,
    ...recentStockMentions,
    ...otherInsights,
  ];

  // Deduplicate by id (in case of overlapping categories)
  const seen = new Set<string>();
  combined = combined.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

  // Limit to max 50
  const selected = combined.slice(0, 50);

  // Calculate meta
  const dates = selected.map((i) => new Date(i.created_at).getTime());

  return {
    insights: selected,
    meta: {
      total: selected.length,
      portfolioMentions: portfolioMentions.filter((i) => selected.some((s) => s.id === i.id)).length,
      bubbleSignals: bubbleSignals.filter((i) => selected.some((s) => s.id === i.id)).length,
      macroViews: macroViews.filter((i) => selected.some((s) => s.id === i.id)).length,
      other: selected.length - portfolioMentions.filter((i) => selected.some((s) => s.id === i.id)).length
        - bubbleSignals.filter((i) => selected.some((s) => s.id === i.id)).length
        - macroViews.filter((i) => selected.some((s) => s.id === i.id)).length,
      oldestDate: dates.length > 0 ? new Date(Math.min(...dates)).toISOString() : null,
      newestDate: dates.length > 0 ? new Date(Math.max(...dates)).toISOString() : null,
    },
  };
}
