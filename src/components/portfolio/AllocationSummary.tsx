import { Progress } from "@/components/ui/progress";

interface AllocationSummaryProps {
  stocksPercent: number;
  etfsPercent: number;
  isLoading?: boolean;
}

function getAllocationStatus(actual: number, target: number, tolerance: number = 5) {
  const diff = Math.abs(actual - target);
  return diff <= tolerance ? "on-target" : "off-target";
}

export function AllocationSummary({ stocksPercent, etfsPercent, isLoading }: AllocationSummaryProps) {
  const stocksStatus = getAllocationStatus(stocksPercent, 20);
  const etfsStatus = getAllocationStatus(etfsPercent, 80);

  if (isLoading) {
    return (
      <div className="stat-card">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-secondary rounded w-1/4" />
          <div className="h-2 bg-secondary rounded" />
          <div className="h-4 bg-secondary rounded w-1/4" />
          <div className="h-2 bg-secondary rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="stat-card">
      <h3 className="text-sm font-medium text-muted-foreground mb-4">Allocation Summary</h3>
      
      <div className="space-y-4">
        {/* Stocks */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground font-medium">Stocks</span>
            <span className={stocksStatus === "on-target" ? "text-primary" : "text-warning"}>
              {stocksPercent.toFixed(1)}% <span className="text-muted-foreground">/ Target: 20%</span>
            </span>
          </div>
          <Progress 
            value={stocksPercent} 
            className="h-2"
            style={{
              // @ts-ignore - CSS variable for progress indicator color
              "--progress-color": stocksStatus === "on-target" ? "hsl(160, 84%, 39%)" : "hsl(38, 92%, 50%)",
            } as React.CSSProperties}
          />
        </div>

        {/* ETFs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground font-medium">ETFs</span>
            <span className={etfsStatus === "on-target" ? "text-primary" : "text-warning"}>
              {etfsPercent.toFixed(1)}% <span className="text-muted-foreground">/ Target: 80%</span>
            </span>
          </div>
          <Progress 
            value={etfsPercent} 
            className="h-2"
            style={{
              // @ts-ignore - CSS variable for progress indicator color
              "--progress-color": etfsStatus === "on-target" ? "hsl(160, 84%, 39%)" : "hsl(38, 92%, 50%)",
            } as React.CSSProperties}
          />
        </div>
      </div>
    </div>
  );
}
