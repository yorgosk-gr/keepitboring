import { TrendingDown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PortfolioValueProps {
  totalValue: number;
  dailyChange: number;
  dailyChangePercent: number;
  isLoading?: boolean;
}

export function PortfolioValue({ 
  totalValue, 
  dailyChange, 
  dailyChangePercent,
  isLoading 
}: PortfolioValueProps) {
  const isPositive = dailyChange >= 0;

  if (isLoading) {
    return (
      <div className="stat-card">
        <Skeleton className="h-4 w-32 mb-2" />
        <Skeleton className="h-10 w-48 mb-3" />
        <Skeleton className="h-5 w-40" />
      </div>
    );
  }

  return (
    <div className="stat-card">
      <p className="text-sm text-muted-foreground mb-1">Total Portfolio Value</p>
      <p className="text-4xl font-bold text-foreground tracking-tight">
        ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </p>
      <div className="flex items-center gap-2 mt-2">
        {isPositive ? (
          <TrendingUp className="w-4 h-4 text-primary" />
        ) : (
          <TrendingDown className="w-4 h-4 text-destructive" />
        )}
        <span className={isPositive ? "text-primary font-medium" : "text-destructive font-medium"}>
          {isPositive ? "+" : ""}${dailyChange.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} ({dailyChangePercent.toFixed(2)}%)
        </span>
        <span className="text-muted-foreground text-sm">Today</span>
      </div>
    </div>
  );
}
