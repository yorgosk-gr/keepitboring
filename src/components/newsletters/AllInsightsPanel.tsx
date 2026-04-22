import { useState, useMemo } from "react";
import {
  Star,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Search,
  Globe,
  BarChart3,
  Target,
  ThumbsUp,
  EyeOff,
  Eye,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAllInsights, type InsightWithSource } from "@/hooks/useAllInsights";
import { usePositions } from "@/hooks/usePositions";

type GroupBy = "type" | "source" | "sentiment";

const TYPE_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  macro: {
    label: "Macro Views",
    icon: <Globe className="w-4 h-4" />,
    color: "text-blue-500",
    bgColor: "bg-blue-500/10 border-blue-500/20",
  },
  stock_mention: {
    label: "Stock Mentions",
    icon: <BarChart3 className="w-4 h-4" />,
    color: "text-violet-500",
    bgColor: "bg-violet-500/10 border-violet-500/20",
  },
  recommendation: {
    label: "Recommendations",
    icon: <Target className="w-4 h-4" />,
    color: "text-amber-500",
    bgColor: "bg-amber-500/10 border-amber-500/20",
  },
  sentiment: {
    label: "Sentiment",
    icon: <ThumbsUp className="w-4 h-4" />,
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10 border-cyan-500/20",
  },
  bubble_signal: {
    label: "Bubble Signals",
    icon: <AlertTriangle className="w-4 h-4" />,
    color: "text-red-500",
    bgColor: "bg-red-500/10 border-red-500/20",
  },
};

const TYPE_ORDER: string[] = ["macro", "stock_mention", "recommendation", "sentiment", "bubble_signal"];

const SENTIMENT_LABELS: Record<string, string> = {
  bullish: "Bullish",
  bearish: "Bearish",
  neutral: "Neutral",
};

const INITIAL_SHOW = 5;

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

// Quality score dot indicator
const SCORE_CONFIG: Record<number, { color: string; label: string }> = {
  1: { color: "bg-muted-foreground/40", label: "Noise — auto-excluded" },
  2: { color: "bg-amber-500/50", label: "Low quality" },
  3: { color: "bg-yellow-500", label: "Medium quality" },
  4: { color: "bg-blue-500", label: "Good quality" },
  5: { color: "bg-emerald-500", label: "Strong signal" },
};

