import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, AlertTriangle, Newspaper, Star } from "lucide-react";

export interface StockPick {
  ticker: string;
  name: string;
  sector: string;
  rationale: string;
  catalysts: string[];
  risks: string[];
  expected_return: string;
  quality_score: "high" | "medium";
  newsletter_mentions: number;
  already_held: boolean;
  action: "BUY" | "ADD" | "WATCH";
}

interface StockPicksCardProps {
  picks: StockPick[];
}

const actionColors: Record<string, string> = {
  BUY: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  ADD: "bg-primary/10 text-primary border-primary/20",
  WATCH: "bg-amber-500/15 text-amber-400 border-amber-500/30",
};

export function StockPicksCard({ picks }: StockPicksCardProps) {
  if (!picks || picks.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Star className="w-5 h-5 text-primary" />
          Quality Stock Picks
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          High-conviction ideas based on newsletter analysis and fundamentals
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {picks.map((pick) => (
          <div
            key={pick.ticker}
            className="p-4 rounded-lg bg-secondary/30 border border-border space-y-3"
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-foreground">
                  {pick.ticker}
                </span>
                <Badge variant="outline" className={actionColors[pick.action] || ""}>
                  {pick.action}
                </Badge>
                {pick.already_held && (
                  <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">
                    In Portfolio
                  </Badge>
                )}
                {pick.quality_score === "high" && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-xs">
                    High Quality
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">{pick.expected_return}</span>
              </div>
            </div>

            {/* Name + Sector */}
            <div>
              <p className="text-sm font-medium text-foreground">{pick.name}</p>
              <p className="text-xs text-muted-foreground">{pick.sector}</p>
            </div>

            {/* Rationale */}
            <p className="text-sm text-muted-foreground leading-relaxed">{pick.rationale}</p>

            {/* Catalysts + Risks side by side */}
            <div className="grid gap-3 md:grid-cols-2">
              {pick.catalysts?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                    Catalysts
                  </p>
                  <ul className="space-y-0.5">
                    {pick.catalysts.map((c, i) => (
                      <li key={i} className="text-xs text-muted-foreground">• {c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {pick.risks?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    Risks
                  </p>
                  <ul className="space-y-0.5">
                    {pick.risks.map((r, i) => (
                      <li key={i} className="text-xs text-muted-foreground">• {r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Newsletter mentions */}
            {pick.newsletter_mentions > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Newspaper className="w-3 h-3" />
                Mentioned in {pick.newsletter_mentions} newsletter{pick.newsletter_mentions > 1 ? "s" : ""}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
