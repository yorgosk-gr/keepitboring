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

export function BondRecommendationsCard({ bondRecs }: BondRecommendationsCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Landmark className="w-5 h-5 text-primary" />
            Bond Allocation Strategy
          </CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Current: {bondRecs.current_bond_percent}%</span>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            <span className="font-medium text-foreground">Target: {bondRecs.target_bond_percent}%</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Strategy Summary */}
        <p className="text-sm text-muted-foreground bg-secondary/50 rounded-lg p-3 border border-border">
          {bondRecs.strategy_summary}
        </p>

        {/* Duration Allocation */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Duration Allocation</h4>
          <div className="space-y-3">
            {bondRecs.duration_allocation.map((d) => (
              <div key={d.duration} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{d.duration}</span>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{d.current_percent_of_bonds}%</span>
                    <ArrowRight className="w-3 h-3 text-muted-foreground" />
                    <span className="font-medium text-foreground">{d.target_percent_of_bonds}%</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="h-2 bg-secondary rounded-full overflow-hidden flex gap-0.5">
                  <div
                    className="h-full bg-muted-foreground/40 rounded-full transition-all"
                    style={{ width: `${d.current_percent_of_bonds}%` }}
                    title={`Current: ${d.current_percent_of_bonds}%`}
                  />
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${d.target_percent_of_bonds}%` }}
                    title={`Target: ${d.target_percent_of_bonds}%`}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{d.reasoning}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Geography + Type Split side by side */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Geography */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Geography</h4>
            <div className="space-y-2">
              {bondRecs.geography_allocation.map((g) => (
                <div key={g.region} className="p-2 rounded-lg bg-secondary/30 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{g.region}</span>
                    <span className="text-sm text-primary font-medium">{g.target_percent_of_bonds}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{g.reasoning}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Type Split */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Bond Type</h4>
            <div className="space-y-2">
              {bondRecs.type_split.government_percent > 0 && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border">
                  <span className="text-sm text-foreground">Government</span>
                  <span className="text-sm text-primary font-medium">{bondRecs.type_split.government_percent}%</span>
                </div>
              )}
              {bondRecs.type_split.corporate_percent > 0 && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border">
                  <span className="text-sm text-foreground">Corporate</span>
                  <span className="text-sm text-primary font-medium">{bondRecs.type_split.corporate_percent}%</span>
                </div>
              )}
              {bondRecs.type_split.inflation_linked_percent > 0 && (
                <div className="flex items-center justify-between p-2 rounded-lg bg-secondary/30 border border-border">
                  <span className="text-sm text-foreground">Inflation-Linked</span>
                  <span className="text-sm text-primary font-medium">{bondRecs.type_split.inflation_linked_percent}%</span>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">{bondRecs.type_split.reasoning}</p>
            </div>
          </div>
        </div>

        {/* Current Holdings Assessment */}
        {bondRecs.current_holdings_assessment?.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Current Bond Holdings</h4>
            <div className="space-y-2">
              {bondRecs.current_holdings_assessment.map((h) => (
                <div key={h.ticker} className="p-3 rounded-lg bg-secondary/30 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{h.ticker}</span>
                      <span className="text-xs text-muted-foreground">{h.duration} · {h.region} · {h.type}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{h.current_percent_of_bonds}% of bonds</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{h.assessment}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended ETFs */}
        {bondRecs.recommended_etfs?.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Recommended Bond ETFs
            </h4>
            <div className="space-y-2">
              {bondRecs.recommended_etfs.map((etf) => (
                <div key={etf.ticker} className="p-3 rounded-lg bg-secondary/30 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-foreground">{etf.ticker}</span>
                      <Badge variant="outline" className={actionColors[etf.action] || ""}>
                        {etf.action}
                      </Badge>
                    </div>
                    <span className="text-sm text-primary font-medium">{etf.target_percent_of_bonds}% of bonds</span>
                  </div>
                  <p className="text-xs text-foreground mb-1">{etf.name}</p>
                  <p className="text-xs text-muted-foreground">{etf.duration} · {etf.region} · {etf.type}</p>
                  <p className="text-xs text-muted-foreground mt-1">{etf.reasoning}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
