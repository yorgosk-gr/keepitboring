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

function KeyPointItem({ point }: { point: KeyPoint }) {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-secondary/50 border border-border/50">
      <div className="mt-0.5 text-muted-foreground">
        {categoryIcons[point.category] ?? <FileText className="w-4 h-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm text-foreground">{point.title}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${relevanceColors[point.relevance]}`}>
            {point.relevance}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{point.detail}</p>
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
      <div className="flex items-center gap-2 mb-2">
        {sentimentIcons[theme.sentiment]}
        <span className="font-medium text-sm text-foreground">{theme.theme}</span>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {theme.source_count} source{theme.source_count !== 1 ? "s" : ""}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{theme.portfolio_impact}</p>
    </div>
  );
}

function SummaryContent({ summary }: { summary: InsightsSummary }) {
  const [expanded, setExpanded] = useState(true);

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
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-6 pt-0">
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

          {/* Contrarian Signals */}
          {summary.contrarian_signals?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Contrarian Signals
              </h3>
              <ul className="space-y-1.5">
                {summary.contrarian_signals.map((signal, i) => (
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
