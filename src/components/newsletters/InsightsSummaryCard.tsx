import { useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  Globe,
  BarChart3,
  Shield,
  Zap,
  Loader2,
  FileText,
  Lightbulb,
  Repeat,
  Swords,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useInsightsSummary,
  type InsightsSummary,
  type KeyPoint,
  type ActionItem,
  type MarketTheme,
  type ContrarianSignal,
  type PersistentSignal,
} from "@/hooks/useInsightsSummary";

const categoryIcons: Record<string, React.ReactNode> = {
  macro: <Globe className="w-4 h-4" />,
  sector: <BarChart3 className="w-4 h-4" />,
  stock: <Target className="w-4 h-4" />,
  risk: <Shield className="w-4 h-4" />,
  opportunity: <Zap className="w-4 h-4" />,
};

const relevanceColors: Record<string, string> = {
  high: "bg-destructive/20 text-destructive border-destructive/30",
  medium: "bg-warning/20 text-warning border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

const urgencyColors: Record<string, string> = {
  high: "bg-destructive/20 text-destructive border-destructive/30",
  medium: "bg-warning/20 text-warning border-warning/30",
  low: "bg-primary/20 text-primary border-primary/30",
};

const sentimentIcons: Record<string, React.ReactNode> = {
  bullish: <TrendingUp className="w-4 h-4 text-primary" />,
  bearish: <TrendingDown className="w-4 h-4 text-destructive" />,
  mixed: <Minus className="w-4 h-4 text-warning" />,
};

function AlignmentScore({ score }: { score?: number }) {
  if (score == null) return null;
  const color = score >= 7 ? "text-destructive" : score >= 4 ? "text-warning" : "text-muted-foreground";
  return (
    <span className={`text-[10px] font-mono font-bold ${color}`} title="Portfolio alignment score">
      {score}/10
    </span>
  );
}

function TickerBadges({ tickers }: { tickers?: string[] }) {
  if (!tickers?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {tickers.map((t) => (
        <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
          {t}
        </Badge>
      ))}
    </div>
  );
}

function SourceInfo({ count, names, singleSource }: { count?: number; names?: string[]; singleSource?: boolean }) {
  if (!count) return null;
  return (
    <span className="text-[10px] text-muted-foreground" title={names?.join(", ")}>
      {count} source{count !== 1 ? "s" : ""}
      {singleSource && <span className="text-warning ml-1">⚠ single source</span>}
    </span>
  );
}

function KeyPointItem({ point }: { point: KeyPoint }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
      <div className="mt-0.5 text-muted-foreground">
        {categoryIcons[point.category] ?? <FileText className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="font-medium text-sm text-foreground">{point.title}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${relevanceColors[point.relevance]}`}>
            {point.relevance}
          </Badge>
          <AlignmentScore score={point.portfolio_alignment_score} />
          <SourceInfo count={point.source_count} names={point.source_names} singleSource={point.single_source} />
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{point.detail}</p>
        <TickerBadges tickers={point.exposed_tickers} />
      </div>
    </div>
  );
}

function ActionItemRow({ item }: { item: ActionItem }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
      <div className="mt-0.5">
        <AlertTriangle className={`w-4 h-4 ${
          item.urgency === "high" ? "text-destructive" : 
          item.urgency === "medium" ? "text-warning" : "text-primary"
        }`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm text-foreground">{item.action}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${urgencyColors[item.urgency]}`}>
            {item.urgency}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{item.reasoning}</p>
      </div>
    </div>
  );
}

function ThemeCard({ theme }: { theme: MarketTheme }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/50 border border-border/50">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        {sentimentIcons[theme.sentiment]}
        <span className="font-medium text-sm text-foreground">{theme.theme}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {theme.source_count} source{theme.source_count !== 1 ? "s" : ""}
        </Badge>
        <AlignmentScore score={theme.portfolio_alignment_score} />
      </div>
      <p className="text-xs text-muted-foreground">{theme.portfolio_impact}</p>
      <TickerBadges tickers={theme.exposed_tickers} />
    </div>
  );
}

function ContrarianSignalCard({ signal }: { signal: ContrarianSignal }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/50 border border-border/50">
      <div className="flex items-center gap-2 mb-2">
        <Swords className="w-4 h-4 text-warning" />
        <span className="font-medium text-sm text-foreground">{signal.topic}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-2">
        <div className="p-2 rounded bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="w-3 h-3 text-primary" />
            <span className="text-[10px] font-semibold text-primary uppercase">Bull Case</span>
          </div>
          <p className="text-xs text-muted-foreground">{signal.bull_case}</p>
        </div>
        <div className="p-2 rounded bg-destructive/10 border border-destructive/20">
          <div className="flex items-center gap-1 mb-1">
            <TrendingDown className="w-3 h-3 text-destructive" />
            <span className="text-[10px] font-semibold text-destructive uppercase">Bear Case</span>
          </div>
          <p className="text-xs text-muted-foreground">{signal.bear_case}</p>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <TickerBadges tickers={signal.your_exposure} />
        <span className="text-[10px] text-muted-foreground italic">{signal.recommended_stance}</span>
      </div>
    </div>
  );
}

