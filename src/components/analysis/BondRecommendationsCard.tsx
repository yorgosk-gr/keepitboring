import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Landmark, ArrowRight, ChevronDown, ChevronUp, Info } from "lucide-react";

export interface BondAction {
  ticker: string;
  name: string;
  action: "HOLD" | "BUY" | "INCREASE" | "REDUCE" | "SELL";
  current_percent_of_bonds: number | null;
  target_percent_of_bonds: number;
  reasoning: string;
}

export interface BondRecommendations {
  current_bond_percent: number;
  target_bond_percent: number;
  strategy_summary: string;
  bond_actions: BondAction[];
  funding_note: string | null;
  // Legacy fields — keep for backward compat with old analysis results
  duration_allocation?: any[];
  geography_allocation?: any[];
  type_split?: any;
  recommended_etfs?: any[];
  current_holdings_assessment?: any[];
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
  // Normalize: support both new bond_actions and legacy recommended_etfs
  const actions: BondAction[] = bondRecs.bond_actions ?? 
    (bondRecs.recommended_etfs ?? []).map((etf: any) => ({
      ticker: etf.ticker,
      name: etf.name,
      action: etf.action,
      current_percent_of_bonds: null,
      target_percent_of_bonds: etf.target_percent_of_bonds,
      reasoning: etf.reasoning,
    }));

  const activeActions = actions.filter((a) => a.action !== "HOLD");
  const holdActions = actions.filter((a) => a.action === "HOLD");
  const allHolds = activeActions.length === 0 && holdActions.length > 0;

  // Auto-expand holds when there are no active changes (so users see the sleeve)
  const [showHolds, setShowHolds] = useState(allHolds);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Landmark className="w-5 h-5 text-primary" />
            Bond Strategy
          </CardTitle>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{bondRecs.current_bond_percent}%</span>
            {bondRecs.current_bond_percent !== bondRecs.target_bond_percent && (
              <>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span className="font-medium text-foreground">{bondRecs.target_bond_percent}%</span>
              </>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{bondRecs.strategy_summary}</p>
      </CardHeader>

      <CardContent className="space-y-3 pt-2">
        {allHolds && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2 border border-border">
            <Info className="w-4 h-4 text-primary shrink-0" />
            Bond sleeve on target — current holdings maintained.
          </div>
        )}

        {/* Active actions (BUY/SELL/INCREASE/REDUCE) */}
        {activeActions.length > 0 && (
          <div className="space-y-1">
            {activeActions.map((a) => (
              <ActionRow key={a.ticker} action={a} />
            ))}
          </div>
        )}

        {/* Collapsible HOLDs */}
        {holdActions.length > 0 && (
          <div>
            <button
              onClick={() => setShowHolds(!showHolds)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full py-1"
            >
              {showHolds ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {holdActions.length} holding{holdActions.length !== 1 ? "s" : ""} unchanged
            </button>
            {showHolds && (
              <div className="space-y-1 mt-1">
                {holdActions.map((a) => (
                  <ActionRow key={a.ticker} action={a} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Funding note */}
        {bondRecs.funding_note && activeActions.length > 0 && (
          <p className="text-xs text-muted-foreground border-t border-border pt-2">
            💰 {bondRecs.funding_note}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ActionRow({ action }: { action: BondAction }) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-border last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono font-semibold text-foreground w-12 shrink-0">{action.ticker}</span>
        <Badge variant="outline" className={`text-sm px-1.5 py-0.5 shrink-0 ${actionColors[action.action] || ""}`}>
          {action.action}
        </Badge>
        {action.current_percent_of_bonds != null && action.current_percent_of_bonds !== action.target_percent_of_bonds && (
          <span className="text-xs text-muted-foreground shrink-0">
            {action.current_percent_of_bonds}→{action.target_percent_of_bonds}%
          </span>
        )}
        <span className="text-xs text-muted-foreground truncate">{action.reasoning}</span>
      </div>
      <span className="text-xs text-primary font-medium whitespace-nowrap">{action.target_percent_of_bonds}%</span>
    </div>
  );
}