function QualityDot({ score }: { score: number | null }) {
  if (score == null) return null;
  const cfg = SCORE_CONFIG[score] ?? SCORE_CONFIG[3];
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-block w-2 h-2 rounded-full shrink-0 mt-1.5", cfg.color)} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          Score {score}/5 — {cfg.label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ─── Insight row ─── */
function InsightRow({
  insight,
  portfolioTickers,
  showSource,
  onToggleStar,
  onToggleExclude,
}: {
  insight: InsightWithSource;
  portfolioTickers: string[];
  showSource: boolean;
  onToggleStar: (params: { id: string; isStarred: boolean }) => void;
  onToggleExclude: (params: { id: string; excluded: boolean }) => void;
}) {
  const tickersInPortfolio = (insight.tickers_mentioned || []).filter((t) =>
    portfolioTickers.includes(t.toUpperCase())
  );

  const isExcluded = insight.excluded_from_brief;

  return (
    <div
      className={cn(
        "px-4 py-3 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors",
        tickersInPortfolio.length > 0 && !isExcluded && "bg-primary/5",
        isExcluded && "opacity-50"
      )}
    >
      <div className="flex items-start gap-3">
        <QualityDot score={insight.quality_score} />
        <div className="flex items-center gap-1 pt-0.5 shrink-0">
          {getSentimentIcon(insight.sentiment)}
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <p className={cn("text-sm text-foreground leading-relaxed", isExcluded && "line-through decoration-muted-foreground/50")}>
            {insight.content}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {showSource && (
              <span className="text-xs text-muted-foreground font-medium">{insight.title ?? insight.source_name ?? "(untitled)"}</span>
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
        <div className="flex items-center gap-0.5 shrink-0">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "h-7 w-7",
                    isExcluded
                      ? "text-muted-foreground hover:text-foreground"
                      : "text-muted-foreground opacity-40 hover:opacity-100"
                  )}
                  onClick={() => onToggleExclude({ id: insight.id, excluded: !isExcluded })}
                >
                  {isExcluded
                    ? <Eye className="w-3.5 h-3.5" />
                    : <EyeOff className="w-3.5 h-3.5" />
                  }
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {isExcluded ? "Re-include in brief" : "Exclude from brief"}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7",
              insight.is_starred ? "text-amber-500" : "text-muted-foreground opacity-40 hover:opacity-100"
            )}
            onClick={() => onToggleStar({ id: insight.id, isStarred: !insight.is_starred })}
          >
            <Star className={cn("w-3.5 h-3.5", insight.is_starred && "fill-current")} />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ─── Collapsible group with "show more" ─── */
function InsightGroup({
  title,
  insights,
  portfolioTickers,
  showSource,
  onToggleStar,
  onToggleExclude,
  defaultOpen = false,
  icon,
  accentColor,
}: {
  title: string;
  insights: InsightWithSource[];
  portfolioTickers: string[];
  showSource: boolean;
  onToggleStar: (params: { id: string; isStarred: boolean }) => void;
  onToggleExclude: (params: { id: string; excluded: boolean }) => void;
  defaultOpen?: boolean;
  icon?: React.ReactNode;
  accentColor?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);

  const visible = showAll ? insights : insights.slice(0, INITIAL_SHOW);
  const remaining = insights.length - INITIAL_SHOW;

  // Sentiment breakdown for the group header
  const bullish = insights.filter((i) => i.sentiment === "bullish").length;
  const bearish = insights.filter((i) => i.sentiment === "bearish").length;
  const excluded = insights.filter((i) => i.excluded_from_brief).length;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 bg-secondary/50 hover:bg-secondary/70 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className={accentColor}>{icon}</span>}
          <span className="font-medium text-sm text-foreground">{title}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
            {insights.length}
          </Badge>
          {/* Mini sentiment bar */}
          {(bullish > 0 || bearish > 0) && (
            <div className="hidden sm:flex items-center gap-1.5 ml-1">
              {bullish > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-emerald-500">
                  <TrendingUp className="w-3 h-3" />
                  {bullish}
                </span>
              )}
              {bearish > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-red-500">
                  <TrendingDown className="w-3 h-3" />
                  {bearish}
                </span>
              )}
            </div>
          )}
          {excluded > 0 && (
            <span className="hidden sm:flex items-center gap-0.5 text-xs text-muted-foreground ml-1">
              <EyeOff className="w-3 h-3" />
              {excluded} excluded
            </span>
          )}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>
      {open && (
        <div>
          {visible.map((insight) => (
            <InsightRow
              key={insight.id}
              insight={insight}
              portfolioTickers={portfolioTickers}
              showSource={showSource}
              onToggleStar={onToggleStar}
              onToggleExclude={onToggleExclude}
            />
          ))}
          {!showAll && remaining > 0 && (
            <button
              className="w-full py-2.5 text-xs font-medium text-primary hover:bg-primary/5 transition-colors border-t border-border"
              onClick={(e) => {
                e.stopPropagation();
                setShowAll(true);
              }}
            >
              Show {remaining} more
            </button>
          )}
          {showAll && remaining > 0 && (
            <button
              className="w-full py-2.5 text-xs font-medium text-muted-foreground hover:bg-secondary/50 transition-colors border-t border-border"
              onClick={(e) => {
                e.stopPropagation();
                setShowAll(false);
              }}
            >
              Show less
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Overview cards ─── */
function TypeOverviewCards({
  insights,
  activeType,
  onSelect,
}: {
  insights: InsightWithSource[];
  activeType: string | null;
  onSelect: (type: string | null) => void;
}) {
  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const i of insights) {
      const t = i.insight_type || "other";
      map[t] = (map[t] || 0) + 1;
    }
    return map;
  }, [insights]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
      {TYPE_ORDER.filter((t) => counts[t]).map((type) => {
        const config = TYPE_CONFIG[type];
        const isActive = activeType === type;
        return (
          <button
            key={type}
            onClick={() => onSelect(isActive ? null : type)}
            className={cn(
              "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all text-center",
              isActive
                ? `${config.bgColor} border-current ${config.color} ring-1 ring-current/20`
                : "border-border hover:border-primary/30 hover:bg-secondary/50"
            )}
          >
            <span className={cn(isActive ? config.color : "text-muted-foreground")}>
              {config.icon}
            </span>
            <span className={cn("text-lg font-bold", isActive ? config.color : "text-foreground")}>
              {counts[type]}
            </span>
            <span className="text-xs text-muted-foreground leading-tight">{config.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─── Main panel ─── */
export function AllInsightsPanel() {
  const { insights, isLoading, toggleStar, toggleExclude } = useAllInsights();
  const { positions } = usePositions();
  const portfolioTickers = positions.map((p) => p.ticker.toUpperCase());

  const [groupBy, setGroupBy] = useState<GroupBy>("type");
  const [searchQuery, setSearchQuery] = useState("");
  const [starredOnly, setStarredOnly] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);
  const [activeTypeFilter, setActiveTypeFilter] = useState<string | null>(null);

  const excludedCount = useMemo(
    () => insights.filter((i) => i.excluded_from_brief).length,
    [insights]
  );

  const filtered = useMemo(() => {
    let result = insights;
    if (!showExcluded) result = result.filter((i) => !i.excluded_from_brief);
    if (starredOnly) result = result.filter((i) => i.is_starred);
    if (activeTypeFilter) result = result.filter((i) => i.insight_type === activeTypeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) =>
          i.content?.toLowerCase().includes(q) ||
          i.tickers_mentioned?.some((t) => t.toLowerCase().includes(q)) ||
          (i.title ?? i.source_name ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [insights, starredOnly, showExcluded, activeTypeFilter, searchQuery]);

  const groups = useMemo(() => {
    const map = new Map<string, InsightWithSource[]>();

    for (const insight of filtered) {
      let key: string;
      if (groupBy === "type") {
        key = insight.insight_type || "other";
      } else if (groupBy === "source") {
        key = insight.title ?? insight.source_name ?? "(untitled)";
      } else {
        key = insight.sentiment || "neutral";
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(insight);
    }

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
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
        <Card>
          <CardContent className="space-y-3 pt-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      </div>
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
    if (groupBy === "type") return TYPE_CONFIG[key]?.label || key;
    if (groupBy === "sentiment") return SENTIMENT_LABELS[key] || key;
    return key;
  };

  const getGroupIcon = (key: string) => {
    if (groupBy === "type") return TYPE_CONFIG[key]?.icon;
    if (groupBy === "sentiment") return getSentimentIcon(key);
    return undefined;
  };

  const getGroupAccent = (key: string) => {
    if (groupBy === "type") return TYPE_CONFIG[key]?.color;
    return undefined;
  };

  return (
    <div className="space-y-4">
      {/* Overview cards — clickable type filter */}
      <TypeOverviewCards
        insights={insights}
        activeType={activeTypeFilter}
        onSelect={(type) => {
          setActiveTypeFilter(type);
          if (type && groupBy === "type") setGroupBy("source");
          if (!type) setGroupBy("type");
        }}
      />

      {/* Controls + list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <CardTitle className="text-base">
                {activeTypeFilter
                  ? TYPE_CONFIG[activeTypeFilter]?.label || activeTypeFilter
                  : "All Insights"}
              </CardTitle>
              <Badge variant="secondary" className="text-xs">{filtered.length}</Badge>
              {activeTypeFilter && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={() => {
                    setActiveTypeFilter(null);
                    setGroupBy("type");
                  }}
                >
                  Clear filter
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Show excluded toggle — only visible if there are excluded insights */}
              {excludedCount > 0 && (
                <Button
                  variant={showExcluded ? "default" : "outline"}
                  size="sm"
                  className="gap-1 h-8"
                  onClick={() => setShowExcluded(!showExcluded)}
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  Excluded ({excludedCount})
                </Button>
              )}
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
            groups.map(([key, items], idx) => (
              <InsightGroup
                key={key}
                title={getGroupLabel(key)}
                insights={items}
                portfolioTickers={portfolioTickers}
                showSource={groupBy !== "source"}
                onToggleStar={toggleStar}
                onToggleExclude={toggleExclude}
                defaultOpen={idx === 0}
                icon={getGroupIcon(key)}
                accentColor={getGroupAccent(key)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap px-1">
        <span className="text-xs text-muted-foreground">Quality score:</span>
        {[1, 2, 3, 4, 5].map((s) => (
          <span key={s} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className={cn("inline-block w-2 h-2 rounded-full", SCORE_CONFIG[s].color)} />
            {s} — {SCORE_CONFIG[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}
