import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { AllocationCheck } from "@/hooks/usePortfolioAnalysis";

interface AllocationDisplayProps {
  allocation: AllocationCheck;
}

export function AllocationDisplay({ allocation }: AllocationDisplayProps) {
  const getStatusIcon = (status: "ok" | "warning" | "critical") => {
    switch (status) {
      case "ok":
        return <CheckCircle2 className="w-5 h-5 text-primary" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case "critical":
        return <XCircle className="w-5 h-5 text-destructive" />;
    }
  };

  const getStatusColor = (status: "ok" | "warning" | "critical") => {
    switch (status) {
      case "ok":
        return "bg-primary";
      case "warning":
        return "bg-yellow-500";
      case "critical":
        return "bg-destructive";
    }
  };

  return (
    <div className="stat-card space-y-6">
      <h3 className="text-lg font-semibold text-foreground">Allocation Check</h3>

      {/* Stocks */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(allocation.stocks_status)}
            <span className="font-medium">Stocks</span>
          </div>
          <span className="text-sm">
            {allocation.stocks_percent.toFixed(1)}% 
            <span className="text-muted-foreground"> / Target: 15-25%</span>
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <div 
            className={cn("h-full transition-all", getStatusColor(allocation.stocks_status))}
            style={{ width: `${Math.min(allocation.stocks_percent, 100)}%` }}
          />
          {/* Target zone indicator */}
          <div className="absolute top-0 bottom-0 left-[15%] w-[10%] bg-foreground/10 border-l border-r border-foreground/20" />
        </div>
      </div>

      {/* ETFs */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(allocation.etfs_status)}
            <span className="font-medium">ETFs</span>
          </div>
          <span className="text-sm">
            {allocation.etfs_percent.toFixed(1)}% 
            <span className="text-muted-foreground"> / Target: 75-85%</span>
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <div 
            className={cn("h-full transition-all", getStatusColor(allocation.etfs_status))}
            style={{ width: `${Math.min(allocation.etfs_percent, 100)}%` }}
          />
          {/* Target zone indicator */}
          <div className="absolute top-0 bottom-0 left-[75%] w-[10%] bg-foreground/10 border-l border-r border-foreground/20" />
        </div>
      </div>

      {/* Issues */}
      {allocation.issues.length > 0 && (
        <div className="pt-2 border-t border-border">
          <p className="text-sm font-medium text-muted-foreground mb-2">Issues:</p>
          <ul className="space-y-1">
            {allocation.issues.map((issue, i) => (
              <li key={i} className="text-sm text-destructive flex items-start gap-2">
                <span className="mt-1">•</span>
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
