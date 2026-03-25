import { useEffect } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2, ArrowRight, Shield } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePreTradeChecklist, type ChecklistItem } from "@/hooks/usePreTradeChecklist";

interface PreTradeChecklistProps {
  open: boolean;
  ticker: string | null;
  actionType: string;
  positionId: string | null;
  onProceed: () => void;
  onCancel: () => void;
}

function ChecklistItemRow({ item }: { item: ChecklistItem }) {
  const icons = {
    pass: <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />,
    warn: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />,
    block: <XCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />,
  };

  const categoryLabels = {
    rule: "Rule",
    signal: "Signal",
    conviction: "Conviction",
    recency: "Recency",
  };

  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${
      item.severity === "block"
        ? "bg-destructive/5 border-destructive/20"
        : item.severity === "warn"
        ? "bg-amber-500/5 border-amber-500/20"
        : "bg-emerald-500/5 border-emerald-500/20"
    }`}>
      {icons[item.severity]}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{item.title}</span>
          <Badge variant="outline" className="text-xs px-1.5 py-0">
            {categoryLabels[item.category]}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{item.detail}</p>
        {item.source && (
          <p className="text-xs text-primary mt-1">📚 {item.source}</p>
        )}
      </div>
    </div>
  );
}

export function PreTradeChecklist({
  open,
  ticker,
  actionType,
  positionId,
  onProceed,
  onCancel,
}: PreTradeChecklistProps) {
  const { runChecklist, isChecking, result, reset } = usePreTradeChecklist();

  useEffect(() => {
    if (open && actionType && actionType !== "hold" && actionType !== "rebalance") {
      runChecklist(ticker, actionType, positionId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticker, actionType, positionId]);

  const handleClose = () => {
    reset();
    onCancel();
  };

  const handleProceed = () => {
    reset();
    onProceed();
  };

  // Skip checklist for hold/rebalance
  useEffect(() => {
    if (open && (actionType === "hold" || actionType === "rebalance")) {
      onProceed();
    }
  }, [open, actionType]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Pre-Trade Checklist
            {ticker && (
              <Badge variant="outline" className="ml-1 font-mono">
                {actionType.toUpperCase()} {ticker}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {isChecking && (
            <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm">Checking rules and signals...</span>
            </div>
          )}

          {result && !isChecking && (
            <>
              {/* Summary bar */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50 border border-border">
                {result.blockCount > 0 && (
                  <span className="text-xs flex items-center gap-1 text-destructive font-medium">
                    <XCircle className="w-3.5 h-3.5" />
                    {result.blockCount} blocked
                  </span>
                )}
                {result.warnCount > 0 && (
                  <span className="text-xs flex items-center gap-1 text-amber-500 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {result.warnCount} warning{result.warnCount > 1 ? "s" : ""}
                  </span>
                )}
                {result.passCount > 0 && (
                  <span className="text-xs flex items-center gap-1 text-emerald-500 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {result.passCount} passed
                  </span>
                )}
              </div>

              {/* Checklist items */}
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {/* Blocks first, then warnings, then passes */}
                {[...result.items]
                  .sort((a, b) => {
                    const order = { block: 0, warn: 1, pass: 2 };
                    return order[a.severity] - order[b.severity];
                  })
                  .map((item) => (
                    <ChecklistItemRow key={item.id} item={item} />
                  ))}
              </div>

              {!result.canProceed && (
                <p className="text-xs text-destructive text-center pt-1">
                  This action is blocked by one or more hard rules. Review your philosophy rules before proceeding.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleProceed}
            disabled={isChecking || (result ? !result.canProceed : false)}
            className="gap-2"
            variant={result?.warnCount && result.warnCount > 0 ? "destructive" : "default"}
          >
            {result?.warnCount && result.warnCount > 0 && !result.blockCount
              ? "Proceed anyway"
              : "Proceed"}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
