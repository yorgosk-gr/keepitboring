import { Link } from "react-router-dom";
import { AlertCircle, DollarSign } from "lucide-react";
import { PortfolioValue } from "@/components/dashboard/PortfolioValue";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { ActiveAlerts } from "@/components/dashboard/ActiveAlerts";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { TopHoldings } from "@/components/dashboard/TopHoldings";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useAllETFMetadata } from "@/hooks/useAllETFMetadata";
import { Button } from "@/components/ui/button";
import { useMemo } from "react";

export default function Dashboard() {
  const {
    positions,
    alerts,
    decisionLogs,
    totalValue,
    cashBalance,
    dailyChange,
    dailyChangePercent,
    stocksPercent,
    etfsPercent,
    cashPercent,
    daysSinceUpdate,
    daysSincePriceRefresh,
    topPositions,
    isLoading,
    dismissAlert,
    isDismissing,
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
      other: 0,
    };

    for (const position of positions) {
      const value = position.market_value ?? 0;
      
      if (position.position_type === "etf") {
        // Use classified category from metadata if available
        const meta = etfMetadata[position.ticker];
        const category = meta?.category || position.category || "equity";
        
        if (category === "country" || category === "theme") {
          breakdown.other = (breakdown.other || 0) + value;
        } else if (breakdown[category] !== undefined) {
          breakdown[category] += value;
        } else {
          breakdown.other += value;
        }
      } else {
        // Stocks are always equity
        breakdown.equity += value;
      }
    }

    const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
    
    return [
      { name: "Equity", value: total > 0 ? (breakdown.equity / total) * 100 : 0, color: "hsl(160, 84%, 39%)" },
      { name: "Bonds", value: total > 0 ? (breakdown.bond / total) * 100 : 0, color: "hsl(199, 89%, 48%)" },
      { name: "Commodities", value: total > 0 ? (breakdown.commodity / total) * 100 : 0, color: "hsl(38, 92%, 50%)" },
      { name: "Gold", value: total > 0 ? (breakdown.gold / total) * 100 : 0, color: "hsl(45, 93%, 47%)" },
      { name: "Other", value: total > 0 ? (breakdown.other / total) * 100 : 0, color: "hsl(280, 65%, 60%)" },
    ].filter(item => item.value > 0);
  }, [positions, etfMetadata]);

  // Calculate geography breakdown using ETF metadata
  const geographyBreakdownData = useMemo(() => {
    const breakdown: Record<string, number> = {
      global: 0,
      us: 0,
      europe: 0,
      japan: 0,
      india: 0,
      emerging_markets: 0,
      other: 0,
    };

    for (const position of positions) {
      const value = position.market_value ?? 0;
      
      if (position.position_type === "etf") {
        const meta = etfMetadata[position.ticker];
        const geography = meta?.geography || "other";
        
        if (breakdown[geography] !== undefined) {
          breakdown[geography] += value;
        } else {
          breakdown.other += value;
        }
      } else {
        // Default stocks to US unless we have more info
        breakdown.us += value;
      }
    }

    const total = Object.values(breakdown).reduce((sum, v) => sum + v, 0);
    
    return [
      { name: "Global", value: total > 0 ? (breakdown.global / total) * 100 : 0, color: "hsl(160, 84%, 39%)" },
      { name: "US", value: total > 0 ? (breakdown.us / total) * 100 : 0, color: "hsl(217, 91%, 60%)" },
      { name: "Europe", value: total > 0 ? (breakdown.europe / total) * 100 : 0, color: "hsl(199, 89%, 48%)" },
      { name: "Japan", value: total > 0 ? (breakdown.japan / total) * 100 : 0, color: "hsl(0, 72%, 51%)" },
      { name: "India", value: total > 0 ? (breakdown.india / total) * 100 : 0, color: "hsl(38, 92%, 50%)" },
      { name: "EM", value: total > 0 ? (breakdown.emerging_markets / total) * 100 : 0, color: "hsl(280, 65%, 60%)" },
      { name: "Other", value: total > 0 ? (breakdown.other / total) * 100 : 0, color: "hsl(220, 9%, 46%)" },
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
        unresolvedAlertsCount={alerts.length}
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
        />
        <DonutChart 
          title="Geography" 
          data={geographyBreakdownData} 
          isLoading={isLoading}
        />
      </div>

      {/* Alerts and Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActiveAlerts 
          alerts={alerts}
          isLoading={isLoading}
          onDismiss={dismissAlert}
          isDismissing={isDismissing}
        />
        <RecentActivity 
          decisionLogs={decisionLogs}
          positions={positions}
          isLoading={isLoading}
        />
      </div>

      {/* Top Holdings */}
      <TopHoldings 
        positions={topPositions}
        isLoading={isLoading}
      />
    </div>
  );
}
