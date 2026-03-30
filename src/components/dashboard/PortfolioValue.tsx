import { Layers, Wallet, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PortfolioValueProps {
  totalValue: number;
  dailyChange?: number;
  dailyChangePercent?: number;
  positionsCount: number;
  cashBalance: number;
  isLoading?: boolean;
}

export function PortfolioValue({
  totalValue,
  dailyChange,
  dailyChangePercent,
  positionsCount,
  cashBalance,
  isLoading
}: PortfolioValueProps) {
  if (isLoading) {
    return (
      <div className="stat-card">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-10 w-48" />
      </div>
    );
  }

  const hasChange = dailyChange != null && dailyChange !== 0;
  const isPositive = (dailyChange ?? 0) >= 0;

  return (
    <div className="stat-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground mb-1">Total Portfolio Value</p>
        <div className="flex items-baseline gap-3">
          <p className="text-4xl font-bold text-foreground tracking-tight">
            ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
          {hasChange && (
            <div className={`flex items-center gap-1 ${isPositive ? "text-primary" : "text-destructive"}`}>
              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="text-sm font-semibold">
                {isPositive ? "+" : ""}${Math.abs(dailyChange!).toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </span>
              <span className="text-xs">
                ({isPositive ? "+" : ""}{(dailyChangePercent ?? 0).toFixed(2)}%)
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="flex gap-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Layers className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground uppercase tracking-wide">Positions</p>
            <p className="text-lg font-semibold text-foreground">{positionsCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wallet className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground uppercase tracking-wide">Cash</p>
            <p className="text-lg font-semibold text-foreground">
              ${cashBalance.toLocaleString("en-US", { minimumFractionDigits: 0 })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
