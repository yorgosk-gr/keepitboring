import { useMemo } from "react";
import { Target, Shield } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Position } from "@/hooks/useDashboardData";
import type { ETFMetadataItem } from "@/hooks/useAllETFMetadata";

interface PortfolioXRayProps {
  positions: Position[];
  etfMetadata: Record<string, ETFMetadataItem>;
  totalValue: number;
  cashBalance: number;
  isLoading?: boolean;
}

export function PortfolioXRay({
  positions,
  etfMetadata,
  totalValue,
  cashBalance,
  isLoading,
}: PortfolioXRayProps) {
  const getPositionWeight = (p: Position) => {
    if (totalValue === 0) return 0;
    return ((p.market_value ?? 0) / totalValue) * 100;
  };

  // Calculate broad vs concentrated (the unique value of X-Ray)
  const broadVsConcentrated = useMemo(() => {
    let broad = 0;
    let concentrated = 0;

    for (const p of positions) {
      const weight = getPositionWeight(p);
      if (p.position_type === "etf") {
        const meta = etfMetadata[p.ticker];
        if (meta?.is_broad_market) {
          broad += weight;
        } else {
          concentrated += weight;
        }
      } else {
        concentrated += weight; // Individual stocks are concentrated bets
      }
    }

    return { broad, concentrated };
  }, [positions, etfMetadata, totalValue]);

  // Cash percent for the remaining slice
  const cashPercent = totalValue > 0 ? (cashBalance / totalValue) * 100 : 0;

  if (isLoading) {
    return (
      <div className="stat-card space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Risk Profile</h3>
      </div>

      <div className="space-y-4">
        {/* Broad vs Concentrated */}
        <div className="flex gap-4">
          <div className="flex-1 p-4 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-primary" />
              <span className="text-sm text-muted-foreground">Broad Market</span>
            </div>
            <span className={cn(
              "text-2xl font-bold",
              broadVsConcentrated.broad > 50 ? "text-primary" : "text-foreground"
            )}>
              {broadVsConcentrated.broad.toFixed(0)}%
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Index ETFs tracking entire markets
            </p>
          </div>
          <div className="flex-1 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">Targeted Bets</span>
            </div>
            <span className={cn(
              "text-2xl font-bold",
              broadVsConcentrated.concentrated > 30 ? "text-amber-500" : "text-foreground"
            )}>
              {broadVsConcentrated.concentrated.toFixed(0)}%
            </span>
            <p className="text-xs text-muted-foreground mt-1">
              Single stocks, themes, countries
            </p>
          </div>
        </div>

        {/* Cash indicator */}
        {cashPercent > 0 && (
          <div className="flex items-center justify-between text-sm px-1">
            <span className="text-muted-foreground">Cash reserve</span>
            <span className="font-mono text-foreground">{cashPercent.toFixed(1)}%</span>
          </div>
        )}

        {/* Philosophy reminder */}
        <p className="text-xs text-muted-foreground border-t border-border pt-3">
          Target: 70%+ broad market core, ≤30% satellite bets
        </p>
      </div>
    </div>
  );
}
