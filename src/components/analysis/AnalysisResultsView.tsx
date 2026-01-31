import { useState } from "react";
import { format } from "date-fns";
import { HealthScoreGauge } from "./HealthScoreGauge";
import { AllocationDisplay } from "./AllocationDisplay";
import { PositionAlertCard } from "./PositionAlertCard";
import { ThesisComplianceTable } from "./ThesisComplianceTable";
import { MarketSignalsCard } from "./MarketSignalsCard";
import { RecommendedActionsCard } from "./RecommendedActionsCard";
import { KeyRisksCard } from "./KeyRisksCard";
import { LogDecisionModal } from "@/components/decisions/LogDecisionModal";
import type { AnalysisResult } from "@/hooks/usePortfolioAnalysis";

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

  const criticalAlerts = analysis.position_alerts.filter((a) => a.severity === "critical");
  const warningAlerts = analysis.position_alerts.filter((a) => a.severity === "warning");

  return (
    <div className="space-y-6">
      {/* Header with timestamp */}
      {analysis.created_at && (
        <p className="text-sm text-muted-foreground">
          Analysis from {format(new Date(analysis.created_at), "PPpp")}
        </p>
      )}

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

      {/* Thesis Compliance */}
      <ThesisComplianceTable checks={analysis.thesis_checks} />

      {/* Recommended Actions */}
      <RecommendedActionsCard
        actions={analysis.recommended_actions}
        onMarkCompleted={onMarkCompleted}
        onDismiss={onDismiss}
        onLogDecision={() => setShowDecisionModal(true)}
      />

      {/* Decision Modal */}
      <LogDecisionModal
        open={showDecisionModal}
        onClose={() => setShowDecisionModal(false)}
      />
    </div>
  );
}
