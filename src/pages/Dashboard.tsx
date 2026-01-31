import { PortfolioValue } from "@/components/dashboard/PortfolioValue";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { ActiveAlerts } from "@/components/dashboard/ActiveAlerts";
import { QuickStats } from "@/components/dashboard/QuickStats";

const investmentTypeData = [
  { name: "ETFs", value: 80, color: "hsl(160, 84%, 39%)" },
  { name: "Stocks", value: 20, color: "hsl(38, 92%, 50%)" },
];

const assetBreakdownData = [
  { name: "Equity", value: 65, color: "hsl(160, 84%, 39%)" },
  { name: "Bonds", value: 15, color: "hsl(199, 89%, 48%)" },
  { name: "Commodities", value: 10, color: "hsl(38, 92%, 50%)" },
  { name: "Other", value: 10, color: "hsl(280, 65%, 60%)" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Portfolio Value */}
      <PortfolioValue />

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DonutChart title="Investment Type" data={investmentTypeData} />
        <DonutChart title="Asset Breakdown" data={assetBreakdownData} />
      </div>

      {/* Alerts */}
      <ActiveAlerts />

      {/* Quick Stats */}
      <QuickStats />
    </div>
  );
}
