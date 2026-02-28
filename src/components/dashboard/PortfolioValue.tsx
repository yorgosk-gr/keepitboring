import { Layers, Wallet } from "lucide-react";
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

  return (
    <div className="stat-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <p className="text-sm text-muted-foreground mb-1">Total Portfolio Value</p>
        <p className="text-4xl font-bold text-foreground tracking-tight">
          ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
        </p>
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
