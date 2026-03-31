import { Link } from "react-router-dom";
import { AlertCircle, DollarSign, RefreshCw } from "lucide-react";
import { PortfolioValue } from "@/components/dashboard/PortfolioValue";
import { DonutChart } from "@/components/dashboard/DonutChart";
import { TopHoldings } from "@/components/dashboard/TopHoldings";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { DashboardStatusRow } from "@/components/dashboard/DashboardStatusRow";

import { useDashboardData } from "@/hooks/useDashboardData";
import { ConvictionReviewWidget } from "@/components/dashboard/ConvictionReviewWidget";
import { useAllETFMetadata } from "@/hooks/useAllETFMetadata";

import { PerformanceChart } from "@/components/dashboard/PerformanceChart";
import { RiskProfileCard } from "@/components/dashboard/RiskProfileCard";
import { NorthStarWidget } from "@/components/dashboard/NorthStarWidget";
import { ActionFeedWidget } from "@/components/dashboard/ActionFeedWidget";
import { usePhilosophyRules } from "@/hooks/usePhilosophyRules";
import { Button } from "@/components/ui/button";
import { useMemo, useCallback } from "react";
import { usePriceRefresh } from "@/hooks/usePriceRefresh";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

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
    daysSincePriceRefresh,
    daysSinceUpdate,
    topPositions,
    decisionLogs,
    isLoading,
  } = useDashboardData();

  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: etfMetadata = {} } = useAllETFMetadata();
  const { rules } = usePhilosophyRules();
  const { fetchPrices, isFetching: isRefreshingPrices, progress: priceProgress } = usePriceRefresh();

  const handleRefreshPrices = useCallback(async () => {
    if (!user || positions.length === 0) return;

    const tickerInfos = positions.map(p => ({
      ticker: p.ticker,
      currency: p.currency,
      exchange: p.exchange,
      instrumentType: p.position_type === "stock" ? "Stock" : p.position_type === "etf" ? "ETF" : undefined,
    }));

    const { prices, notFound } = await fetchPrices(tickerInfos);

    if (prices.length > 0) {
      // Save snapshot like Portfolio page does
      const totalMV = positions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
      const stocksValue = positions.filter(p => p.position_type === "stock").reduce((sum, p) => sum + (p.market_value ?? 0), 0);
      const etfsValue = positions.filter(p => p.position_type === "etf").reduce((sum, p) => sum + (p.market_value ?? 0), 0);

      await supabase.from("portfolio_snapshots").insert({
        user_id: user.id,
        total_value: totalMV,
        stocks_percent: totalMV > 0 ? (stocksValue / totalMV) * 100 : 0,
        etfs_percent: totalMV > 0 ? (etfsValue / totalMV) * 100 : 0,
        cash_balance: cashBalance,
        data_json: { price_refresh: new Date().toISOString(), updated_count: prices.length },
      });

      toast.success(`Updated prices for ${prices.length} positions`);
      queryClient.invalidateQueries({ queryKey: ["ib-positions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-data"] });
    }

    if (notFound.length > 0) {
      toast.warning(`Could not find prices for: ${notFound.join(", ")}`);
    }
  }, [user, positions, cashBalance, fetchPrices, queryClient]);

  // Derive targets from philosophy rules (midpoint of min/max range)
  const ruleTargets = useMemo(() => {
    const findRule = (metric: string) => rules.find(r => r.metric === metric && r.is_active);
    const midpoint = (r: { threshold_min?: number | null; threshold_max?: number | null } | undefined, fallback: number) => {
      if (!r) return fallback;
      const min = r.threshold_min ?? 0;
      const max = r.threshold_max ?? min;
      return Math.round((min + max) / 2);
    };

    const equityRule = findRule("equity_percent");
    const bondRule = findRule("bonds_percent");
    const commodityRule = findRule("commodities_gold_percent");
    const cashRule = findRule("cash_percent");
    const stocksOfEqRule = findRule("stocks_of_equities_percent");
    const etfsOfEqRule = findRule("etfs_of_equities_percent");

    const equityTarget = midpoint(equityRule, 50);
    const bondTarget = midpoint(bondRule, 25);
    const commodityTarget = midpoint(commodityRule, 10);
    const cashTarget = cashRule?.threshold_max != null ? Math.round(cashRule.threshold_max / 2) : 5;

    // Stocks/ETFs targets are % of equities in rules, but the donut shows % of total portfolio
    // Convert: stocks_target_of_total = stocks_of_equities_target * equity_target / 100
    const stocksOfEqTarget = midpoint(stocksOfEqRule, 20);
    const etfsOfEqTarget = midpoint(etfsOfEqRule, 80);
    const stocksTarget = Math.round(stocksOfEqTarget * equityTarget / 100);
    const etfsTarget = Math.round(etfsOfEqTarget * equityTarget / 100);

    return { equityTarget, bondTarget, commodityTarget, cashTarget, stocksTarget, etfsTarget };
  }, [rules]);

  // Investment type chart data with targets derived from philosophy rules
  const investmentTypeData = [
    { name: "Stocks", value: stocksPercent, color: "hsl(38, 92%, 50%)", target: ruleTargets.stocksTarget },
    { name: "ETFs", value: etfsPercent, color: "hsl(160, 84%, 39%)", target: ruleTargets.etfsTarget },
    { name: "Cash", value: cashPercent, color: "hsl(217, 33%, 40%)", target: ruleTargets.cashTarget },
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
      { name: "Equity", value: totalWithCash > 0 ? (breakdown.equity / totalWithCash) * 100 : 0, color: "hsl(160, 84%, 39%)", target: ruleTargets.equityTarget },
      { name: "Bonds", value: totalWithCash > 0 ? (breakdown.bond / totalWithCash) * 100 : 0, color: "hsl(199, 89%, 48%)", target: ruleTargets.bondTarget },
      { name: "Commodities", value: totalWithCash > 0 ? ((breakdown.commodity + breakdown.gold) / totalWithCash) * 100 : 0, color: "hsl(38, 92%, 50%)", target: ruleTargets.commodityTarget },
      { name: "Cash", value: totalWithCash > 0 ? (cashBalance / totalWithCash) * 100 : 0, color: "hsl(217, 33%, 40%)", target: ruleTargets.cashTarget },
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
                {isRefreshingPrices && ` — updating ${priceProgress.current}/${priceProgress.total}`}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
            onClick={handleRefreshPrices}
            disabled={isRefreshingPrices}
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshingPrices ? "animate-spin" : ""}`} />
            {isRefreshingPrices ? "Refreshing..." : "Refresh Prices"}
          </Button>
        </div>
      )}

      {/* Action Feed + Conviction Reviews */}
      <ActionFeedWidget />
      <ConvictionReviewWidget />

      {/* Portfolio Value + Stats */}
      <PortfolioValue
        totalValue={totalValue}
        dailyChange={dailyChange}
        dailyChangePercent={dailyChangePercent}
        positionsCount={positions.length}
        cashBalance={cashBalance}
        isLoading={isLoading}
      />

      {/* Status Row: Health Score, Violations, Intelligence, Last Synced, Book Wisdom */}
      <DashboardStatusRow daysSinceUpdate={daysSinceUpdate} />

      {/* Performance Chart */}
      <PerformanceChart />

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

      {/* Top Holdings + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TopHoldings positions={topPositions} isLoading={isLoading} />
        <RecentActivity decisionLogs={decisionLogs} positions={positions} isLoading={isLoading} />
      </div>

      {/* North Star Widget */}
      <NorthStarWidget />

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
