import { Progress } from "@/components/ui/progress";

interface AllocationSummaryProps {
  stocksPercent: number;
  etfsPercent: number;
  cashPercent?: number;
  stocksValue?: number;
  etfsValue?: number;
  cashValue?: number;
  isLoading?: boolean;
}

// Format USD amount
function formatUSD(value: number | undefined): string {
  if (value === undefined) return "";
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function AllocationSummary({ 
  stocksPercent, 
  etfsPercent, 
  cashPercent, 
  stocksValue,
  etfsValue,
  cashValue,
  isLoading 
}: AllocationSummaryProps) {
  if (isLoading) {
    return (
      <div className="stat-card">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-secondary rounded w-1/4" />
          <div className="h-2 bg-secondary rounded" />
          <div className="h-2 bg-secondary rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="stat-card">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Allocation</h3>
      
      <div className="space-y-3">
        {/* Stocks */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium w-14">Stocks</span>
          <Progress value={stocksPercent} className="flex-1 h-2" />
          <span className="text-sm font-mono w-12 text-right">{stocksPercent.toFixed(1)}%</span>
          {stocksValue !== undefined && (
            <span className="text-sm text-muted-foreground font-mono w-24 text-right">
              {formatUSD(stocksValue)}
            </span>
          )}
        </div>

        {/* ETFs */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium w-14">ETFs</span>
          <Progress value={etfsPercent} className="flex-1 h-2" />
          <span className="text-sm font-mono w-12 text-right">{etfsPercent.toFixed(1)}%</span>
          {etfsValue !== undefined && (
            <span className="text-sm text-muted-foreground font-mono w-24 text-right">
              {formatUSD(etfsValue)}
            </span>
          )}
        </div>

        {/* Cash */}
        {cashPercent !== undefined && cashPercent > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium w-14">Cash</span>
            <Progress 
              value={cashPercent} 
              className="flex-1 h-2"
              style={{ "--progress-color": "hsl(215, 20%, 50%)" } as React.CSSProperties}
            />
            <span className="text-sm font-mono w-12 text-right">{cashPercent.toFixed(1)}%</span>
            {cashValue !== undefined && (
              <span className="text-sm text-muted-foreground font-mono w-24 text-right">
                {formatUSD(cashValue)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
