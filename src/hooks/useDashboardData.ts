import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface Position {
  id: string;
  ticker: string;
  name: string | null;
  position_type: string | null;
  category: string | null;
  shares: number | null;
  avg_cost: number | null;
  current_price: number | null;
  market_value: number | null;
  weight_percent: number | null;
  thesis_notes: string | null;
  bet_type: string | null;
  confidence_level: number | null;
  last_review_date: string | null;
  updated_at: string;
}

export interface Alert {
  id: string;
  alert_type: string | null;
  severity: string | null;
  message: string;
  resolved: boolean;
  created_at: string;
  rule_id: string | null;
  position_id: string | null;
}

export interface DecisionLog {
  id: string;
  position_id: string | null;
  action_type: string | null;
  reasoning: string | null;
  confidence_level: number | null;
  created_at: string;
}

export interface PortfolioSnapshot {
  id: string;
  snapshot_date: string;
  total_value: number | null;
  cash_balance: number | null;
  stocks_percent: number | null;
  etfs_percent: number | null;
  data_json: Record<string, unknown> | null;
}

function derivePositionType(
  assetClass: string | null,
  subCategory: string | null,
  hasEtfMetadata: boolean
): string {
  if (hasEtfMetadata) return "etf";
  const ac = (assetClass || "").toUpperCase();
  const sc = (subCategory || "").toUpperCase();
  if (ac === "STK") {
    if (sc.includes("ETF") || sc.includes("ETC")) return "etf";
    return "stock";
  }
  if (ac === "FND" || ac === "ETF") return "etf";
  if (ac === "BOND" || ac === "BILL" || ac === "FI") return "bond";
  if (ac === "CMDTY") return "commodity";
  return "stock";
}

