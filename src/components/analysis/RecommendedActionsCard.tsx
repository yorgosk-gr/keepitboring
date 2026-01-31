import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, X, BookOpen } from "lucide-react";
import type { RecommendedAction } from "@/hooks/usePortfolioAnalysis";

interface RecommendedActionsCardProps {
  actions: RecommendedAction[];
  onMarkCompleted: (index: number) => void;
  onDismiss: (index: number, reason: string) => void;
  onLogDecision: () => void;
}

export function RecommendedActionsCard({
  actions,
  onMarkCompleted,
  onDismiss,
  onLogDecision,
}: RecommendedActionsCardProps) {
  const [dismissingIndex, setDismissingIndex] = useState<number | null>(null);
  const [dismissReason, setDismissReason] = useState("");

  const getConfidenceBadge = (confidence: "high" | "medium" | "low") => {
    const styles = {
      high: "bg-primary/10 text-primary border-primary/20",
      medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      low: "bg-muted text-muted-foreground border-muted",
    };
    return styles[confidence];
  };

  const handleDismissConfirm = () => {
    if (dismissingIndex !== null && dismissReason.trim()) {
      onDismiss(dismissingIndex, dismissReason);
      setDismissingIndex(null);
      setDismissReason("");
    }
  };

  const pendingActions = actions.filter((a) => !a.completed && !a.dismissed);
  const completedActions = actions.filter((a) => a.completed || a.dismissed);

  return (
    <div className="stat-card space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Recommended Actions</h3>
        <Button variant="outline" size="sm" onClick={onLogDecision}>
          <BookOpen className="w-4 h-4 mr-2" />
          Log Decision
        </Button>
      </div>

      {/* Pending Actions */}
      <div className="space-y-3">
        {pendingActions.map((action, originalIndex) => {
          const index = actions.indexOf(action);
          return (
            <div
              key={index}
              className="p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm">
                  {action.priority}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-foreground">{action.action}</p>
                    <Badge variant="outline" className={getConfidenceBadge(action.confidence)}>
                      {action.confidence}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{action.reasoning}</p>
                  <div className="flex items-center gap-2 pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:text-primary hover:bg-primary/10"
                      onClick={() => onMarkCompleted(index)}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" />
                      Mark Done
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDismissingIndex(index)}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Dismiss
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {pendingActions.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          All recommendations addressed!
        </div>
      )}

      {/* Completed/Dismissed Actions */}
      {completedActions.length > 0 && (
        <div className="pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground mb-3">Addressed ({completedActions.length})</p>
          <div className="space-y-2">
            {completedActions.map((action, i) => (
              <div
                key={i}
                className={cn(
                  "p-3 rounded-lg text-sm",
                  action.completed ? "bg-primary/5 text-primary" : "bg-muted text-muted-foreground"
                )}
              >
                <div className="flex items-center gap-2">
                  {action.completed ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    <X className="w-4 h-4" />
                  )}
                  <span className="line-through">{action.action}</span>
                </div>
                {action.dismissed && action.dismiss_reason && (
                  <p className="mt-1 ml-6 text-xs">Reason: {action.dismiss_reason}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dismiss Dialog */}
      <Dialog open={dismissingIndex !== null} onOpenChange={() => setDismissingIndex(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss Recommendation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Please provide a reason for dismissing this recommendation:
            </p>
            <Textarea
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              placeholder="e.g., Already addressed in previous rebalance, Not applicable to current strategy..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissingIndex(null)}>
              Cancel
            </Button>
            <Button onClick={handleDismissConfirm} disabled={!dismissReason.trim()}>
              Confirm Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
