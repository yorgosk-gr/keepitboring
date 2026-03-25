import { TrendingDown, TrendingUp, AlertTriangle, BookOpen, Target } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { VolatilityAlert } from "@/hooks/useVolatilityAlerts";

interface VolatilityAlertModalProps {
  open: boolean;
  alerts: VolatilityAlert[];
  onClose: () => void;
  onLogDecision: (ticker: string) => void;
}

function AlertCard({ alert, onLogDecision }: {
  alert: VolatilityAlert;
  onLogDecision: (ticker: string) => void;
}) {
  const isDown = alert.direction === "down";
  const pctStr = `${alert.changePct > 0 ? "+" : ""}${alert.changePct.toFixed(1)}%`;

  return (
    <div className={`p-4 rounded-lg border space-y-3 ${
      isDown
        ? "bg-destructive/5 border-destructive/20"
        : "bg-emerald-500/5 border-emerald-500/20"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isDown
            ? <TrendingDown className="w-5 h-5 text-destructive" />
            : <TrendingUp className="w-5 h-5 text-emerald-500" />
          }
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-foreground">{alert.ticker}</span>
              <Badge
                variant="outline"
                className={isDown
                  ? "text-destructive border-destructive/30 font-mono"
                  : "text-emerald-500 border-emerald-500/30 font-mono"
                }
              >
                {pctStr}
              </Badge>
              {alert.confidence && (
                <Badge variant="outline" className="text-xs">
                  {alert.confidence}/10 conviction
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Now at ${alert.currentPrice.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {isDown && alert.invalidationTrigger && (
        <div className="flex gap-2 p-2.5 rounded bg-destructive/10 border border-destructive/20">
          <Target className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-destructive">Your invalidation trigger:</p>
            <p className="text-xs text-muted-foreground mt-0.5">"{alert.invalidationTrigger}"</p>
            <p className="text-xs text-destructive mt-1 font-medium">Has this been met?</p>
          </div>
        </div>
      )}

      {alert.thesis && (
        <div className="flex gap-2 p-2.5 rounded bg-secondary/50 border border-border">
          <BookOpen className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-medium text-muted-foreground">Your original thesis:</p>
            <p className="text-xs text-foreground mt-0.5 line-clamp-3">
              "{alert.thesis}"
            </p>
          </div>
        </div>
      )}

      {!alert.thesis && isDown && (
        <p className="text-xs text-amber-500">
          No thesis documented for this position. Consider adding one before deciding.
        </p>
      )}

      {isDown && (
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-2 text-xs"
          onClick={() => onLogDecision(alert.ticker)}
        >
          <BookOpen className="w-3.5 h-3.5" />
          Log a decision on {alert.ticker}
        </Button>
      )}
    </div>
  );
}

export function VolatilityAlertModal({
  open,
  alerts,
  onClose,
  onLogDecision,
}: VolatilityAlertModalProps) {
  const drops = alerts.filter(a => a.direction === "down");
  const rises = alerts.filter(a => a.direction === "up");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Significant Price Moves Detected
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4 pr-1">
            <p className="text-sm text-muted-foreground">
              {alerts.length} position{alerts.length !== 1 ? "s" : ""} moved more than 10%.
              {drops.length > 0 && " Review your thesis before making any decisions."}
            </p>

            {drops.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-destructive flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" />
                  Significant drops — review your thesis
                </h3>
                {drops.map(alert => (
                  <AlertCard key={alert.ticker} alert={alert} onLogDecision={onLogDecision} />
                ))}
              </div>
            )}

            {rises.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-emerald-500 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Significant rises — consider trimming if overweight
                </h3>
                {rises.map(alert => (
                  <AlertCard key={alert.ticker} alert={alert} onLogDecision={onLogDecision} />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="flex justify-end pt-2 border-t border-border">
          <Button variant="outline" onClick={onClose}>Dismiss</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
