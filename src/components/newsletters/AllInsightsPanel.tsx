import { useState, useMemo } from "react";
import {
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Filter,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Search,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAllInsights, type InsightWithSource } from "@/hooks/useAllInsights";
import { usePositions } from "@/hooks/usePositions";

type GroupBy = "type" | "source" | "sentiment";
type InsightType = "macro" | "stock_mention" | "sentiment" | "recommendation" | "bubble_signal";

const TYPE_LABELS: Record<string, string> = {
  macro: "Macro Views",
  stock_mention: "Stock Mentions",
  sentiment: "Sentiment",
  recommendation: "Recommendations",
  bubble_signal: "Bubble Signals",
};

const TYPE_ORDER: string[] = ["macro", "stock_mention", "recommendation", "sentiment", "bubble_signal"];

const SENTIMENT_LABELS: Record<string, string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Neutral",
};

const getSentimentIcon = (sentiment: string | null) => {
  switch (sentiment) {
    case "bullish":
      return <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />;
    case "bearish":
      return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
    default:
      return <Minus className="w-3.5 h-3.5 text-muted-foreground" />;
  }
};

const getSentimentColor = (sentiment: string | null) => {
  switch (sentiment) {
    case "bullish":
      return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    case "bearish":
      return "bg-red-500/10 text-red-500 border-red-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
};

function InsightRow({
  insight,
  portfolioTickers,
  showSource,
  onToggleStar,
}: {
  insight: InsightWithSource;
  portfolioTickers: string[];
  showSource: boolean;
  onToggleStar: (params: { id: string; isStarred: boolean }) => void;
}) {
  const tickersInPortfolio = (insight.tickers_mentioned || []).filter((t) =>
    portfolioTickers.includes(t.toUpperCase())
  );

  return (
    <div
      className={cn(
        "px-4 py-3 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors",
        tickersInPortfolio.length > 0 && "bg-primary/5"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-1 pt-0.5 shrink-0">
          {getSentimentIcon(insight.sentiment)}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm text-foreground leading-relaxed">{insight.content}</p>
          <div className="flex items-center gap-2 flex-wrap">
            {showSource && (
              <span className="text-xs text-muted-foreground font-medium">{insight.source_name}</span>
            )}
            {(insight.tickers_mentioned || []).map((ticker) => (
              <Badge
                key={ticker}
                variant="outline"
                className={cn(
                  "font-mono text-xs h-5 px-1.5",
                  portfolioTickers.includes(ticker.toUpperCase())
                    ? "bg-primary/20 text-primary border-primary/30"
                    : ""
                )}
              >
                {ticker}
                {portfolioTickers.includes(ticker.toUpperCase()) && " \u2713"}
              </Badge>
            ))}
            <Badge variant="outline" className={cn("text-xs h-5 px-1.5", getSentimentColor(insight.sentiment))}>
              {insight.sentiment || "neutral"}
            </Badge>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "shrink-0 h-7 w-7",
            insight.is_starred ? "text-amber-500" : "text-muted-foreground opacity-40 hover:opacity-100"
          )}
          onClick={() => onToggleStar({ id: insight.id, isStarred: !insight.is_starred })}
        >
          <Star className={cn("w-3.5 h-3.5", insight.is_starred && "fill-current")} />
        </Button>
      </div>
    </div>
  );
}

function InsightGroup({
  title,
  insights,
  portfolioTickers,
  showSource,
  onToggleStar,
  defaultOpen = true,
  badge,
}: {
  title: string;
  insights: InsightWithSource[];
  portfolioTickers: string[];
  showSource: boolean;
  onToggleStar: (params: { id: string; isStarred: boolean }) => void;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/50 hover:bg-secondary/70 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground">{title}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
            {insights.length}
          </Badge>
          {badge}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && (
        <div>
          {insights.map((insight) => (
            <InsightRow
              key={insight.id}
              insight={insight}
              portfolioTickers={portfolioTickers}
              showSource={showSource}
              onToggleStar={onToggleStar}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AllInsightsPanel() {
  const { insights, isLoading, toggleStar } = useAllInsights();
  const { positions } = usePositions();
  const portfolioTickers = positions.map((p) => p.ticker.toUpperCase());

  const [groupBy, setGroupBy] = useState<GroupBy>("type");
  const [searchQuery, setSearchQuery] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);

  const filtered = useMemo(() => {
    let result = insights;
    if (starredOnly) result = result.filter((i) => i.is_starred);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.content?.toLowerCase().includes(q) ||
          i.tickers_mentioned?.some((t) => t.toLowerCase().includes(q)) ||
          i.source_name.toLowerCase().includes(q)
      );
    }
    return result;
  }, [insights, starredOnly, searchQuery]);

  const groups = useMemo(() => {
    const map = new Map<string, InsightWithSource[]>();

    for (const insight of filtered) {
      let key: string;
      if (groupBy === "type") {
        key = insight.insight_type || "other";
      } else if (groupBy === "source") {
        key = insight.source_name;
      } else {
        key = insight.sentiment || "neutral";
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(insight);
    }

    // Sort groups
    const entries = Array.from(map.entries());
    if (groupBy === "type") {
      entries.sort((a, b) => {
        const ai = TYPE_ORDER.indexOf(a[0]);
        const bi = TYPE_ORDER.indexOf(b[0]);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
    } else if (groupBy === "source") {
      entries.sort((a, b) => b[1].length - a[1].length);
    } else {
      const order = ["bullish", "bearish", "neutral"];
      entries.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    }

    return entries;
  }, [filtered, groupBy]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (insights.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Lightbulb className="w-6 h-6 text-primary" />
          </div>
          <p className="text-muted-foreground">
            No insights yet. Upload and process newsletters to see insights here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getGroupLabel = (key: string) => {
    if (groupBy === "type") return TYPE_LABELS[key] || key;
    if (groupBy === "sentiment") return SENTIMENT_LABELS[key] || key;
    return key;
  };

  const getGroupBadge = (key: string, items: InsightWithSource[]) => {
    if (groupBy !== "type") return undefined;
    if (key === "bubble_signal") {
      return (
        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-xs h-5 px-1.5">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Warning
        </Badge>
      );
    }
    return undefined;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            All Insights
            <Badge variant="secondary">{insights.length}</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant={starredOnly ? "default" : "outline"}
              size="sm"
              className="gap-1 h-8"
              onClick={() => setStarredOnly(!starredOnly)}
            >
              <Star className={cn("w-3.5 h-3.5", starredOnly && "fill-current")} />
              Starred
            </Button>
            <div className="flex items-center border border-border rounded-md overflow-hidden h-8">
              {(["type", "source", "sentiment"] as GroupBy[]).map((g) => (
                <button
                  key={g}
                  className={cn(
                    "px-2.5 py-1 text-xs font-medium transition-colors capitalize",
                    groupBy === g
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                  onClick={() => setGroupBy(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search insights, tickers, sources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No insights match your filters
          </div>
        ) : (
          groups.map(([key, items]) => (
            <InsightGroup
              key={key}
              title={getGroupLabel(key)}
              insights={items}
              portfolioTickers={portfolioTickers}
              showSource={groupBy !== "source"}
              onToggleStar={toggleStar}
              defaultOpen={groups.length <= 5}
              badge={getGroupBadge(key, items)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
