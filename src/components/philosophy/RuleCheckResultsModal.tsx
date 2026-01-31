import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type RuleCheckResult } from "@/hooks/usePhilosophyRules";

interface RuleCheckResultsModalProps {
  open: boolean;
  onClose: () => void;
  results: RuleCheckResult[];
}

const statusIcons = {
  passing: <CheckCircle className="w-5 h-5 text-emerald-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  failing: <XCircle className="w-5 h-5 text-red-500" />,
};

export function RuleCheckResultsModal({
  open,
  onClose,
  results,
}: RuleCheckResultsModalProps) {
  const passing = results.filter((r) => r.status === "passing").length;
  const warnings = results.filter((r) => r.status === "warning").length;
  const failing = results.filter((r) => r.status === "failing").length;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-foreground">Rule Check Results</DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="flex items-center justify-center gap-6 py-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-emerald-500">{passing}</div>
            <div className="text-xs text-muted-foreground">Passing</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-amber-500">{warnings}</div>
            <div className="text-xs text-muted-foreground">Warnings</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-500">{failing}</div>
            <div className="text-xs text-muted-foreground">Critical</div>
          </div>
        </div>

        {/* Results List */}
        <ScrollArea className="h-[300px]">
          <div className="space-y-2">
            {results.map((result) => (
              <div
                key={result.rule.id}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border",
                  result.status === "passing" && "border-emerald-500/20 bg-emerald-500/5",
                  result.status === "warning" && "border-amber-500/20 bg-amber-500/5",
                  result.status === "failing" && "border-red-500/20 bg-red-500/5"
                )}
              >
                {statusIcons[result.status]}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm">
                      {result.rule.name}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs",
                        result.status === "passing" &&
                          "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
                        result.status === "warning" &&
                          "bg-amber-500/10 text-amber-500 border-amber-500/20",
                        result.status === "failing" &&
                          "bg-red-500/10 text-red-500 border-red-500/20"
                      )}
                    >
                      {result.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{result.message}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {failing > 0 && (
          <p className="text-xs text-muted-foreground text-center">
            Alerts have been created for violations. View them in the Dashboard.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
