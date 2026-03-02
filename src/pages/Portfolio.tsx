import { useState, useMemo, useEffect } from "react";
import { Search, Briefcase, RefreshCw, DollarSign, Clock, Tags, CheckCircle, TrendingUp, Trash2, Download, BarChart3, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePositions, type Position, type PositionFormData } from "@/hooks/usePositions";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useTickerVerification } from "@/hooks/useTickerVerification";
import { usePriceRefresh, type PriceUpdate } from "@/hooks/usePriceRefresh";
import { useFundamentals } from "@/hooks/useFundamentals";
import { lookupTicker } from "@/lib/tickerReference";

import { PositionsTable } from "@/components/portfolio/PositionsTable";
import { PositionModal } from "@/components/portfolio/PositionModal";
import { LogDecisionModal } from "@/components/decisions/LogDecisionModal";
import { RefreshPricesModal } from "@/components/portfolio/RefreshPricesModal";
import { CashBalanceEditor } from "@/components/portfolio/CashBalanceEditor";
import { DeleteConfirmModal } from "@/components/portfolio/DeleteConfirmModal";
import { ThesisPanel } from "@/components/portfolio/ThesisPanel";

import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useIBSync } from "@/hooks/useIBSync";
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

  // Fetch latest trade date for data freshness notice
  const { data: latestTradeDate } = useQuery({
    queryKey: ["latest-trade-date", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ib_trades")
        .select("trade_date")
        .eq("user_id", user!.id)
        .order("trade_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.trade_date ? new Date(data.trade_date + "T00:00:00") : null;
    },
    enabled: !!user,
  });

  const dataFreshnessNotice = useMemo(() => {
    if (!latestTradeDate) return null;
    const today = startOfDay(new Date());
    const tradeDay = startOfDay(latestTradeDate);

    if (isSameDay(tradeDay, today) || isSameDay(tradeDay, subDays(today, 1))) {
      return null; // fresh
    }

    const bizDays = businessDaysBetween(tradeDay, today);

    if (bizDays <= 1) {
      return {
        level: "info" as const,
        message: `Portfolio data is current as of ${format(tradeDay, "MMM d")}. Today's transactions will appear after market close.`,
      };
    }

    return {
      level: "warning" as const,
      message: `Portfolio data is current as of ${format(tradeDay, "MMM d")}. Sync to update.`,
    };
  }, [latestTradeDate]);

  const { verifySinglePosition, verifyPositions, isVerifying, progress: verifyProgress } = useTickerVerification();
  
  const { fetchPrices, isFetching: isFetchingPrices, progress: priceProgress } = usePriceRefresh();
  const { fetchFundamentals, isFetching: isFetchingFundamentals } = useFundamentals();
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [fetchedPrices, setFetchedPrices] = useState<PriceUpdate[]>([]);
  const [notFoundTickers, setNotFoundTickers] = useState<string[]>([]);
  const [lastPriceRefresh, setLastPriceRefresh] = useState<Date | null>(null);
  
  const queryClient = useQueryClient();
  const [verifyingPositionId, setVerifyingPositionId] = useState<string | null>(null);

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

  // Handle position verification via web search
  const handleVerifyPosition = async (position: Position) => {
    setVerifyingPositionId(position.id);
    
    const result = await verifySinglePosition({
      ticker: position.ticker,
      name: position.name,
      current_price: position.current_price,
      market_value: position.market_value,
    });

    if (result) {
      // Save corrections as annotations
      if (result.name || result.category || result.asset_type) {
        await updateAnnotation({
          ticker: position.ticker,
          formData: {
            name: result.name || undefined,
            category: result.category as any || undefined,
            position_type: result.asset_type as any || undefined,
          } as any,
        });
      }
      
      if (result.verification_status === "confirmed") {
        toast.success(`${position.ticker} verified successfully`);
      } else if (result.verification_status === "corrected") {
        toast.info(`${position.ticker} may need attention: ${result.notes}`);
      }
    }
    
    setVerifyingPositionId(null);
  };

  const handleVerifyAll = async () => {
    if (positions.length === 0) {
      toast.info("No positions to verify");
      return;
    }

    const positionsToVerify = positions.map(p => ({
      ticker: p.ticker,
      name: p.name,
      current_price: p.current_price,
      market_value: p.market_value,
    }));

    const results = await verifyPositions(positionsToVerify);
    
    if (results.length > 0) {
      for (const result of results) {
        if (result.name || result.category || result.asset_type) {
          await updateAnnotation({
            ticker: result.original_ticker,
            formData: {
              name: result.name || undefined,
              category: result.category as any || undefined,
              position_type: result.asset_type as any || undefined,
            } as any,
          });
        }
      }

      const confirmedCount = results.filter(r => r.verification_status === "confirmed").length;
      const correctedCount = results.filter(r => r.verification_status === "corrected").length;
      
      if (correctedCount > 0) {
        toast.info(`Verified ${confirmedCount} positions. ${correctedCount} may need attention.`);
      }
    }
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

  // Handle ETF reclassification using local ticker reference
  const handleReclassifyETFs = async () => {
    if (positions.length === 0) {
      toast.info("No positions to reclassify");
      return;
    }

    let updatedCount = 0;

    for (const position of positions) {
      const lookup = lookupTicker(position.ticker);
      if (!lookup) continue;

      const updates: Partial<PositionFormData> = {};

      if (lookup.type === "etf" && position.position_type !== "etf") {
        updates.position_type = "etf";
      }
      if (lookup.type === "stock" && position.position_type !== "stock") {
        updates.position_type = "stock";
      }
      if (lookup.category && position.category !== lookup.category) {
        updates.category = lookup.category as any;
      }
      if (lookup.name) {
        updates.name = lookup.name;
      }

      if (Object.keys(updates).length > 0) {
        await updateAnnotation({ ticker: position.ticker, formData: updates as any });
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      toast.success(`Updated ${updatedCount} positions from ticker reference`);
    } else {
      toast.info("All positions already correctly classified");
    }
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


  // but we can still create snapshots for tracking
  const handleApplyPriceUpdates = async (updates: { id: string; current_price: number }[]) => {
    if (!user) return;

    try {
      const totalMV = positions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
      const stocksValue = positions
        .filter(p => p.position_type === "stock")
        .reduce((sum, p) => sum + (p.market_value ?? 0), 0);
      const etfsValue = positions
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
          updated_count: updates.length,
        },
      });

      setLastPriceRefresh(new Date());
      queryClient.invalidateQueries({ queryKey: ["ib-positions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      
      toast.success(`Price snapshot recorded for ${updates.length} positions`);
    } catch (error) {
      console.error("Failed to apply price updates:", error);
      toast.error("Failed to update prices. Please try again.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Data Freshness Notice */}
      {(dataFreshnessNotice || lastPriceRefresh) && (
        <div className={`flex items-center justify-between p-4 rounded-lg border ${
          dataFreshnessNotice?.level === "warning"
            ? "bg-amber-500/10 border-amber-500/20"
            : "bg-muted/50 border-border"
        }`}>
          <div className="flex items-center gap-3">
            <BarChart3 className={`w-5 h-5 ${
              dataFreshnessNotice?.level === "warning" ? "text-amber-500" : "text-muted-foreground"
            }`} />
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
              {dataFreshnessNotice && (
                <p className={`text-sm ${
                  dataFreshnessNotice.level === "warning" ? "text-amber-500" : "text-muted-foreground"
                }`}>
                  📊 {dataFreshnessNotice.message}
                </p>
              )}
              {lastPriceRefresh && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Prices: {formatDistanceToNow(lastPriceRefresh, { addSuffix: true })}
                </span>
              )}
            </div>
          </div>
          {dataFreshnessNotice?.level === "warning" && isConnected && (
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
            ⚠️ {missingThesisCount} of {positions.length} positions have no thesis
          </p>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-amber-500/30 text-amber-500 hover:bg-amber-500/10"
            onClick={() => setShowMissingThesisOnly(!showMissingThesisOnly)}
          >
            {showMissingThesisOnly ? "Show All" : "Add thesis"}
          </Button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{positions.length} positions</span>
            <span className="hidden sm:inline text-border">•</span>
            <span className="font-mono">${totalValue.toLocaleString("en-US", { minimumFractionDigits: 0 })} total</span>
            <span className="hidden sm:inline text-border">•</span>
            <span className="flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" />
              Cash: <span className="font-mono">${cashBalance.toLocaleString("en-US", { minimumFractionDigits: 0 })}</span>
              {totalValue > 0 && (
                <span className="text-xs">({((cashBalance / totalValue) * 100).toFixed(1)}%)</span>
              )}
            </span>
          </div>
        </div>
        
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
                  onClick={handleReclassifyETFs}
                  disabled={positions.length === 0}
                >
                  <Tags className="w-4 h-4" />
                  <span className="hidden sm:inline">①</span> Reclassify
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium">Step 1: Reclassify ETFs</p>
                <p className="text-xs text-muted-foreground">Instantly correct types &amp; categories using local reference. Fast &amp; free.</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={handleVerifyAll}
                  disabled={positions.length === 0 || isVerifying}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span className="hidden sm:inline">②</span> {isVerifying ? "Verifying..." : "Verify"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium">Step 2: Verify Tickers</p>
                <p className="text-xs text-muted-foreground">AI web search to confirm tickers, correct mismatches, fill metadata. Cached 24h.</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={handleRefreshPrices}
                  disabled={positions.length === 0 || isFetchingPrices}
                >
                  <DollarSign className="w-4 h-4" />
                  <span className="hidden sm:inline">③</span> Prices
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium">Step 3: Refresh Prices</p>
                <p className="text-xs text-muted-foreground">Live prices from Yahoo Finance, FX-converted to USD, with preview before applying.</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="outline" 
                  className="gap-2"
                  onClick={() => fetchFundamentals(positions)}
                  disabled={positions.length === 0 || isFetchingFundamentals}
                >
                  <TrendingUp className="w-4 h-4" />
                  <span className="hidden sm:inline">④</span> {isFetchingFundamentals ? "Fetching..." : "Fundamentals"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs">
                <p className="font-medium">Step 4: Fetch Fundamentals</p>
                <p className="text-xs text-muted-foreground">Pull ROIC, Earnings Yield etc. for stocks. Powers portfolio analysis quality checks.</p>
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
        {isVerifying && verifyProgress.total > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Verifying {verifyProgress.current}-{Math.min(verifyProgress.current + 4, verifyProgress.total)} of {verifyProgress.total}...</span>
          </div>
        )}
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
          onVerify={handleVerifyPosition}
          isVerifying={isVerifying}
          verifyingId={verifyingPositionId}
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

      {/* Workflow Reference */}
      <div className="rounded-lg border border-border bg-secondary/30 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Data Enrichment Workflow</h3>
        <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
          {[
            { step: "①", title: "Sync IB", desc: "Pull latest positions, trades & cash from your IB Flex Query." },
            { step: "②", title: "Reclassify", desc: "Re-categorize positions (ETF vs Stock, Broad vs Thematic) using local ticker reference." },
            { step: "③", title: "Verify", desc: "AI web search to validate symbols & enrich metadata. Cached 24h." },
            { step: "④", title: "Prices", desc: "Fetch live prices from Yahoo Finance, convert currencies to USD, update market values." },
            { step: "⑤", title: "Fundamentals", desc: "Fetch quality metrics (ROIC, earnings yield, debt ratios) for the analysis engine." },
          ].map((item) => (
            <li key={item.step} className="flex gap-3">
              <span className="text-lg leading-5 text-primary">{item.step}</span>
              <div>
                <p className="font-semibold text-foreground">{item.title}</p>
                <p className="text-muted-foreground mt-0.5">{item.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
