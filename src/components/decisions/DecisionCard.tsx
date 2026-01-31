import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  ShoppingCart,
  Trash2,
  Scissors,
  Plus,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type DecisionLog } from "@/hooks/useDecisionLogs";

const actionIcons: Record<string, React.ReactNode> = {
  buy: <ShoppingCart className="w-4 h-4 text-emerald-500" />,
  sell: <Trash2 className="w-4 h-4 text-red-500" />,
  trim: <Scissors className="w-4 h-4 text-amber-500" />,
  add: <Plus className="w-4 h-4 text-blue-500" />,
  hold: <Minus className="w-4 h-4 text-muted-foreground" />,
  rebalance: <RefreshCw className="w-4 h-4 text-purple-500" />,
};

const actionColors: Record<string, string> = {
  buy: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  sell: "bg-red-500/10 text-red-500 border-red-500/20",
  trim: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  add: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  hold: "bg-muted text-muted-foreground border-border",
  rebalance: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

interface DecisionCardProps {
  decision: DecisionLog;
  onAddOutcome: (id: string, outcome: string) => void;
  isAddingOutcome: boolean;
}

export function DecisionCard({ decision, onAddOutcome, isAddingOutcome }: DecisionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [showOutcomeForm, setShowOutcomeForm] = useState(false);
  const [outcomeText, setOutcomeText] = useState("");

  const handleSaveOutcome = () => {
    if (outcomeText.trim()) {
      onAddOutcome(decision.id, outcomeText.trim());
      setShowOutcomeForm(false);
      setOutcomeText("");
    }
  };

  return (
    <Card className="border-border bg-card hover:bg-secondary/30 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="mt-1">
              {actionIcons[decision.action_type || "hold"]}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={cn("capitalize", actionColors[decision.action_type || "hold"])}
                >
                  {decision.action_type || "hold"}
                </Badge>
                {decision.position_ticker ? (
                  <Badge variant="outline" className="font-mono">
                    {decision.position_ticker}
                  </Badge>
                ) : (
                  <Badge variant="secondary">Portfolio-wide</Badge>
                )}
                {decision.confidence_level && (
                  <span className="text-xs text-muted-foreground">
                    Confidence: {decision.confidence_level}/10
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {formatDistanceToNow(new Date(decision.created_at), { addSuffix: true })}
                {" • "}
                {format(new Date(decision.created_at), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Reasoning - always visible */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Reasoning</p>
          <p className="text-sm text-foreground">{decision.reasoning || "—"}</p>
        </div>

        {/* Probability Estimate */}
        {decision.probability_estimate && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">Probability</p>
            <p className="text-sm text-foreground">{decision.probability_estimate}</p>
          </div>
        )}

        {/* Expanded Details */}
        {expanded && (
          <div className="space-y-3 pt-3 border-t border-border">
            {decision.information_set && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Information at Decision Time
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap">
                  {decision.information_set}
                </p>
              </div>
            )}

            {decision.invalidation_triggers && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  What Would Make This Wrong?
                </p>
                <p className="text-sm text-foreground">{decision.invalidation_triggers}</p>
              </div>
            )}
          </div>
        )}

        {/* Outcome Section */}
        {decision.outcome_notes ? (
          <div className="pt-3 border-t border-border">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-3 h-3 text-amber-500" />
              <p className="text-xs font-medium text-amber-500">Outcome Recorded</p>
            </div>
            <p className="text-sm text-foreground">{decision.outcome_notes}</p>
          </div>
        ) : (
          <div className="pt-3 border-t border-border">
            {showOutcomeForm ? (
              <div className="space-y-2">
                <Textarea
                  value={outcomeText}
                  onChange={(e) => setOutcomeText(e.target.value)}
                  placeholder="What was the outcome? Was the process good regardless of result?"
                  rows={3}
                  className="resize-none"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveOutcome}
                    disabled={!outcomeText.trim() || isAddingOutcome}
                  >
                    Save Outcome
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowOutcomeForm(false);
                      setOutcomeText("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1 text-xs"
                onClick={() => setShowOutcomeForm(true)}
              >
                <MessageSquare className="w-3 h-3" />
                Add Outcome
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
