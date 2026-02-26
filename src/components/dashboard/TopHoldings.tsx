import { TrendingUp, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import type { Position } from "@/hooks/useDashboardData";

interface TopHoldingsProps {
  positions: Position[];
  isLoading?: boolean;
}


function calculatePnL(position: Position): { value: number; percent: number } {
  const avgCost = position.avg_cost ?? 0;
  const currentPrice = position.current_price ?? 0;
  const shares = position.shares ?? 0;
  
  if (avgCost === 0 || shares === 0) {
    return { value: 0, percent: 0 };
  }
  
  const costBasis = avgCost * shares;
  const currentValue = currentPrice * shares;
  const pnlValue = currentValue - costBasis;
  const pnlPercent = ((currentPrice - avgCost) / avgCost) * 100;
  
  return { value: pnlValue, percent: pnlPercent };
}

export function TopHoldings({ positions, isLoading }: TopHoldingsProps) {
  if (isLoading) {
    return (
      <div className="stat-card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">Top Holdings</h3>
        </div>
        <Link to="/portfolio">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground">
            View All
          </Button>
        </Link>
      </div>

      {positions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <TrendingUp className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No positions yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Add your first position to get started
          </p>
          <Link to="/portfolio">
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Add Position
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-muted-foreground uppercase tracking-wide">
                <th className="text-left pb-3 font-medium">Ticker</th>
                <th className="text-right pb-3 font-medium">Weight</th>
                <th className="text-right pb-3 font-medium">P&L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {positions.map((position) => {
                const pnl = calculatePnL(position);
                const isPositive = pnl.percent >= 0;
                
                return (
                  <tr key={position.id} className="hover:bg-secondary/30 transition-colors">
                    <td className="py-3">
                      <div>
                        <span className="font-medium text-foreground">{position.ticker}</span>
                        {position.name && (
                          <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                            {position.name}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <span className="font-medium text-foreground">
                        {(position.weight_percent ?? 0).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <span className={`font-medium ${isPositive ? "text-primary" : "text-destructive"}`}>
                        {isPositive ? "+" : ""}{pnl.percent.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
