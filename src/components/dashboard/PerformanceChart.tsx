import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { BarChart3 } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format, subDays, subMonths, subYears, startOfMonth, startOfYear } from "date-fns";

const TIME_RANGES = ["1W", "MTD", "1M", "YTD", "1Y"] as const;
type TimeRange = (typeof TIME_RANGES)[number];

function getRangeStart(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case "1W": return subDays(now, 7);
    case "MTD": return startOfMonth(now);
    case "1M": return subMonths(now, 1);
    case "YTD": return startOfYear(now);
    case "1Y": return subYears(now, 1);
  }
}

export function PerformanceChart() {
  const { user } = useAuth();
  const [range, setRange] = useState<TimeRange>("YTD");

  const { data: navData = [], isLoading: navLoading } = useQuery({
    queryKey: ["nav-history", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("ib_nav_history")
        .select("report_date, total_nav, cash, stock, bonds, funds")
        .eq("user_id", user.id)
        .order("report_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: twrData = [] } = useQuery({
    queryKey: ["twr-history", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("ib_twr_history")
        .select("from_date, to_date, twr, starting_value, ending_value, dividends, interest, commissions")
        .eq("user_id", user.id)
        .order("to_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const rangeStart = getRangeStart(range);

  const filteredNav = useMemo(() => {
    const startStr = format(rangeStart, "yyyy-MM-dd");
    return navData
      .filter(d => d.report_date >= startStr && d.total_nav !== null)
      .map(d => ({
        date: d.report_date,
        nav: Number(d.total_nav),
      }));
  }, [navData, rangeStart]);

  // Chain daily TWR records multiplicatively for the selected period
  const chainedTWR = useMemo(() => {
    if (twrData.length === 0) return null;
    const startStr = format(rangeStart, "yyyy-MM-dd");
    const todayStr = format(new Date(), "yyyy-MM-dd");

    const periodRecords = twrData.filter(t =>
      t.from_date && t.to_date &&
      t.from_date >= startStr && t.to_date <= todayStr && t.twr !== null
    );

    if (periodRecords.length === 0) return null;

    // IB TWR values may be in percent (3.5) or decimal (0.035)
    const firstTwr = Math.abs(Number(periodRecords[0].twr));
    const isPercent = firstTwr > 0.5;

    const chained = periodRecords.reduce((acc, t) => {
      const dailyReturn = isPercent
        ? Number(t.twr) / 100
        : Number(t.twr);
      return acc * (1 + dailyReturn);
    }, 1);

    return (chained - 1) * 100;
  }, [twrData, rangeStart]);

  // Sum dividends, interest, commissions for the period (cash impact excluding deposits)
  const cashImpact = useMemo(() => {
    if (twrData.length === 0) return null;
    const startStr = format(rangeStart, "yyyy-MM-dd");
    const todayStr = format(new Date(), "yyyy-MM-dd");

    const periodRecords = twrData.filter(t =>
      t.from_date && t.to_date &&
      t.from_date >= startStr && t.to_date <= todayStr
    );

    if (periodRecords.length === 0) return null;

    const totals = periodRecords.reduce(
      (acc, t) => ({
        dividends: acc.dividends + (Number(t.dividends) || 0),
        interest: acc.interest + (Number(t.interest) || 0),
        commissions: acc.commissions + (Number(t.commissions) || 0),
      }),
      { dividends: 0, interest: 0, commissions: 0 }
    );

    return {
      net: totals.dividends + totals.interest + totals.commissions,
      ...totals,
    };
  }, [twrData, rangeStart]);

  // Use chained TWR if available, otherwise fall back to simple NAV return
  const periodReturn = useMemo(() => {
    if (chainedTWR !== null) {
      return { value: chainedTWR, label: "TWR" };
    }
    if (filteredNav.length >= 2) {
      const first = filteredNav[0].nav;
      const last = filteredNav[filteredNav.length - 1].nav;
      if (first > 0) {
        return { value: ((last - first) / first) * 100, label: "Return" };
      }
    }
    return null;
  }, [chainedTWR, filteredNav]);

  if (navLoading) {
    return (
      <Card className="p-6">
        <Skeleton className="h-4 w-40 mb-4" />
        <Skeleton className="h-[250px] w-full" />
      </Card>
    );
  }

  if (filteredNav.length === 0) {
    return (
      <Card className="p-6">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Portfolio Performance</h3>
        <EmptyState
          icon={BarChart3}
          title="No performance data yet"
          description="Sync your portfolio to see performance data"
        />
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-muted-foreground">Portfolio Performance</h3>
          {periodReturn !== null && (
            <p className={`text-2xl font-bold mt-1 ${periodReturn.value >= 0 ? "text-primary" : "text-destructive"}`}>
              {periodReturn.value >= 0 ? "+" : ""}{periodReturn.value.toFixed(2)}%
              <span className="text-xs text-muted-foreground ml-2 font-normal">{periodReturn.label}</span>
            </p>
          )}
          {cashImpact !== null && (
            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
              <span className={cashImpact.net >= 0 ? "text-primary" : "text-destructive"}>
                Cash: {cashImpact.net >= 0 ? "+" : ""}${Math.abs(cashImpact.net).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
              <span>Div ${cashImpact.dividends.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span>Int ${cashImpact.interest.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
              <span>Comm ${cashImpact.commissions.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
          )}
        </div>
        <div className="flex gap-1">
          {TIME_RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                range === r
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={filteredNav} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="navGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(160, 84%, 39%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
            <XAxis
              dataKey="date"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickFormatter={(v) => format(new Date(v), "MMM d")}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                fontSize: "12px",
              }}
              labelFormatter={(v) => format(new Date(v), "MMM d, yyyy")}
              formatter={(value: number) => [`$${value.toLocaleString()}`, "NAV"]}
            />
            <Area
              type="monotone"
              dataKey="nav"
              stroke="hsl(160, 84%, 39%)"
              strokeWidth={2}
              fill="url(#navGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
