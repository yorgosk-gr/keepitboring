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
  Lightbulb,
  Clock,
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
  type ContrarianOpportunity,
} from "@/hooks/useInsightsSummary";

const directionIcons: Record<string, React.ReactNode> = {
  overweight: <TrendingUp className="w-4 h-4 text-primary" />,
  underweight: <TrendingDown className="w-4 h-4 text-destructive" />,
  neutral: <Minus className="w-4 h-4 text-muted-foreground" />,
};

const directionLabels: Record<string, { text: string; className: string }> = {
  overweight: { text: "Overweight", className: "text-primary" },
  underweight: { text: "Underweight", className: "text-destructive" },
  neutral: { text: "Neutral", className: "text-muted-foreground" },
};

const convictionColors: Record<string, string> = {
  high: "bg-destructive/20 text-destructive border-destructive/30",
  medium: "bg-warning/20 text-warning border-warning/30",
  low: "bg-muted text-muted-foreground border-border",
};

// Parse the narrative letter into named sections
function parseLetterSections(letter: string) {
  if (!letter) return {};

  const sectionPattern = /═══\s*(.+?)\s*═══/g;
  const matches: { title: string; pos: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = sectionPattern.exec(letter)) !== null) {
    matches.push({ title: match[1].trim(), pos: match.index });
  }

  if (matches.length === 0) return { full: letter };

  const sections: Record<string, string> = {};
  for (let i = 0; i < matches.length; i++) {
    const headerEnd = letter.indexOf("\n", matches[i].pos);
    const start = headerEnd !== -1 ? headerEnd + 1 : matches[i].pos;
    const end = i + 1 < matches.length ? matches[i + 1].pos : letter.length;
    const key = matches[i].title
      .replace(/^SECTION \d+:\s*/i, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");
    sections[key] = letter.substring(start, end).trim();
  }

  return sections;
}

function NarrativeSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h3 className="text-base font-bold text-foreground mb-3 uppercase tracking-wide">{title}</h3>
      <div className="space-y-3">
        {content.split("\n\n").map((para, i) => (
          <p key={i} className="text-[15px] text-foreground/80 leading-relaxed whitespace-pre-line">{para}</p>
        ))}
      </div>
    </div>
  );
}

function StockCard({ stock }: { stock: StockToResearch }) {
  return (
    <div className="p-3.5 rounded-lg bg-secondary/50 border border-border/50">
      <div className="flex items-center gap-2 mb-1.5">
        <Badge variant="secondary" className="text-xs px-2 py-0.5 font-mono">{stock.ticker}</Badge>
        <span className="text-[15px] font-medium text-foreground">{stock.name}</span>
        {stock.mentioned_in > 1 && (
          <Badge variant="outline" className="text-xs px-2 py-0.5 ml-auto">
            {stock.mentioned_in} sources
          </Badge>
        )}
      </div>
      <p className="text-sm text-foreground/70">{stock.thesis}</p>
    </div>
  );
}

function CountryTiltCard({ tilt }: { tilt: CountryTilt }) {
  return (
    <div className="p-3 rounded-lg bg-secondary/50 border border-border/50 space-y-1.5">
      <div className="flex items-center gap-3">
        {directionIcons[tilt.direction] ?? <Minus className="w-4 h-4" />}
        <div className="flex-1 min-w-0">
          <span className="text-[15px] font-medium text-foreground">{tilt.region}</span>
          <span className="text-sm text-foreground/60 ml-2">{tilt.direction}</span>
        </div>
        {tilt.etf_proxy && (
          <Badge variant="secondary" className="text-xs px-2 py-0.5 font-mono">{tilt.etf_proxy}</Badge>
        )}
        {tilt.in_portfolio && (
          <Badge variant="outline" className="text-xs px-2 py-0.5 text-primary border-primary/30">held</Badge>
        )}
      </div>
      {tilt.reasoning && (
        <p className="text-sm text-muted-foreground pl-7">{tilt.reasoning}</p>
      )}
    </div>
  );
}

