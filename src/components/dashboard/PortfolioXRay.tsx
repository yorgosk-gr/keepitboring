import { useMemo } from "react";
import { Scan, TrendingUp, Globe, Shield } from "lucide-react";
import { Progress } from "@/components/ui/progress";
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

interface AllocationItem {
  label: string;
  value: number;
  color: string;
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

  const cashPercent = totalValue > 0 ? (cashBalance / totalValue) * 100 : 0;

  // Calculate true asset class exposure
  const assetClassBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {
      equity: 0,
      bond: 0,
      commodity: 0,
      gold: 0,
    };

    for (const p of positions) {
      const weight = getPositionWeight(p);
      if (p.position_type === "etf") {
        const meta = etfMetadata[p.ticker];
        const category = meta?.category || p.category || "equity";
        if (breakdown[category] !== undefined) {
          breakdown[category] += weight;
        } else {
          breakdown.equity += weight; // Default to equity
        }
      } else {
        breakdown.equity += weight;
      }
    }

    return breakdown;
  }, [positions, etfMetadata, totalValue]);

  // Calculate geography breakdown
  const geographyBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {
      global: 0,
      us: 0,
      europe: 0,
      emerging: 0,
      other: 0,
    };

    for (const p of positions) {
      const weight = getPositionWeight(p);
      if (p.position_type === "etf") {
        const meta = etfMetadata[p.ticker];
        const geo = meta?.geography || "other";
        
        if (geo === "global") breakdown.global += weight;
        else if (geo === "us") breakdown.us += weight;
        else if (geo === "europe") breakdown.europe += weight;
        else if (geo === "emerging_markets" || geo === "india" || geo === "brazil" || geo === "china") {
          breakdown.emerging += weight;
        } else {
          breakdown.other += weight;
        }
      } else {
        // Stocks default to US
        breakdown.us += weight;
      }
    }

    return breakdown;
  }, [positions, etfMetadata, totalValue]);

  // Calculate broad vs concentrated
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

  const assetItems: AllocationItem[] = [
    { label: "Equity", value: assetClassBreakdown.equity, color: "hsl(160, 84%, 39%)" },
    { label: "Bonds", value: assetClassBreakdown.bond, color: "hsl(199, 89%, 48%)" },
    { label: "Commodities", value: assetClassBreakdown.commodity, color: "hsl(38, 92%, 50%)" },
    { label: "Gold", value: assetClassBreakdown.gold, color: "hsl(45, 93%, 47%)" },
    { label: "Cash", value: cashPercent, color: "hsl(220, 9%, 46%)" },
  ].filter(item => item.value > 0.5);

  const geoItems: AllocationItem[] = [
    { label: "Global", value: geographyBreakdown.global, color: "hsl(160, 84%, 39%)" },
    { label: "US", value: geographyBreakdown.us, color: "hsl(217, 91%, 60%)" },
    { label: "Europe", value: geographyBreakdown.europe, color: "hsl(199, 89%, 48%)" },
    { label: "EM", value: geographyBreakdown.emerging, color: "hsl(38, 92%, 50%)" },
    { label: "Other", value: geographyBreakdown.other, color: "hsl(220, 9%, 46%)" },
  ].filter(item => item.value > 0.5);

  if (isLoading) {
    return (
      <div className="stat-card space-y-4">
        <Skeleton className="h-6 w-32" />
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-4">
        <Scan className="w-5 h-5 text-primary" />
        <h3 className="font-semibold text-foreground">Portfolio X-Ray</h3>
      </div>

      <div className="space-y-5">
        {/* True Asset Class Exposure */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">True Asset Exposure</span>
          </div>
          <div className="space-y-2">
            {assetItems.map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-xs w-20 text-muted-foreground">{item.label}</span>
                <div className="flex-1">
                  <Progress 
                    value={item.value} 
                    className="h-2"
                    style={{ "--progress-color": item.color } as React.CSSProperties}
                  />
                </div>
                <span className="text-xs font-mono w-12 text-right text-foreground">
                  {item.value.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Geography Split */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Geographic Split</span>
          </div>
          <div className="space-y-2">
            {geoItems.map(item => (
              <div key={item.label} className="flex items-center gap-3">
                <span className="text-xs w-20 text-muted-foreground">{item.label}</span>
                <div className="flex-1">
                  <Progress 
                    value={item.value} 
                    className="h-2"
                    style={{ "--progress-color": item.color } as React.CSSProperties}
                  />
                </div>
                <span className="text-xs font-mono w-12 text-right text-foreground">
                  {item.value.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Broad vs Concentrated */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Risk Profile</span>
          </div>
          <div className="flex gap-4">
            <div className="flex-1 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <span className="text-xs text-muted-foreground block">Broad Market</span>
              <span className={cn(
                "text-lg font-bold",
                broadVsConcentrated.broad > 50 ? "text-primary" : "text-foreground"
              )}>
                {broadVsConcentrated.broad.toFixed(0)}%
              </span>
            </div>
            <div className="flex-1 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <span className="text-xs text-muted-foreground block">Targeted Bets</span>
              <span className={cn(
                "text-lg font-bold",
                broadVsConcentrated.concentrated > 30 ? "text-amber-500" : "text-foreground"
              )}>
                {broadVsConcentrated.concentrated.toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
