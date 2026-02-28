import { useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronUp,
  Target,
  Globe,
  BarChart3,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useInsightsSummary,
  type InsightsSummary,
  type StockToResearch,
  type CountryTilt,
  type SectorTilt,
} from "@/hooks/useInsightsSummary";

const directionIcons: Record<string, React.ReactNode> = {
  overweight: <TrendingUp className="w-3.5 h-3.5 text-primary" />,
  underweight: <TrendingDown className="w-3.5 h-3.5 text-destructive" />,
  neutral: <Minus className="w-3.5 h-3.5 text-muted-foreground" />,
};

const convictionColors: Record<string, string> = {
  high: "bg-destructive/20 text-destructive border-destructive/30",
  medium: "bg-warning/20 text-warning border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

function LetterSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-2 uppercase tracking-wide">{title}</h3>
      <div className="space-y-3">
        {content.split("\n\n").map((para, i) => (
          <p key={i} className="text-sm text-muted-foreground leading-relaxed">{para}</p>
        ))}
      </div>
    </div>
  );
}

function StockCard({ stock }: { stock: StockToResearch }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/50 border border-border/50">
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">{stock.ticker}</Badge>
        <span className="text-sm font-medium text-foreground">{stock.name}</span>
        {stock.mentioned_in > 1 && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 ml-auto">
            {stock.mentioned_in} sources
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{stock.thesis}</p>
    </div>
  );
}

function CountryTiltCard({ tilt }: { tilt: CountryTilt }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50 border border-border/50">
      {directionIcons[tilt.direction] ?? <Minus className="w-3.5 h-3.5" />}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground">{tilt.region}</span>
        <span className="text-xs text-muted-foreground ml-2">{tilt.direction}</span>
      </div>
      {tilt.etf_proxy && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">{tilt.etf_proxy}</Badge>
      )}
      {tilt.in_portfolio && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-primary border-primary/30">held</Badge>
      )}
    </div>
  );
}

function SectorTiltCard({ tilt }: { tilt: SectorTilt }) {
  return (
    <div className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50 border border-border/50">
      {directionIcons[tilt.direction] ?? <Minus className="w-3.5 h-3.5" />}
      <span className="text-sm font-medium text-foreground flex-1">{tilt.sector}</span>
      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${convictionColors[tilt.conviction] ?? ""}`}>
        {tilt.conviction}
      </Badge>
    </div>
  );
}

function splitLetter(summary: InsightsSummary) {
  const defaultTitles = {
    market: "State of the Market",
    portfolio: "What This Means For Your Portfolio",
    invest: "Where to Invest",
    watch: "Watch This Week",
  };

  const titles = summary.section_titles ?? defaultTitles;
  const letter = summary.letter ?? "";

  if (!letter) return { market: "" };

  const markers = [
    { key: "market" as const, patterns: ["SECTION 1", titles.market.toUpperCase()] },
    { key: "portfolio" as const, patterns: ["SECTION 2", titles.portfolio.toUpperCase()] },
    { key: "invest" as const, patterns: ["SECTION 3", titles.invest.toUpperCase()] },
    { key: "watch" as const, patterns: ["SECTION 4", titles.watch.toUpperCase()] },
  ];

  const upper = letter.toUpperCase();
  const positions: { key: string; title: string; pos: number }[] = [];

  for (const m of markers) {
    for (const pat of m.patterns) {
      const idx = upper.indexOf(pat);
      if (idx !== -1) {
        positions.push({ key: m.key, title: titles[m.key], pos: idx });
        break;
      }
    }
  }

  // If we found sections, split accordingly
  if (positions.length >= 2) {
    positions.sort((a, b) => a.pos - b.pos);
    const sections: Record<string, string> = {};
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i].pos;
      const end = i + 1 < positions.length ? positions[i + 1].pos : letter.length;
      let text = letter.substring(start, end).trim();
      const firstNewline = text.indexOf("\n");
      if (firstNewline !== -1) text = text.substring(firstNewline).trim();
      sections[positions[i].key] = text;
    }
    return sections;
  }

  // Fallback: just return the whole letter as "market"
  return { market: letter };
}

function SummaryContent({ summary }: { summary: InsightsSummary }) {
  const [expanded, setExpanded] = useState(true);

  if (!summary.letter) {
    return (
      <div className="text-sm text-muted-foreground p-4">
        Brief format not yet generated. Click Regenerate to get the new letter format.
      </div>
    );
  }

  const sections = splitLetter(summary);

  return (
    <Card className="border-primary/30 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Weekly Letter</CardTitle>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">
              {summary.newsletters_analyzed} newsletters · {summary.insights_analyzed} insights
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

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
          {/* Letter Sections */}
          {sections.market && (
            <LetterSection title={summary.section_titles.market} content={sections.market} />
          )}
          {sections.portfolio && (
            <LetterSection title={summary.section_titles.portfolio} content={sections.portfolio} />
          )}
          {sections.invest && (
            <LetterSection title={summary.section_titles.invest} content={sections.invest} />
          )}

          {/* Structured: Country Tilts */}
          {summary.country_tilts?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Globe className="w-4 h-4 text-accent" />
                Country / Region Tilts
              </h3>
              <div className="space-y-1.5">
                {summary.country_tilts.map((t, i) => (
                  <CountryTiltCard key={i} tilt={t} />
                ))}
              </div>
            </div>
          )}

          {/* Structured: Sector Tilts */}
          {summary.sector_tilts?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-accent" />
                Sector Tilts
              </h3>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {summary.sector_tilts.map((t, i) => (
                  <SectorTiltCard key={i} tilt={t} />
                ))}
              </div>
            </div>
          )}

          {/* Structured: Stocks to Research */}
          {summary.stocks_to_research?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <Search className="w-4 h-4 text-accent" />
                Stocks to Research
              </h3>
              <div className="space-y-2">
                {summary.stocks_to_research.map((s, i) => (
                  <StockCard key={i} stock={s} />
                ))}
              </div>
            </div>
          )}

          {/* Watch This Week */}
          {sections.watch && (
            <LetterSection title={summary.section_titles.watch} content={sections.watch} />
          )}

          {/* Crowded Trades */}
          {summary.crowded_trades?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Crowded Trades
              </h3>
              <ul className="space-y-1.5">
                {summary.crowded_trades.map((trade, i) => (
                  <li key={i} className="text-xs text-muted-foreground flex gap-2 p-2 rounded-lg bg-warning/5 border border-warning/20">
                    <span className="text-warning mt-0.5">⚠</span>
                    {trade}
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
              <p className="text-sm font-medium text-foreground">Weekly Intelligence Letter</p>
              <p className="text-xs text-muted-foreground mt-1">
                Generate an opinionated weekly letter from your last 30 days of newsletter insights
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
                  Writing letter...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate Letter
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
