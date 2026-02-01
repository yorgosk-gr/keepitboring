import { Progress } from "@/components/ui/progress";

interface AllocationSummaryProps {
  stocksPercent: number;
  etfsPercent: number;
  cashPercent?: number;
  isLoading?: boolean;
}

// Stocks target: 20%, acceptable range: 15-25%
// ETFs target: 80%, acceptable range: 75-85%
function getAllocationStatus(actual: number, target: number, rangeMin: number, rangeMax: number) {
  if (actual >= rangeMin && actual <= rangeMax) {
    return "on-target"; // Green - within acceptable range
  }
  return "off-target"; // Amber/warning - outside acceptable range
}

export function AllocationSummary({ stocksPercent, etfsPercent, cashPercent, isLoading }: AllocationSummaryProps) {
  // Stocks: target 20%, acceptable 15-25%
  const stocksStatus = getAllocationStatus(stocksPercent, 20, 15, 25);
  // ETFs: target 80%, acceptable 75-85%
  const etfsStatus = getAllocationStatus(etfsPercent, 80, 75, 85);

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
            <div className="flex items-center gap-2">
              <span className="text-foreground font-medium">Stocks</span>
              <span className="text-xs text-muted-foreground">(target range: 15-25%)</span>
            </div>
            <span className={stocksStatus === "on-target" ? "text-primary" : "text-warning"}>
              {stocksPercent.toFixed(1)}% <span className="text-muted-foreground">/ Target: 20%</span>
            </span>
          </div>
          <div className="relative">
            <Progress 
              value={stocksPercent} 
              className="h-2"
              style={{
                // @ts-ignore - CSS variable for progress indicator color
                "--progress-color": stocksStatus === "on-target" ? "hsl(160, 84%, 39%)" : "hsl(38, 92%, 50%)",
              } as React.CSSProperties}
            />
            {/* Target zone indicator */}
            <div 
              className="absolute top-0 h-2 border-l-2 border-r-2 border-primary/30 bg-primary/10 pointer-events-none"
              style={{ left: "15%", width: "10%" }}
            />
          </div>
        </div>

        {/* ETFs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <span className="text-foreground font-medium">ETFs</span>
              <span className="text-xs text-muted-foreground">(target range: 75-85%)</span>
            </div>
            <span className={etfsStatus === "on-target" ? "text-primary" : "text-warning"}>
              {etfsPercent.toFixed(1)}% <span className="text-muted-foreground">/ Target: 80%</span>
            </span>
          </div>
          <div className="relative">
            <Progress 
              value={etfsPercent} 
              className="h-2"
              style={{
                // @ts-ignore - CSS variable for progress indicator color
                "--progress-color": etfsStatus === "on-target" ? "hsl(160, 84%, 39%)" : "hsl(38, 92%, 50%)",
              } as React.CSSProperties}
            />
            {/* Target zone indicator */}
            <div 
              className="absolute top-0 h-2 border-l-2 border-r-2 border-primary/30 bg-primary/10 pointer-events-none"
              style={{ left: "75%", width: "10%" }}
            />
          </div>
        </div>

        {/* Cash */}
        {cashPercent !== undefined && cashPercent > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-foreground font-medium">Cash</span>
              </div>
              <span className="text-muted-foreground">
                {cashPercent.toFixed(1)}%
              </span>
            </div>
            <Progress 
              value={cashPercent} 
              className="h-2"
              style={{
                "--progress-color": "hsl(215, 20%, 50%)",
              } as React.CSSProperties}
            />
          </div>
        )}
      </div>
    </div>
  );
}