function PersistentSignalItem({ signal }: { signal: PersistentSignal }) {
  const trendIcon = signal.trend === "strengthening" ? "📈" : signal.trend === "weakening" ? "📉" : "➡️";
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Repeat className="w-3 h-3 text-warning flex-shrink-0" />
      <span>{signal.signal}</span>
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto flex-shrink-0">
        {signal.weeks_active}w {trendIcon}
      </Badge>
    </div>
  );
}

function isStructuredContrarian(signal: string | ContrarianSignal): signal is ContrarianSignal {
  return typeof signal === "object" && signal !== null && "topic" in signal;
}

function tryParseContrarian(signal: string | ContrarianSignal): ContrarianSignal | null {
  if (isStructuredContrarian(signal)) return signal;
  if (typeof signal === "string") {
    try {
      const parsed = JSON.parse(signal);
      if (parsed && typeof parsed === "object" && "topic" in parsed) return parsed;
    } catch {
      // not JSON
    }
  }
  return null;
}

function SummaryContent({ summary }: { summary: InsightsSummary }) {
  const [expanded, setExpanded] = useState(true);

  const parsedContrarians = (summary.contrarian_signals ?? []).map(tryParseContrarian);
  const structuredContrarians = parsedContrarians.filter((s): s is ContrarianSignal => s !== null);
  const stringContrarians = (summary.contrarian_signals ?? []).filter(
    (s, i) => parsedContrarians[i] === null && typeof s === "string"
  ) as string[];

  return (
    <Card className="border-primary/30 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Intelligence Brief</CardTitle>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
              {summary.newsletters_analyzed} newsletters · {summary.insights_analyzed} insights
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
          {summary.executive_summary}
        </p>

        {/* Weekly Priority */}
        {summary.weekly_priority && (
          <div className="mt-3 p-3 rounded-lg bg-primary/10 border border-primary/30">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase">This Week's Priority</span>
            </div>
            <p className="text-sm text-foreground font-medium">{summary.weekly_priority}</p>
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-6 pt-0">
          {/* Persistent Signals */}
          {summary.persistent_signals && summary.persistent_signals.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Repeat className="w-4 h-4 text-warning" />
                Persistent Signals
              </h3>
              <div className="space-y-2 p-3 rounded-lg bg-warning/5 border border-warning/20">
                {summary.persistent_signals.map((sig, i) => (
                  <PersistentSignalItem key={i} signal={sig} />
                ))}
              </div>
            </div>
          )}

          {/* Key Points */}
          {summary.key_points?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-warning" />
                Key Points
              </h3>
              <div className="space-y-2">
                {summary.key_points.map((point, i) => (
                  <KeyPointItem key={i} point={point} />
                ))}
              </div>
            </div>
          )}

          {/* Action Items */}
          {summary.action_items?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-primary" />
                Action Items
              </h3>
              <div className="space-y-2">
                {summary.action_items.map((item, i) => (
                  <ActionItemRow key={i} item={item} />
                ))}
              </div>
            </div>
          )}

          {/* Market Themes */}
          {summary.market_themes?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4 text-accent" />
                Market Themes
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {summary.market_themes.map((theme, i) => (
                  <ThemeCard key={i} theme={theme} />
                ))}
              </div>
            </div>
          )}

          {/* Contrarian Signals — structured */}
          {structuredContrarians.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Swords className="w-4 h-4 text-warning" />
                Contrarian Signals
              </h3>
              <div className="space-y-2">
                {structuredContrarians.map((signal, i) => (
                  <ContrarianSignalCard key={i} signal={signal} />
                ))}
              </div>
            </div>
          )}

          {/* Contrarian Signals — legacy string fallback */}
          {stringContrarians.length > 0 && structuredContrarians.length === 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Contrarian Signals
              </h3>
              <ul className="space-y-1.5">
                {stringContrarians.map((signal, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2">
                    <span className="text-warning mt-0.5">⚡</span>
                    {signal}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-[10px] text-muted-foreground text-right">
            Generated {new Date(summary.generated_at).toLocaleString()}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

export function InsightsSummaryCard() {
  const { summary, isLoading, generateSummary, isGenerating } = useInsightsSummary();

  return (
    <div className="space-y-4">
      {!summary && (
        <Card className="border-dashed border-border bg-card/50">
          <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
            <Sparkles className="w-8 h-8 text-muted-foreground" />
            <div className="text-center">
              <p className="text-sm font-medium text-foreground">AI Intelligence Brief</p>
              <p className="text-xs text-muted-foreground mt-1">
                Generate an actionable summary of your last 30 days of newsletter insights
              </p>
            </div>
            <Button
              onClick={() => generateSummary()}
              disabled={isGenerating}
              className="mt-2 gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Brief
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {summary && (
        <div className="space-y-3">
          <SummaryContent summary={summary} />
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => generateSummary()}
              disabled={isGenerating}
              className="gap-2"
            >
              {isGenerating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              Regenerate
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
