import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Landmark, ArrowRight, TrendingUp } from "lucide-react";

export interface BondDurationAllocation {
  duration: string;
  current_percent_of_bonds: number;
  target_percent_of_bonds: number;
  reasoning: string;
}

export interface BondGeographyAllocation {
  region: string;
  target_percent_of_bonds: number;
  reasoning: string;
}

export interface BondTypeSplit {
  government_percent: number;
  corporate_percent: number;
  inflation_linked_percent: number;
  reasoning: string;
}

export interface BondETFRecommendation {
  ticker: string;
  name: string;
  duration: string;
  region: string;
  type: string;
  action: "HOLD" | "BUY" | "INCREASE" | "REDUCE" | "SELL";
  target_percent_of_bonds: number;
  reasoning: string;
}

export interface BondHoldingAssessment {
  ticker: string;
  name: string;
  duration: string;
  region: string;
  type: string;
  current_percent_of_bonds: number;
  assessment: string;
}

export interface BondRecommendations {
  current_bond_percent: number;
  target_bond_percent: number;
  strategy_summary: string;
  duration_allocation: BondDurationAllocation[];
  geography_allocation: BondGeographyAllocation[];
  type_split: BondTypeSplit;
  recommended_etfs: BondETFRecommendation[];
  current_holdings_assessment: BondHoldingAssessment[];
}

interface BondRecommendationsCardProps {
  bondRecs: BondRecommendations;
}

const actionColors: Record<string, string> = {
  BUY: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  INCREASE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  HOLD: "bg-primary/10 text-primary border-primary/20",
  REDUCE: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  SELL: "bg-destructive/15 text-destructive border-destructive/30",
};

const typeEntries = (ts: BondTypeSplit) =>
  [
    { label: "Gov", value: ts.government_percent },
    { label: "Corp", value: ts.corporate_percent },
    { label: "Infl-Linked", value: ts.inflation_linked_percent },
  ].filter((e) => e.value > 0);

export function BondRecommendationsCard({ bondRecs }: BondRecommendationsCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Landmark className="w-5 h-5 text-primary" />
            Bond Strategy
          </CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{bondRecs.current_bond_percent}%</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="font-medium text-foreground">{bondRecs.target_bond_percent}%</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{bondRecs.strategy_summary}</p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Duration + Geography + Type in a compact grid */}
        <div className="grid gap-3 md:grid-cols-3">
          {/* Duration */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Duration</h4>
            <div className="space-y-1.5">
              {bondRecs.duration_allocation.map((d) => (
                <div key={d.duration} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground">{d.duration}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.current_percent_of_bonds}→{d.target_percent_of_bonds}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Geography */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Geography</h4>
            <div className="space-y-1.5">
              {bondRecs.geography_allocation.map((g) => (
                <div key={g.region} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{g.region}</span>
                  <span className="text-xs text-primary font-medium">{g.target_percent_of_bonds}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Type */}
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Type Split</h4>
            <div className="space-y-1.5">
              {typeEntries(bondRecs.type_split).map((e) => (
                <div key={e.label} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">{e.label}</span>
                  <span className="text-xs text-primary font-medium">{e.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Current Holdings - compact table-like */}
        {bondRecs.current_holdings_assessment?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Current Holdings</h4>
            <div className="space-y-1">
              {bondRecs.current_holdings_assessment.map((h) => (
                <div key={h.ticker} className="flex items-center justify-between gap-2 text-sm py-1 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-semibold text-foreground">{h.ticker}</span>
                    <span className="text-xs text-muted-foreground truncate">{h.assessment}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{h.current_percent_of_bonds}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended ETFs - compact */}
        {bondRecs.recommended_etfs?.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5 text-primary" />
              Recommended
            </h4>
            <div className="space-y-1.5">
              {bondRecs.recommended_etfs.map((etf) => (
                <div key={etf.ticker} className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono font-semibold text-foreground">{etf.ticker}</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${actionColors[etf.action] || ""}`}>
                      {etf.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground truncate">{etf.reasoning}</span>
                  </div>
                  <span className="text-xs text-primary font-medium whitespace-nowrap">{etf.target_percent_of_bonds}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
