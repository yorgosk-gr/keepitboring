import { useState, useMemo, useEffect } from "react";
import { Search, Briefcase, DollarSign, Trash2, Download, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePositions, type Position, type PositionFormData } from "@/hooks/usePositions";
import { useDashboardData } from "@/hooks/useDashboardData";
import { usePriceRefresh, type PriceUpdate } from "@/hooks/usePriceRefresh";

import { PositionsTable } from "@/components/portfolio/PositionsTable";
import { PositionModal } from "@/components/portfolio/PositionModal";
import { LogDecisionModal } from "@/components/decisions/LogDecisionModal";
import { RefreshPricesModal } from "@/components/portfolio/RefreshPricesModal";
import { DeleteConfirmModal } from "@/components/portfolio/DeleteConfirmModal";
import { ThesisPanel } from "@/components/portfolio/ThesisPanel";
import { PortfolioValue } from "@/components/dashboard/PortfolioValue";

import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useIBSync } from "@/hooks/useIBSync";
import { useVolatilityAlerts, type VolatilityAlert } from "@/hooks/useVolatilityAlerts";
import { VolatilityAlertModal } from "@/components/portfolio/VolatilityAlertModal";
import { toast } from "sonner";
import { formatDistanceToNow, format, isWeekend, subDays, isSameDay, isAfter, startOfDay } from "date-fns";

