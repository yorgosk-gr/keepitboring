import { Link } from "react-router-dom";
import { AlertCircle, DollarSign } from "lucide-react";
import { PortfolioValue } from "@/components/dashboard/PortfolioValue";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { QuickStats } from "@/components/dashboard/QuickStats";

import { useDashboardData } from "@/hooks/useDashboardData";
import { useAllETFMetadata } from "@/hooks/useAllETFMetadata";

import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { RiskProfileCard } from "@/components/dashboard/RiskProfileCard";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";

export default function Dashboard() {
  const {
    positions,
    totalValue,
    cashBalance,
    dailyChange,
    dailyChangePercent,
    stocksPercent,
    etfsPercent,
    cashPercent,
    daysSinceUpdate,
    daysSincePriceRefresh,
    
    isLoading,
  } = useDashboardData();

  const { data: etfMetadata = {} } = useAllETFMetadata();

  // Investment type chart data with targets (including cash)
  const investmentTypeData = [
    { name: "Stocks", value: stocksPercent, color: "hsl(38, 92%, 50%)", target: 20 },
    { name: "ETFs", value: etfsPercent, color: "hsl(160, 84%, 39%)", target: 80 },
    { name: "Cash", value: cashPercent, color: "hsl(217, 33%, 40%)" },
  ];

  // Calculate asset class breakdown using ETF metadata classifications
  const assetBreakdownData = useMemo(() => {
    const breakdown: Record<string, number> = {
      equity: 0,
      bond: 0,
      commodity: 0,
      gold: 0,
    };

    for (const position of positions) {
      const value = position.market_value ?? 0;
      
      if (position.position_type === "etf") {
        // Use classified category from metadata if available
        const meta = etfMetadata[position.ticker];
        const category = meta?.category || position.category || "equity";
        
        // Country and theme ETFs are equity funds (India, Japan, Healthcare, etc.)
        if (category === "equity") {
          breakdown.equity += value;
        } else if (breakdown[category] !== undefined) {
          breakdown[category] += value;
        } else {
          // Unknown categories default to equity
          breakdown.equity += value;
        }
      } else {
        // Stocks are always equity
        breakdown.equity += value;
      }
    }

    const totalWithCash = Object.values(breakdown).reduce((sum, v) => sum + v, 0) + cashBalance;
    
    return [
      { name: "Equity", value: totalWithCash > 0 ? (breakdown.equity / totalWithCash) * 100 : 0, color: "hsl(160, 84%, 39%)", target: 65 },
      { name: "Bonds", value: totalWithCash > 0 ? (breakdown.bond / totalWithCash) * 100 : 0, color: "hsl(199, 89%, 48%)", target: 20 },
      { name: "Commodities", value: totalWithCash > 0 ? ((breakdown.commodity + breakdown.gold) / totalWithCash) * 100 : 0, color: "hsl(38, 92%, 50%)", target: 5 },
      { name: "Cash", value: totalWithCash > 0 ? (cashBalance / totalWithCash) * 100 : 0, color: "hsl(217, 33%, 40%)", target: 5 },
    ].filter(item => item.value > 0);
  }, [positions, etfMetadata, cashBalance]);

  // Calculate geography breakdown using ETF metadata
  const geographyBreakdownData = useMemo(() => {
    const breakdown: Record<string, number> = {
      global: 0,
      us: 0,
      europe: 0,
      japan: 0,
      india: 0,
      emerging_markets: 0,
    };

    for (const position of positions) {
      const value = position.market_value ?? 0;
      
      if (position.position_type === "etf") {
        const meta = etfMetadata[position.ticker];
        const geography = meta?.geography || "global";
        
        // Normalize geography values
        if (geography === "global") {
          breakdown.global += value;
        } else if (geography === "us") {
          breakdown.us += value;
        } else if (geography === "europe" || geography === "uk" || geography === "greece") {
          breakdown.europe += value;
        } else if (geography === "japan") {
          breakdown.japan += value;
        } else if (geography === "india") {
          breakdown.india += value;
        } else if (geography === "emerging_markets" || geography === "emerging" || 
                   geography === "brazil" || geography === "china") {
          breakdown.emerging_markets += value;
        } else {
          // Unknown geographies default to global
          breakdown.global += value;
        }
      } else {
        // Default stocks to US (most stocks in portfolio are US-listed)
        breakdown.us += value;
      }
    }

    const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
    
    return [
      { name: "Global", value: total > 0 ? (breakdown.global / total) * 100 : 0, color: "hsl(160, 84%, 39%)", target: 30 },
      { name: "US", value: total > 0 ? (breakdown.us / total) * 100 : 0, color: "hsl(217, 91%, 60%)", target: 35 },
      { name: "Europe", value: total > 0 ? (breakdown.europe / total) * 100 : 0, color: "hsl(199, 89%, 48%)", target: 15 },
      { name: "Japan", value: total > 0 ? (breakdown.japan / total) * 100 : 0, color: "hsl(0, 72%, 51%)", target: 8 },
      { name: "India", value: total > 0 ? (breakdown.india / total) * 100 : 0, color: "hsl(38, 92%, 50%)", target: 5 },
      { name: "EM", value: total > 0 ? (breakdown.emerging_markets / total) * 100 : 0, color: "hsl(280, 65%, 60%)", target: 7 },
    ].filter(item => item.value > 0);
  }, [positions, etfMetadata]);

  return (
    <div className="space-y-6">
      {/* Price Refresh Reminder */}
      {daysSincePriceRefresh !== null && daysSincePriceRefresh >= 7 && positions.length > 0 && (
        <div className="flex items-center justify-between p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            <div>
              <p className="text-sm font-medium text-amber-500">
                Prices may be outdated
              </p>
              <p className="text-xs text-muted-foreground">
                Last refresh: {daysSincePriceRefresh} days ago
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-2 border-amber-500/30 text-amber-500 hover:bg-amber-500/10">
            <Link to="/portfolio">
              <DollarSign className="w-4 h-4" />
              Refresh Prices
            </Link>
          </Button>
        </div>
      )}

      {/* Portfolio Value */}
      <PortfolioValue 
        totalValue={totalValue}
        dailyChange={dailyChange}
        dailyChangePercent={dailyChangePercent}
        isLoading={isLoading}
      />

      {/* Quick Stats */}
      <QuickStats 
        positionsCount={positions.length}
        cashBalance={cashBalance}
        daysSinceUpdate={daysSinceUpdate}
        isLoading={isLoading}
      />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <DonutChart 
          title="Investment Type" 
          data={investmentTypeData} 
          isLoading={isLoading}
          showTargetIndicator
        />
        <DonutChart 
          title="Asset Class" 
          data={assetBreakdownData} 
          isLoading={isLoading}
          showTargetIndicator
        />
        <DonutChart 
          title="Geography" 
          data={geographyBreakdownData} 
          isLoading={isLoading}
          showTargetIndicator
        />
      </div>

      {/* Performance Chart */}
      <PerformanceChart />

      {/* Risk Profile */}
      <RiskProfileCard
        positions={positions}
        etfMetadata={etfMetadata}
        totalValue={totalValue}
        cashBalance={cashBalance}
        isLoading={isLoading}
      />

    </div>
  );
}
