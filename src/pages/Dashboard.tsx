import { PortfolioValue } from "@/components/dashboard/PortfolioValue";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { ActiveAlerts } from "@/components/dashboard/ActiveAlerts";
import { QuickStats } from "@/components/dashboard/QuickStats";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { TopHoldings } from "@/components/dashboard/TopHoldings";
import { useDashboardData } from "@/hooks/useDashboardData";

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
    categoryBreakdown,
    daysSinceUpdate,
    topPositions,
    isLoading,
    dismissAlert,
    isDismissing,
  } = useDashboardData();

  // Investment type chart data with targets
  const investmentTypeData = [
    { name: "Stocks", value: stocksPercent, color: "hsl(38, 92%, 50%)", target: 20 },
    { name: "ETFs", value: etfsPercent, color: "hsl(160, 84%, 39%)", target: 80 },
  ];

  // Asset breakdown chart data
  const categoryTotal = Object.values(categoryBreakdown).reduce((sum, val) => sum + val, 0);
  const assetBreakdownData = [
    { 
      name: "Equity", 
      value: categoryTotal > 0 ? ((categoryBreakdown.equity ?? 0) / categoryTotal) * 100 : 0, 
      color: "hsl(160, 84%, 39%)" 
    },
    { 
      name: "Bonds", 
      value: categoryTotal > 0 ? ((categoryBreakdown.bond ?? 0) / categoryTotal) * 100 : 0, 
      color: "hsl(199, 89%, 48%)" 
    },
    { 
      name: "Commodities", 
      value: categoryTotal > 0 ? ((categoryBreakdown.commodity ?? 0) / categoryTotal) * 100 : 0, 
      color: "hsl(38, 92%, 50%)" 
    },
    { 
      name: "Gold", 
      value: categoryTotal > 0 ? ((categoryBreakdown.gold ?? 0) / categoryTotal) * 100 : 0, 
      color: "hsl(45, 93%, 47%)" 
    },
    { 
      name: "Country/Theme", 
      value: categoryTotal > 0 ? (((categoryBreakdown.country ?? 0) + (categoryBreakdown.theme ?? 0)) / categoryTotal) * 100 : 0, 
      color: "hsl(280, 65%, 60%)" 
    },
  ].filter(item => item.value > 0);

  return (
    <div className="space-y-6">
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DonutChart 
          title="Investment Type" 
          data={investmentTypeData} 
          isLoading={isLoading}
          showTargetIndicator
        />
        <DonutChart 
          title="Asset Breakdown" 
          data={assetBreakdownData} 
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
