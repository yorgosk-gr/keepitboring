import { useState, useMemo, useEffect } from "react";
import { Search, Briefcase, RefreshCw, DollarSign, Clock, Tags, CheckCircle, TrendingUp, Trash2 } from "lucide-react";
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

import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export default function Portfolio() {
  const { user } = useAuth();
  const {
    positions,
    isLoading,
    updateAnnotation,
    isUpdating,
  } = usePositions();

  const { cashBalance, totalValue, updateCashBalance, isUpdatingCash } = useDashboardData();
  
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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

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
    if (!searchQuery.trim()) return positions;
    const query = searchQuery.toLowerCase();
    return positions.filter(p => 
      p.ticker.toLowerCase().includes(query) ||
      p.name?.toLowerCase().includes(query)
    );
  }, [positions, searchQuery]);

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

  // Handle clearing all positions
  const handleClearAllPositions = async () => {
    if (!user) return;
    setIsClearing(true);
    try {
      const { error } = await supabase
        .from("positions")
        .delete()
        .eq("user_id", user.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["positions"] });
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              {positions.length} positions • ${totalValue.toLocaleString("en-US", { minimumFractionDigits: 0 })} total
            </p>
            {lastPriceRefresh && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Prices: {formatDistanceToNow(lastPriceRefresh, { addSuffix: true })}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <TooltipProvider delayDuration={300}>
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
                  disabled={positions.length === 0}
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p className="text-xs">Delete all positions from the database</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Cash Balance Editor */}
      <div className="max-w-sm">
        <CashBalanceEditor
          cashBalance={cashBalance}
          cashPercent={totalValue > 0 ? (cashBalance / totalValue) * 100 : 0}
          onUpdate={updateCashBalance}
          isUpdating={isUpdatingCash}
        />
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
    </div>
  );
}