/** Count business days between two dates (exclusive of both endpoints) */
function businessDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const current = new Date(from);
  current.setDate(current.getDate() + 1);
  while (current < to) {
    if (!isWeekend(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export default function Portfolio() {
  const { user } = useAuth();
  const {
    positions,
    isLoading,
    updateAnnotation,
    isUpdating,
  } = usePositions();

  const { cashBalance, totalValue, updateCashBalance, isUpdatingCash } = useDashboardData();
  const { sync, isSyncing, isConnected, lastSynced } = useIBSync();
  const { checkVolatility } = useVolatilityAlerts();
  const { fetchPrices, isFetching: isFetchingPrices, progress: priceProgress } = usePriceRefresh();

  // Fetch latest data date (most recent of: last sync, last price refresh, last trade)
  const { data: latestDataDate } = useQuery({
    queryKey: ["latest-data-date", user?.id],
    queryFn: async () => {
      const dates: Date[] = [];

      // Check last portfolio snapshot (price refresh)
      const { data: snapshot } = await supabase
        .from("portfolio_snapshots")
        .select("created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snapshot?.created_at) dates.push(new Date(snapshot.created_at));

      // Check last IB sync
      const { data: account } = await supabase
        .from("ib_accounts")
        .select("last_synced_at")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (account?.last_synced_at) dates.push(new Date(account.last_synced_at));

      if (dates.length === 0) return null;
      return new Date(Math.max(...dates.map(d => d.getTime())));
    },
    enabled: !!user,
  });

  const dataFreshnessNotice = useMemo(() => {
    if (!latestDataDate) return null;
    const today = startOfDay(new Date());
    const dataDay = startOfDay(latestDataDate);

    if (isSameDay(dataDay, today)) return null;

    const bizDays = businessDaysBetween(dataDay, today);

    return {
      level: bizDays > 1 ? "warning" as const : "info" as const,
      message: `Portfolio data is current as of ${format(dataDay, "MMM d")}`,
    };
  }, [latestDataDate]);

  const [showPriceModal, setShowPriceModal] = useState(false);
  const [fetchedPrices, setFetchedPrices] = useState<PriceUpdate[]>([]);
  const [volatilityAlerts, setVolatilityAlerts] = useState<VolatilityAlert[]>([]);
  const [showVolatilityModal, setShowVolatilityModal] = useState(false);
  const [notFoundTickers, setNotFoundTickers] = useState<string[]>([]);
  const [lastPriceRefresh, setLastPriceRefresh] = useState<Date | null>(null);
  
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");
  
  // Modal states
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [loggingDecisionFor, setLoggingDecisionFor] = useState<Position | null>(null);
  const [thesisPosition, setThesisPosition] = useState<Position | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showMissingThesisOnly, setShowMissingThesisOnly] = useState(false);

  // Load last price refresh timestamp
  useEffect(() => {
    const loadLastRefresh = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from("portfolio_snapshots")
        .select("created_at, data_json")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (data?.data_json && typeof data.data_json === "object" && "price_refresh" in (data.data_json as Record<string, unknown>)) {
        setLastPriceRefresh(new Date((data.data_json as Record<string, string>).price_refresh));
      } else if (data) {
        setLastPriceRefresh(new Date(data.created_at));
      }
    };
    
    loadLastRefresh();
  }, [user]);

  // Filter positions by search
  const filteredPositions = useMemo(() => {
    let result = positions;
    if (showMissingThesisOnly) {
      result = result.filter(p => !p.thesis_notes || !p.confidence_level);
    }
    if (!searchQuery.trim()) return result;
    const query = searchQuery.toLowerCase();
    return result.filter(p => 
      p.ticker.toLowerCase().includes(query) ||
      p.name?.toLowerCase().includes(query)
    );
  }, [positions, searchQuery, showMissingThesisOnly]);

  // Count positions missing thesis
  const missingThesisCount = useMemo(() =>
    positions.filter(p => !p.thesis_notes || !p.confidence_level).length,
    [positions]
  );

  const handleUpdateAnnotation = async (data: PositionFormData) => {
    if (!editingPosition) return;
    await updateAnnotation({
      ticker: editingPosition.ticker,
      formData: data,
    });
    setEditingPosition(null);
  };

  // Handle price refresh
  const handleRefreshPrices = async () => {
    if (positions.length === 0) {
      toast.info("No positions to refresh");
      return;
    }

    setShowPriceModal(true);
    const tickerInfos = positions.map(p => ({
      ticker: p.ticker,
      currency: p.currency || undefined,
      exchange: p.exchange || undefined,
      instrumentType: p.position_type === "stock" ? "Stock" : p.position_type === "etf" ? "ETF" : undefined,
    }));
    const { prices, notFound } = await fetchPrices(tickerInfos);
    setFetchedPrices(prices);
    setNotFoundTickers(notFound);
  };

  // Handle clearing all positions (IB source + annotations) and reset cash
  const handleClearAllPositions = async () => {
    if (!user) return;
    setIsClearing(true);
    try {
      // Delete positions/annotations and reset cash in parallel
      const [ibResult, posResult, cashResult] = await Promise.all([
        supabase.from("ib_positions").delete().eq("user_id", user.id),
        supabase.from("positions").delete().eq("user_id", user.id),
        supabase.from("ib_accounts").update({ cash_balance: 0 }).eq("user_id", user.id),
      ]);
      if (ibResult.error) throw ibResult.error;
      if (posResult.error) throw posResult.error;
      if (cashResult.error) throw cashResult.error;
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["ib-positions"] });
      queryClient.invalidateQueries({ queryKey: ["ib-account"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast.success("All positions cleared");
    } catch (err: any) {
      toast.error("Failed to clear positions: " + err.message);
    } finally {
      setIsClearing(false);
      setShowClearConfirm(false);
    }
  };


  // Apply fetched prices: update ib_positions.mark_price + create snapshot
  const handleApplyPriceUpdates = async (updates: { id: string; current_price: number }[]) => {
    // Capture previous prices for volatility detection
    const previousPrices: Record<string, number> = {};
    for (const pos of positions) {
      if (pos.ticker && pos.current_price) {
        previousPrices[pos.ticker] = pos.current_price;
      }
    }
    if (!user) return;

    try {
      // Step 1: Update actual prices in ib_positions
      let updatedCount = 0;
      for (const update of updates) {
        const pos = positions.find(p => p.id === update.id);
        if (!pos) continue;

        const newValue = pos.shares ? pos.shares * update.current_price : null;
        const { error: updateErr } = await supabase
          .from("ib_positions")
          .update({
            mark_price: update.current_price,
            ...(newValue !== null ? { position_value: newValue } : {}),
            synced_at: new Date().toISOString(),
          })
          .eq("id", update.id)
          .eq("user_id", user.id);

        if (!updateErr) updatedCount++;
      }

      // Step 2: Recalculate totals for snapshot
      // Re-fetch so we have updated values
      const updatedPositions = positions.map(p => {
        const upd = updates.find(u => u.id === p.id);
        if (!upd) return p;
        const newMV = p.shares ? p.shares * upd.current_price : p.market_value;
        return { ...p, current_price: upd.current_price, market_value: newMV };
      });

      const totalMV = updatedPositions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
      const stocksValue = updatedPositions
        .filter(p => p.position_type === "stock")
        .reduce((sum, p) => sum + (p.market_value ?? 0), 0);
      const etfsValue = updatedPositions
        .filter(p => p.position_type === "etf")
        .reduce((sum, p) => sum + (p.market_value ?? 0), 0);

      await supabase.from("portfolio_snapshots").insert({
        user_id: user.id,
        total_value: totalMV,
        stocks_percent: totalMV > 0 ? (stocksValue / totalMV) * 100 : 0,
        etfs_percent: totalMV > 0 ? (etfsValue / totalMV) * 100 : 0,
        cash_balance: cashBalance,
        data_json: {
          price_refresh: new Date().toISOString(),
          updated_count: updatedCount,
        },
      });

      setLastPriceRefresh(new Date());
      queryClient.invalidateQueries({ queryKey: ["ib-positions"] });
      queryClient.invalidateQueries({ queryKey: ["ib-positions-weights"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["latest-data-date"] });

      // Check for volatility alerts
      if (fetchedPrices.length > 0) {
        const alerts = await checkVolatility(fetchedPrices, previousPrices);
        if (alerts.length > 0) {
          setVolatilityAlerts(alerts);
          setShowVolatilityModal(true);
        }
      }

      toast.success(`Updated prices for ${updatedCount} positions`);
    } catch (error) {
      console.error("Failed to apply price updates:", error);
      toast.error("Failed to update prices. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      <VolatilityAlertModal
        open={showVolatilityModal}
        alerts={volatilityAlerts}
        onClose={() => setShowVolatilityModal(false)}
        onLogDecision={(ticker) => {
          setShowVolatilityModal(false);
          const pos = positions.find(p => p.ticker === ticker);
          if (pos) {
            setLoggingDecisionFor(pos);
          }
        }}
      />
      {/* Data Freshness Notice */}
      {dataFreshnessNotice && (
        <div className={`flex items-center justify-between p-4 rounded-lg border ${
          dataFreshnessNotice.level === "warning"
            ? "bg-amber-500/10 border-amber-500/20"
            : "bg-muted/50 border-border"
        }`}>
          <div className="flex items-center gap-3">
            <BarChart3 className={`w-5 h-5 ${
              dataFreshnessNotice.level === "warning" ? "text-amber-500" : "text-muted-foreground"
            }`} />
            <p className={`text-sm ${
              dataFreshnessNotice.level === "warning" ? "text-amber-500" : "text-muted-foreground"
            }`}>
              {dataFreshnessNotice.message}
            </p>
          </div>
          {dataFreshnessNotice.level === "warning" && isConnected && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
              onClick={sync}
              disabled={isSyncing}
            >
              <Download className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
              Sync Now
            </Button>
          )}
        </div>
      )}

      {/* Thesis Health Banner */}
      {!isLoading && positions.length > 0 && missingThesisCount > 3 && (
        <div className="flex items-center justify-between p-4 rounded-lg border bg-amber-500/10 border-amber-500/20">
          <p className="text-sm text-amber-500">
            {missingThesisCount} of {positions.length} positions have no thesis
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
            onClick={() => {
              const firstMissing = positions.find(p => !p.thesis_notes);
              if (firstMissing) setThesisPosition(firstMissing);
            }}
          >
            Add thesis
          </Button>
        </div>
      )}

      {/* Header */}
      <PortfolioValue
        totalValue={totalValue}
        positionsCount={positions.length}
        cashBalance={cashBalance}
        isLoading={isLoading}
      />

      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-end">
        
        <div className="flex flex-wrap gap-2">
          <TooltipProvider delayDuration={300}>
            {isConnected && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    className="gap-2"
                    onClick={sync}
                    disabled={isSyncing}
                  >
                    <Download className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                    {isSyncing ? "Syncing..." : "Sync IB"}
                    {lastSynced && (
                      <span className="text-xs opacity-70 hidden lg:inline">
                        ({formatDistanceToNow(new Date(lastSynced), { addSuffix: true })})
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p className="font-medium">Sync from Interactive Brokers</p>
                  <p className="text-xs text-muted-foreground">Pull latest positions, trades & cash from your IB Flex Query.</p>
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={handleRefreshPrices}
                  disabled={positions.length === 0 || isFetchingPrices}
                >
                  <DollarSign className="w-4 h-4" />
                  {isFetchingPrices ? "Fetching..." : "Refresh Prices"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium">Refresh Prices</p>
                <p className="text-xs text-muted-foreground">Live prices from Yahoo Finance, FX-converted to USD.</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  className="gap-2 text-destructive hover:bg-destructive/10"
                  onClick={() => setShowClearConfirm(true)}
                  disabled={positions.length === 0 && cashBalance <= 0}
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Delete all positions and reset cash balance</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>


      {/* Search Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by ticker or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 bg-secondary border-border"
          />
        </div>
      </div>

      {/* Positions Table or Empty State */}
      {!isLoading && positions.length === 0 ? (
        <div className="stat-card flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">No IB positions synced</h2>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            Connect your Interactive Brokers account in Settings and sync to see your positions here.
          </p>
        </div>
      ) : (
        <PositionsTable
          positions={filteredPositions}
          isLoading={isLoading}
          onEdit={setEditingPosition}
          onDelete={() => {}} // No-op: IB is source of truth
          onLogDecision={setLoggingDecisionFor}
          selectedIds={[]}
          onSelectionChange={() => {}}
          hideDeleteActions
          cashBalance={cashBalance}
          totalValue={totalValue}
          onOpenThesis={setThesisPosition}
        />
      )}

      {/* Edit Position Modal (annotations only) */}
      <PositionModal
        open={!!editingPosition}
        onClose={() => setEditingPosition(null)}
        onSubmit={handleUpdateAnnotation}
        position={editingPosition}
        isLoading={isUpdating}
        annotationOnly
      />

      {/* Log Decision Modal */}
      <LogDecisionModal
        open={!!loggingDecisionFor}
        onClose={() => setLoggingDecisionFor(null)}
        position={loggingDecisionFor}
      />

      {/* Refresh Prices Modal */}
      <RefreshPricesModal
        open={showPriceModal}
        onClose={() => {
          setShowPriceModal(false);
          setFetchedPrices([]);
          setNotFoundTickers([]);
        }}
        positions={positions}
        prices={fetchedPrices}
        notFound={notFoundTickers}
        isFetching={isFetchingPrices}
        progress={priceProgress}
        onApply={handleApplyPriceUpdates}
      />

      {/* Clear All Positions Confirmation */}
      <DeleteConfirmModal
        open={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearAllPositions}
        ticker="ALL POSITIONS"
        isLoading={isClearing}
      />

      {/* Thesis Side Panel */}
      <ThesisPanel
        open={!!thesisPosition}
        onClose={() => setThesisPosition(null)}
        position={thesisPosition}
        onSave={async (data) => {
          if (!thesisPosition) return;
          await updateAnnotation({
            ticker: thesisPosition.ticker,
            formData: {
              thesis_notes: data.thesis_notes,
              confidence_level: data.confidence_level,
              bet_type: data.bet_type,
              invalidation_triggers: data.invalidation_trigger,
              last_review_date: data.last_review_date,
            } as any,
          });
          setThesisPosition(null);
        }}
        isSaving={isUpdating}
      />

    </div>
  );
}
