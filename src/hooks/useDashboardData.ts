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

export function useDashboardData() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch positions
  const positionsQuery = useQuery({
    queryKey: ["positions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .order("market_value", { ascending: false });
      
      if (error) throw error;
      return data as Position[];
    },
    enabled: !!user,
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
      
      // Sort by severity: critical > warning > info
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      return (data as Alert[]).sort((a, b) => {
        const aOrder = severityOrder[a.severity as keyof typeof severityOrder] ?? 3;
        const bOrder = severityOrder[b.severity as keyof typeof severityOrder] ?? 3;
        return aOrder - bOrder;
      });
    },
    enabled: !!user,
  });

  // Fetch recent decision logs
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

  // Fetch latest snapshots (today and yesterday for P&L)
  const snapshotsQuery = useQuery({
    queryKey: ["portfolio_snapshots", "latest", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolio_snapshots")
        .select("*")
        .order("snapshot_date", { ascending: false })
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

  // Update cash balance mutation
  const updateCashMutation = useMutation({
    mutationFn: async (newCashBalance: number) => {
      if (!user) throw new Error("Not authenticated");

      // Get or create today's snapshot
      const today = new Date().toISOString().split("T")[0];
      
      const { data: existingSnapshot } = await supabase
        .from("portfolio_snapshots")
        .select("*")
        .eq("user_id", user.id)
        .eq("snapshot_date", today)
        .maybeSingle();

      if (existingSnapshot) {
        // Update existing snapshot
        const { error } = await supabase
          .from("portfolio_snapshots")
          .update({ cash_balance: newCashBalance })
          .eq("id", existingSnapshot.id);
        
        if (error) throw error;
      } else {
        // Create new snapshot with cash balance
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

  // Calculate derived data
  const positions = positionsQuery.data ?? [];
  const alerts = alertsQuery.data ?? [];
  const decisionLogs = decisionLogsQuery.data ?? [];
  const snapshots = snapshotsQuery.data ?? [];

  // Get cash balance from latest snapshot
  const latestSnapshot = snapshots[0];
  const previousSnapshot = snapshots[1];
  const cashBalance = latestSnapshot?.cash_balance ?? 0;

  // Total portfolio value = sum of positions + cash
  const positionsValue = positions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
  const totalValue = positionsValue + cashBalance;
  
  // Previous value for daily P&L
  const previousTotalValue = previousSnapshot?.total_value ?? totalValue;
  const dailyChange = totalValue - previousTotalValue;
  const dailyChangePercent = previousTotalValue > 0 
    ? ((dailyChange / previousTotalValue) * 100) 
    : 0;

  // Calculate allocations based on total portfolio value (including cash)
  const stocksValue = positions
    .filter(p => p.position_type === "stock")
    .reduce((sum, p) => sum + (p.market_value ?? 0), 0);
  const etfsValue = positions
    .filter(p => p.position_type === "etf")
    .reduce((sum, p) => sum + (p.market_value ?? 0), 0);
  
  // Calculate percentages based on total portfolio value (positions + cash)
  const stocksPercent = totalValue > 0 ? (stocksValue / totalValue) * 100 : 0;
  const etfsPercent = totalValue > 0 ? (etfsValue / totalValue) * 100 : 0;
  const cashPercent = totalValue > 0 ? (cashBalance / totalValue) * 100 : 0;

  // Category breakdown
  const categoryBreakdown = positions.reduce((acc, p) => {
    const category = p.category ?? "other";
    acc[category] = (acc[category] ?? 0) + (p.market_value ?? 0);
    return acc;
  }, {} as Record<string, number>);

  // Days since last update
  const lastUpdateDate = positions.length > 0
    ? Math.max(...positions.map(p => new Date(p.updated_at).getTime()))
    : null;
  const daysSinceUpdate = lastUpdateDate
    ? Math.floor((Date.now() - lastUpdateDate) / (1000 * 60 * 60 * 24))
    : null;

  // Days since last price refresh
  const lastPriceRefresh = latestSnapshot?.data_json && typeof latestSnapshot.data_json === "object" && "price_refresh" in latestSnapshot.data_json
    ? new Date(latestSnapshot.data_json.price_refresh as string)
    : latestSnapshot?.snapshot_date 
      ? new Date(latestSnapshot.snapshot_date)
      : null;
  
  const daysSincePriceRefresh = lastPriceRefresh
    ? Math.floor((Date.now() - lastPriceRefresh.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Top 5 positions by weight
  const topPositions = [...positions]
    .sort((a, b) => (b.weight_percent ?? 0) - (a.weight_percent ?? 0))
    .slice(0, 5);

  return {
    // Raw data
    positions,
    alerts,
    decisionLogs,
    snapshots,
    
    // Calculated values
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
    
    // Loading states
    isLoading: positionsQuery.isLoading || alertsQuery.isLoading || 
               decisionLogsQuery.isLoading || snapshotsQuery.isLoading,
    
    // Mutations
    dismissAlert: dismissAlertMutation.mutate,
    isDismissing: dismissAlertMutation.isPending,
    updateCashBalance: updateCashMutation.mutateAsync,
    isUpdatingCash: updateCashMutation.isPending,
  };
}
