import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, XCircle, PieChart } from "lucide-react";
import type { AllocationCheck } from "@/hooks/usePortfolioAnalysis";

interface AllocationDisplayProps {
  allocation: AllocationCheck;
}

export function AllocationDisplay({ allocation }: AllocationDisplayProps) {
  // Safe status getter with fallback
  const getStatus = (status: "ok" | "warning" | "critical" | undefined): "ok" | "warning" | "critical" => {
    return status ?? "ok";
  };

  const getStatusIcon = (status: "ok" | "warning" | "critical" | undefined) => {
    const safeStatus = getStatus(status);
    switch (safeStatus) {
      case "ok":
        return <CheckCircle2 className="w-5 h-5 text-primary" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case "critical":
        return <XCircle className="w-5 h-5 text-destructive" />;
    }
  };

  const getStatusColor = (status: "ok" | "warning" | "critical" | undefined) => {
    const safeStatus = getStatus(status);
    switch (safeStatus) {
      case "ok":
        return "bg-primary";
      case "warning":
        return "bg-yellow-500";
      case "critical":
        return "bg-destructive";
    }
  };

  // Safely access allocation values with fallbacks
  const equitiesPercent = allocation?.equities_percent ?? 0;
  const bondsPercent = allocation?.bonds_percent ?? 0;
  const commoditiesPercent = allocation?.commodities_percent ?? 0;
  const cashPercent = allocation?.cash_percent ?? 0;

  return (
    <div className="stat-card space-y-5">
      <h3 className="text-lg font-semibold text-foreground">Allocation Check</h3>

      {/* Equities */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(allocation?.equities_status)}
            <span className="font-medium">Equities</span>
          </div>
          <span className="text-sm">
            {equitiesPercent.toFixed(1)}% 
            <span className="text-muted-foreground"> / Target: ≤70%</span>
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <div 
            className={cn("h-full transition-all", getStatusColor(allocation?.equities_status))}
            style={{ width: `${Math.min(equitiesPercent, 100)}%` }}
          />
          {/* Target zone indicator at 70% */}
          <div className="absolute top-0 bottom-0 left-[70%] w-px bg-foreground/40" />
        </div>
      </div>

      {/* Bonds */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(allocation?.bonds_status)}
            <span className="font-medium">Bonds</span>
          </div>
          <span className="text-sm">
            {bondsPercent.toFixed(1)}% 
            <span className="text-muted-foreground"> / Target: ≤20%</span>
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <div 
            className={cn("h-full transition-all", getStatusColor(allocation?.bonds_status))}
            style={{ width: `${Math.min(bondsPercent * 5, 100)}%` }}
          />
          {/* Target zone indicator at 20% (scaled to 100% bar) */}
          <div className="absolute top-0 bottom-0 left-full w-px bg-foreground/40" />
        </div>
      </div>

      {/* Commodities + Gold + Crypto */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(allocation?.commodities_status)}
            <span className="font-medium">Commodities / Gold / Crypto</span>
          </div>
          <span className="text-sm">
            {commoditiesPercent.toFixed(1)}% 
            <span className="text-muted-foreground"> / Target: ≤10%</span>
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <div 
            className={cn("h-full transition-all", getStatusColor(allocation?.commodities_status))}
            style={{ width: `${Math.min(commoditiesPercent * 10, 100)}%` }}
          />
        </div>
      </div>

      {/* Cash */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Cash</span>
          </div>
          <span className="text-sm">
            {cashPercent.toFixed(1)}%
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <div 
            className="h-full transition-all bg-muted-foreground/50"
            style={{ width: `${Math.min(cashPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Stock/ETF Split */}
      {allocation.stocks_vs_etf_split && (
        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-sm">
            <PieChart className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Within equities:</span>
            <span className="font-medium">{allocation.stocks_vs_etf_split}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-6">
            Target: 15-25% stocks / 75-85% ETFs
          </p>
        </div>
      )}

      {/* Issues */}
      {allocation.issues && allocation.issues.length > 0 && (
        <div className="pt-3 border-t border-border">
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
