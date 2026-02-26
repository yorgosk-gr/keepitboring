import { Skeleton } from "@/components/ui/skeleton";

interface PortfolioValueProps {
  totalValue: number;
  dailyChange?: number;
  dailyChangePercent?: number;
  isLoading?: boolean;
}

export function PortfolioValue({ 
  totalValue, 
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
    <div className="stat-card">
      <p className="text-sm text-muted-foreground mb-1">Total Portfolio Value</p>
      <p className="text-4xl font-bold text-foreground tracking-tight">
        ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
      </p>
    </div>
  );
}