function SectorTiltCard({ tilt }: { tilt: SectorTilt }) {
  const label = directionLabels[tilt.direction] ?? { text: tilt.direction, className: "text-muted-foreground" };
  const relatedTickers = tilt.portfolio_tickers ?? [];

  return (
    <div className="p-3 rounded-lg bg-secondary/50 border border-border/50 space-y-2">
      <div className="flex items-center gap-3">
        {directionIcons[tilt.direction] ?? <Minus className="w-4 h-4" />}
        <span className="text-[15px] font-medium text-foreground flex-1">{tilt.sector}</span>
        <span className={`text-sm font-medium ${label.className}`}>{label.text}</span>
        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${convictionColors[tilt.conviction] ?? ""}`}>
          {tilt.conviction}
        </Badge>
      </div>
      {tilt.reasoning && (
        <p className="text-sm text-muted-foreground ml-7">{tilt.reasoning}</p>
      )}
      {relatedTickers.length > 0 && (
        <div className="flex gap-1.5 flex-wrap ml-7">
          {relatedTickers.map((t) => (
            <Badge key={t} variant="secondary" className="text-xs px-2 py-0.5 font-mono">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function ContrarianCard({ opp }: { opp: ContrarianOpportunity }) {
  const horizonLabel = opp.time_horizon === "long" ? "2-5 years" : "6-18 months";

  return (
    <div className="p-3.5 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-2.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[15px] font-semibold text-foreground">{opp.title}</span>
        <Badge variant="secondary" className="text-xs px-2 py-0.5 font-mono bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30">
          {opp.ticker}
        </Badge>
        {opp.ticker_name && (
          <span className="text-sm text-foreground/60">{opp.ticker_name}</span>
        )}
        <div className="flex gap-1.5 ml-auto">
          <Badge variant="outline" className="text-xs px-2 py-0.5 border-amber-500/30 text-amber-700 dark:text-amber-400">
            <Clock className="w-3 h-3 mr-1" />
            {horizonLabel}
          </Badge>
          <Badge variant="outline" className={`text-xs px-2 py-0.5 ${convictionColors[opp.conviction] ?? ""}`}>
            {opp.conviction}
          </Badge>
          {opp.in_portfolio && (
            <Badge variant="outline" className="text-xs px-2 py-0.5 text-primary border-primary/30">held</Badge>
          )}
        </div>
      </div>
      <div className="space-y-1.5 text-sm text-foreground/70">
        <div>
          <span className="font-semibold text-amber-700 dark:text-amber-400">Macro tailwind: </span>
          {opp.macro_tailwind}
        </div>
        <div>
          <span className="font-semibold text-amber-700 dark:text-amber-400">The non-obvious link: </span>
          {opp.second_order_logic}
        </div>
        <div>
          <span className="font-semibold text-foreground/50">Why not crowded: </span>
          {opp.why_not_crowded}
        </div>
      </div>
    </div>
  );
}

function SummaryContent({ summary }: { summary: InsightsSummary }) {
  const [expanded, setExpanded] = useState(true);

  if (!summary.letter) {
    return (
      <div className="text-base text-foreground/60 p-4">
        Brief format not yet generated. Click Regenerate to get the new letter format.
      </div>
    );
  }

  const sections = parseLetterSections(summary.letter);

  return (
    <Card className="border-primary/30 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <CardTitle className="text-xl">Weekly Letter</CardTitle>
            <Badge variant="outline" className="text-xs px-2 py-0.5 text-foreground/60">
              {summary.newsletters_analyzed} newsletters · {summary.insights_analyzed} insights
            </Badge>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>

        {summary.weekly_priority && (
          <div className="mt-3 p-3.5 rounded-lg bg-primary/10 border border-primary/30">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-primary" />
              <span className="text-sm font-bold text-primary uppercase">This Week's Priority</span>
            </div>
            <p className="text-[15px] text-foreground font-medium">{summary.weekly_priority}</p>
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-8 pt-0">
          {/* Narrative: What To Do This Week */}
          {sections.what_to_do_this_week && (
            <NarrativeSection title="What To Do This Week" content={sections.what_to_do_this_week} />
          )}

          {/* Narrative: One-Line Summary */}
          {sections.one_line_summary && (
            <div className="p-3.5 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-[15px] font-semibold text-foreground">{sections.one_line_summary}</p>
            </div>
          )}

          {/* Narrative: State of the Market */}
          {sections.state_of_the_market && (
            <NarrativeSection title="State of the Market" content={sections.state_of_the_market} />
          )}

          {/* Narrative: Portfolio */}
          {sections.what_this_means_for_your_portfolio && (
            <NarrativeSection title="What This Means For Your Portfolio" content={sections.what_this_means_for_your_portfolio} />
          )}

          {/* Structured: Country Tilts */}
          <div>
            <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4 text-accent" />
              Country / Region Tilts
            </h3>
            {summary.country_tilts?.length > 0 ? (
              <div className="space-y-2">
                {summary.country_tilts.map((t, i) => (
                  <CountryTiltCard key={i} tilt={t} />
                ))}
              </div>
            ) : (
              <p className="text-sm text-foreground/50 italic">No geographic signals this week</p>
            )}
          </div>

          {/* Structured: Sector Tilts */}
          {summary.sector_tilts?.length > 0 && (
            <div>
              <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-accent" />
                Sector Tilts
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {summary.sector_tilts.map((t, i) => (
                  <SectorTiltCard key={i} tilt={t} />
                ))}
              </div>
            </div>
          )}

          {/* Structured: Stocks to Research */}
          {summary.stocks_to_research?.length > 0 && (
            <div>
              <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
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

          {/* Narrative: What to Watch */}
          {sections.what_to_watch_next_week && (
            <NarrativeSection title="What To Watch Next Week" content={sections.what_to_watch_next_week} />
          )}

          {/* Contrarian Opportunities */}
          {summary.contrarian_opportunities?.length > 0 && (
            <div>
              <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                Contrarian Opportunities
                <Badge variant="outline" className="text-xs px-2 py-0.5 border-amber-500/30 text-amber-700 dark:text-amber-400">
                  speculative
                </Badge>
              </h3>
              <div className="space-y-2">
                {summary.contrarian_opportunities.map((opp, i) => (
                  <ContrarianCard key={i} opp={opp} />
                ))}
              </div>
            </div>
          )}

          {/* Crowded Trades */}
          {summary.crowded_trades?.length > 0 && (
            <div>
              <h3 className="text-base font-bold text-foreground mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-warning" />
                Crowded Trades
              </h3>
              <ul className="space-y-2">
                {summary.crowded_trades.map((trade, i) => (
                  <li key={i} className="text-sm text-foreground/70 flex gap-2 p-2.5 rounded-lg bg-warning/5 border border-warning/20">
                    <span className="text-warning mt-0.5">⚠</span>
                    {trade}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-foreground/40 text-right">
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
              <p className="text-base font-medium text-foreground">Weekly Intelligence Letter</p>
              <p className="text-sm text-foreground/60 mt-1">
                Generate an opinionated weekly letter from your last 10 days of newsletter insights
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

      {summary && <SummaryContent summary={summary} />}
    </div>
  );
}
