import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HealthScoreGauge } from "./HealthScoreGauge";
import { AllocationDisplay } from "./AllocationDisplay";
import { PositionAlertCard } from "./PositionAlertCard";
import { ThesisComplianceTable } from "./ThesisComplianceTable";
import { MarketSignalsCard } from "./MarketSignalsCard";
import { RecommendedActionsCard } from "./RecommendedActionsCard";
import { TradeRecommendationsCard } from "./TradeRecommendationsCard";
import { BondRecommendationsCard } from "./BondRecommendationsCard";
import { KeyRisksCard } from "./KeyRisksCard";
import { LogDecisionModal } from "@/components/decisions/LogDecisionModal";
import type { AnalysisResult, RecommendedAction } from "@/hooks/usePortfolioAnalysis";

interface AnalysisResultsViewProps {
  analysis: AnalysisResult;
  onMarkCompleted: (index: number) => void;
  onDismiss: (index: number, reason: string) => void;
}

export function AnalysisResultsView({
  analysis,
  onMarkCompleted,
  onDismiss,
}: AnalysisResultsViewProps) {
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [selectedRecommendation, setSelectedRecommendation] = useState<RecommendedAction | null>(null);

  const handleLogDecision = (recommendation?: RecommendedAction) => {
    setSelectedRecommendation(recommendation || null);
    setShowDecisionModal(true);
  };

  const handleCloseModal = () => {
    setShowDecisionModal(false);
    setSelectedRecommendation(null);
  };
  const criticalAlerts = analysis.position_alerts.filter((a) => a.severity === "critical");
  const warningAlerts = analysis.position_alerts.filter((a) => a.severity === "warning");

  // Format analysis meta info
  const meta = analysis.analysis_meta;
  const getMetaDescription = () => {
    if (!meta) return null;
    
    const parts: string[] = [];
    parts.push(`${meta.insightsCount} insights from ${meta.newslettersCount} newsletters`);
    
    if (meta.oldestDate && meta.newestDate) {
      const oldest = new Date(meta.oldestDate);
      const newest = new Date(meta.newestDate);
      const daysDiff = Math.ceil((newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24));
      parts.push(`last ${daysDiff} days`);
    }
    
    return parts.join(" • ");
  };

  return (
    <div className="space-y-6">
      {/* Header with timestamp and meta */}
      <div className="space-y-2">
        {analysis.created_at && (
          <p className="text-sm text-muted-foreground">
            Analysis from {format(new Date(analysis.created_at), "PPpp")}
          </p>
        )}
        
        {meta && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline" className="gap-1 bg-primary/5">
              <Info className="w-3 h-3" />
              {getMetaDescription()}
            </Badge>
            {meta.portfolioMentions > 0 && (
              <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                {meta.portfolioMentions} portfolio mentions
              </Badge>
            )}
            {meta.bubbleSignals > 0 && (
              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                {meta.bubbleSignals} bubble signals
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="p-4 rounded-lg bg-secondary/50 border border-border">
        <p className="text-foreground">{analysis.summary}</p>
      </div>

      {/* Top Row: Health Score + Allocation */}
      <div className="grid gap-6 md:grid-cols-2">
        <HealthScoreGauge score={analysis.portfolio_health_score} />
        <AllocationDisplay allocation={analysis.allocation_check} />
      </div>

      {/* Key Risks */}
      <KeyRisksCard risks={analysis.key_risks} />

      {/* Position Alerts */}
      {analysis.position_alerts.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-foreground">
            Position Alerts ({analysis.position_alerts.length})
          </h3>
          
          {/* Critical first */}
          {criticalAlerts.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-destructive">
                Critical ({criticalAlerts.length})
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {criticalAlerts.map((alert, i) => (
                  <PositionAlertCard key={`critical-${i}`} alert={alert} />
                ))}
              </div>
            </div>
          )}

          {/* Then warnings */}
          {warningAlerts.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-yellow-500">
                Warnings ({warningAlerts.length})
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {warningAlerts.map((alert, i) => (
                  <PositionAlertCard key={`warning-${i}`} alert={alert} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Market Signals */}
      <MarketSignalsCard signals={analysis.market_signals} />

      {/* Bond Allocation Strategy */}
      {analysis.bond_recommendations && (
        <BondRecommendationsCard bondRecs={analysis.bond_recommendations} />
      )}

      {/* Trade Recommendations */}
      {analysis.trade_recommendations && analysis.trade_recommendations.length > 0 && (
        <TradeRecommendationsCard
          recommendations={analysis.trade_recommendations}
          summary={analysis.rebalancing_summary}
        />
      )}

      {/* Thesis Compliance */}
      <ThesisComplianceTable checks={analysis.thesis_checks} />

      {/* Recommended Actions */}
      <RecommendedActionsCard
        actions={analysis.recommended_actions}
        onMarkCompleted={onMarkCompleted}
        onDismiss={onDismiss}
        onLogDecision={handleLogDecision}
      />

      {/* Decision Modal */}
      <LogDecisionModal
        open={showDecisionModal}
        onClose={handleCloseModal}
        recommendation={selectedRecommendation}
      />
    </div>
  );
}