export function useDashboardData() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch IB positions as primary source
  const ibPositionsQuery = useQuery({
    queryKey: ["ib-positions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ib_positions")
        .select("*")
        .order("position_value", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch annotations for bet_type etc
  const annotationsQuery = useQuery({
    queryKey: ["position-annotations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("ticker, thesis_notes, bet_type, confidence_level, last_review_date, category, position_type, name, manually_classified");
      if (error) throw error;
      const map: Record<string, typeof data[number]> = {};
      for (const row of data) map[row.ticker] = row;
      return map;
    },
    enabled: !!user,
  });

  // Fetch ETF metadata for classification
  const etfMetadataQuery = useQuery({
    queryKey: ["etf_metadata", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etf_metadata")
        .select("ticker");
      if (error) throw error;
      const set = new Set<string>();
      for (const item of data || []) set.add(item.ticker);
      return set;
    },
  });

  // Fetch unresolved alerts
  const alertsQuery = useQuery({
    queryKey: ["alerts", "unresolved", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return (data as Alert[]).sort((a, b) => {
        const aOrder = severityOrder[a.severity as keyof typeof severityOrder] ?? 3;
        const bOrder = severityOrder[b.severity as keyof typeof severityOrder] ?? 3;
        return aOrder - bOrder;
      });
    },
    enabled: !!user,
  });

  const decisionLogsQuery = useQuery({
    queryKey: ["decision_logs", "recent", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decision_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data as DecisionLog[];
    },
    enabled: !!user,
  });

  const snapshotsQuery = useQuery({
    queryKey: ["portfolio_snapshots", "latest", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolio_snapshots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2);
      if (error) throw error;
      return data as PortfolioSnapshot[];
    },
    enabled: !!user,
  });

  // Dismiss alert mutation
  const dismissAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("alerts")
        .update({ resolved: true })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  // Build merged positions from IB data + annotations
  const ibPositions = ibPositionsQuery.data ?? [];
  const annotations = annotationsQuery.data ?? {};
  const etfTickers = etfMetadataQuery.data ?? new Set<string>();

  const positions: Position[] = ibPositions.map((ib) => {
    const ticker = ib.symbol || "";
    const ann = annotations[ticker];
    const hasEtfMeta = etfTickers.has(ticker);
    const posType = ann?.manually_classified
      ? (ann.position_type || derivePositionType(ib.asset_class, ib.sub_category, hasEtfMeta))
      : derivePositionType(ib.asset_class, ib.sub_category, hasEtfMeta);

    return {
      id: ib.id,
      ticker,
      name: ann?.name || ib.description || null,
      position_type: posType,
      category: ann?.category || "equity",
      shares: ib.quantity,
      avg_cost: ib.cost_basis_price,
      current_price: ib.mark_price,
      market_value: ib.position_value,
      weight_percent: ib.percent_of_nav,
      thesis_notes: ann?.thesis_notes || null,
      bet_type: ann?.bet_type || null,
      confidence_level: ann?.confidence_level || null,
      last_review_date: ann?.last_review_date || null,
      updated_at: ib.synced_at || new Date().toISOString(),
    };
  });

  const alerts = alertsQuery.data ?? [];
  const decisionLogs = decisionLogsQuery.data ?? [];
  const snapshots = snapshotsQuery.data ?? [];

  const latestSnapshot = snapshots[0];
  const previousSnapshot = snapshots[1];
  const cashBalance = latestSnapshot?.cash_balance ?? 0;

  // Derive totals from IB positions — use raw ib data to avoid any mapping issues
  const positionsValue = ibPositions.reduce((sum, p) => sum + (Number(p.position_value) || 0), 0);
  const totalValue = positionsValue + cashBalance;

  const previousTotalValue = previousSnapshot?.total_value ?? totalValue;
  const dailyChange = totalValue - previousTotalValue;
  const dailyChangePercent = previousTotalValue > 0
    ? ((dailyChange / previousTotalValue) * 100)
    : 0;

  const stocksValue = positions
    .filter(p => p.position_type === "stock")
    .reduce((sum, p) => sum + (Number(p.market_value) || 0), 0);
  const etfsValue = positions
    .filter(p => p.position_type === "etf")
    .reduce((sum, p) => sum + (Number(p.market_value) || 0), 0);

  const stocksPercent = totalValue > 0 ? (stocksValue / totalValue) * 100 : 0;
  const etfsPercent = totalValue > 0 ? (etfsValue / totalValue) * 100 : 0;
  const cashPercent = totalValue > 0 ? (cashBalance / totalValue) * 100 : 0;

  const categoryBreakdown = positions.reduce((acc, p) => {
    const category = p.category ?? "other";
    acc[category] = (acc[category] ?? 0) + (Number(p.market_value) || 0);
    return acc;
  }, {} as Record<string, number>);

  const lastUpdateDate = positions.length > 0
    ? Math.max(...positions.map(p => new Date(p.updated_at).getTime()))
    : null;
  const daysSinceUpdate = lastUpdateDate
    ? Math.floor((Date.now() - lastUpdateDate) / (1000 * 60 * 60 * 24))
    : null;

  const lastPriceRefresh = latestSnapshot?.data_json && typeof latestSnapshot.data_json === "object" && "price_refresh" in latestSnapshot.data_json
    ? new Date(latestSnapshot.data_json.price_refresh as string)
    : latestSnapshot?.snapshot_date
      ? new Date(latestSnapshot.snapshot_date)
      : null;

  const daysSincePriceRefresh = lastPriceRefresh
    ? Math.floor((Date.now() - lastPriceRefresh.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const topPositions = [...positions]
    .sort((a, b) => (Number(b.weight_percent) || 0) - (Number(a.weight_percent) || 0))
    .slice(0, 5);

  // Update cash balance mutation
  const updateCashMutation = useMutation({
    mutationFn: async (newCashBalance: number) => {
      if (!user) throw new Error("Not authenticated");
      const today = new Date().toISOString().split("T")[0];

      const { data: existingSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("*")
        .eq("user_id", user.id)
        .eq("snapshot_date", today)
        .maybeSingle();

      if (existingSnapshot) {
        const { error } = await supabase
          .from("portfolio_snapshots")
          .update({ cash_balance: newCashBalance })
          .eq("id", existingSnapshot.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("portfolio_snapshots")
          .insert({
            user_id: user.id,
            snapshot_date: today,
            cash_balance: newCashBalance,
            total_value: positionsValue + newCashBalance,
            stocks_percent: (positionsValue + newCashBalance) > 0 ? (stocksValue / (positionsValue + newCashBalance)) * 100 : 0,
            etfs_percent: (positionsValue + newCashBalance) > 0 ? (etfsValue / (positionsValue + newCashBalance)) * 100 : 0,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio_snapshots"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });

  return {
    positions,
    alerts,
    decisionLogs,
    snapshots,

    totalValue,
    positionsValue,
    cashBalance,
    dailyChange,
    dailyChangePercent,
    stocksPercent,
    etfsPercent,
    cashPercent,
    stocksValue,
    etfsValue,
    categoryBreakdown,
    daysSinceUpdate,
    daysSincePriceRefresh,
    lastPriceRefresh,
    topPositions,

    isLoading: ibPositionsQuery.isLoading || alertsQuery.isLoading ||
               decisionLogsQuery.isLoading || snapshotsQuery.isLoading,

    dismissAlert: dismissAlertMutation.mutate,
    isDismissing: dismissAlertMutation.isPending,
    updateCashBalance: updateCashMutation.mutateAsync,
    isUpdatingCash: updateCashMutation.isPending,
  };
}
