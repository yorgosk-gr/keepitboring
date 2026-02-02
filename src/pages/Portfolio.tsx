import { useState, useMemo, useEffect } from "react";
import { Upload, Plus, Search, Briefcase, RefreshCw, DollarSign, Clock, Tags, CheckCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePositions, type Position, type PositionFormData } from "@/hooks/usePositions";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useTickerVerification } from "@/hooks/useTickerVerification";
import { usePriceRefresh, type PriceUpdate } from "@/hooks/usePriceRefresh";
import { lookupTicker } from "@/lib/tickerReference";
import { AllocationSummary } from "@/components/portfolio/AllocationSummary";
import { PositionsTable } from "@/components/portfolio/PositionsTable";
import { PositionModal } from "@/components/portfolio/PositionModal";
import { DeleteConfirmModal } from "@/components/portfolio/DeleteConfirmModal";
import { LogDecisionModal } from "@/components/decisions/LogDecisionModal";
import { UploadScreenshotModal } from "@/components/portfolio/UploadScreenshotModal";
import { RefreshPricesModal } from "@/components/portfolio/RefreshPricesModal";
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
    addPosition,
    isAdding,
    updatePosition,
    isUpdating,
    deletePosition,
    isDeleting,
    recalculateWeights,
  } = usePositions();

  // Get cash balance and correct allocation percentages from dashboard data
  const { cashBalance, cashPercent, stocksPercent, etfsPercent, totalValue } = useDashboardData();
  
  // Ticker verification
  const { verifySinglePosition, verifyPositions, isVerifying, progress: verifyProgress } = useTickerVerification();
  
  
  // Price refresh
  const { fetchPrices, isFetching: isFetchingPrices, progress: priceProgress } = usePriceRefresh();
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [fetchedPrices, setFetchedPrices] = useState<PriceUpdate[]>([]);
  const [notFoundTickers, setNotFoundTickers] = useState<string[]>([]);
  const [lastPriceRefresh, setLastPriceRefresh] = useState<Date | null>(null);
  
  const queryClient = useQueryClient();
  const [verifyingPositionId, setVerifyingPositionId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [deletingPosition, setDeletingPosition] = useState<Position | null>(null);
  const [loggingDecisionFor, setLoggingDecisionFor] = useState<Position | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

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

  const handleAddPosition = async (data: PositionFormData) => {
    await addPosition(data);
    setShowAddModal(false);
    // Recalculate weights after adding
    setTimeout(() => recalculateWeights(), 500);
  };

  const handleUpdatePosition = async (data: PositionFormData) => {
    if (!editingPosition) return;
    await updatePosition({ id: editingPosition.id, formData: data });
    setEditingPosition(null);
    // Recalculate weights after updating
    setTimeout(() => recalculateWeights(), 500);
  };

  const handleDeletePosition = async () => {
    if (!deletingPosition) return;
    await deletePosition(deletingPosition.id);
    setDeletingPosition(null);
    // Recalculate weights after deleting
    setTimeout(() => recalculateWeights(), 500);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    
    setIsBulkDeleting(true);
    try {
      for (const id of selectedIds) {
        await deletePosition(id);
      }
      toast.success(`Deleted ${selectedIds.length} positions`);
      setSelectedIds([]);
      setShowBulkDeleteModal(false);
      // Recalculate weights after deleting
      setTimeout(() => recalculateWeights(), 500);
    } catch (error) {
      toast.error("Failed to delete some positions");
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const handleUploadScreenshot = () => {
    setShowUploadModal(true);
  };

  const handleUploadComplete = () => {
    // Recalculate weights after import
    setTimeout(() => recalculateWeights(), 500);
  };

  const handleRecalculateWeights = async () => {
    await recalculateWeights();
    toast.success("Weights recalculated successfully");
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
      // Update the position with verified data
      const updates: Partial<Position> = {};
      
      if (result.current_price !== null) {
        updates.current_price = result.current_price;
        updates.market_value = (position.shares ?? 0) * result.current_price;
      }
      
      if (result.name) {
        updates.name = result.name;
      }
      
      if (result.category) {
        updates.category = result.category;
      }
      
      if (result.asset_type) {
        updates.position_type = result.asset_type;
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from("positions")
          .update(updates)
          .eq("id", position.id);

        if (error) {
          toast.error("Failed to update position with verified data");
        } else {
          queryClient.invalidateQueries({ queryKey: ["positions"] });
          
          if (result.verification_status === "confirmed") {
            toast.success(`${position.ticker} verified successfully`);
          } else if (result.verification_status === "corrected") {
            toast.info(`${position.ticker} may need attention: ${result.notes}`);
          }
        }
      }
    }
    
    setVerifyingPositionId(null);
  };

  // Handle verifying all positions at once
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
      // Update positions with verified data
      for (const result of results) {
        const position = positions.find(p => p.ticker === result.original_ticker);
        if (!position) continue;

        const updates: Record<string, unknown> = {};
        
        if (result.current_price !== null) {
          updates.current_price = result.current_price;
          updates.market_value = (position.shares ?? 0) * result.current_price;
        }
        
        if (result.name) {
          updates.name = result.name;
        }
        
        if (result.category) {
          updates.category = result.category;
        }
        
        if (result.asset_type) {
          updates.position_type = result.asset_type;
        }

        if (Object.keys(updates).length > 0) {
          await supabase
            .from("positions")
            .update(updates)
            .eq("id", position.id);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["positions"] });
      
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
    const tickers = positions.map(p => p.ticker);
    const { prices, notFound } = await fetchPrices(tickers);
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

      const updates: Record<string, unknown> = {};

      // Fix type (stock vs etf)
      if (lookup.type === "etf" && position.position_type !== "etf") {
        updates.position_type = "etf";
      }
      if (lookup.type === "stock" && position.position_type !== "stock") {
        updates.position_type = "stock";
      }

      // Fix category from reference data
      if (lookup.category && position.category !== lookup.category) {
        updates.category = lookup.category;
      }

      // Fix name if it looks wrong (current name doesn't match reference)
      if (lookup.name) {
        const currentName = (position.name || "").toLowerCase();
        const refWords = lookup.name.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const hasMatch = refWords.some(w => currentName.includes(w));
        if (!hasMatch || !position.name || position.name === "Company name") {
          updates.name = lookup.name;
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from("positions")
          .update(updates)
          .eq("id", position.id);
        if (!error) updatedCount++;
      }
    }

    if (updatedCount > 0) {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await recalculateWeights();
      toast.success(`Updated ${updatedCount} positions from ticker reference`);
    } else {
      toast.info("All positions already correctly classified");
    }
  };

  // Apply price updates
  const handleApplyPriceUpdates = async (updates: { id: string; current_price: number }[]) => {
    if (!user) return;

    try {
      // Update each position
      for (const update of updates) {
        const position = positions.find(p => p.id === update.id);
        if (!position) continue;

        const newMarketValue = (position.shares ?? 0) * update.current_price;
        
        await supabase
          .from("positions")
          .update({
            current_price: update.current_price,
            market_value: newMarketValue,
          })
          .eq("id", update.id);
      }

      // Recalculate weights
      await recalculateWeights();

      // Create snapshot with price refresh timestamp
      const totalMV = positions.reduce((sum, p) => {
        const update = updates.find(u => u.id === p.id);
        if (update) {
          return sum + (p.shares ?? 0) * update.current_price;
        }
        return sum + (p.market_value ?? 0);
      }, 0);

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
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      
      toast.success(`Prices updated for ${updates.length} positions`);
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
              {positions.length} positions • €{totalValue.toLocaleString("de-DE", { minimumFractionDigits: 0 })} total
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
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handleReclassifyETFs}
            disabled={positions.length === 0}
          >
            <Tags className="w-4 h-4" />
            Reclassify ETFs
          </Button>
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handleRefreshPrices}
            disabled={positions.length === 0 || isFetchingPrices}
          >
            <DollarSign className="w-4 h-4" />
            Refresh Prices
          </Button>
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handleUploadScreenshot}
          >
            <Upload className="w-4 h-4" />
            Upload Screenshot
          </Button>
          <Button 
            className="gap-2"
            onClick={() => setShowAddModal(true)}
          >
            <Plus className="w-4 h-4" />
            Add Position
          </Button>
        </div>
      </div>

      {/* Search and Actions Bar */}
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
        
        <div className="flex gap-2 items-center">
          {isVerifying && verifyProgress.total > 0 && (
            <div className="flex items-center gap-2 mr-2 text-sm text-muted-foreground">
              <span>Verifying {verifyProgress.current}-{Math.min(verifyProgress.current + 4, verifyProgress.total)} of {verifyProgress.total}...</span>
            </div>
          )}
          {selectedIds.length > 0 && (
            <>
              <span className="text-sm text-muted-foreground self-center mr-2">
                {selectedIds.length} selected
              </span>
              <Button
                variant="destructive"
                size="sm"
                className="gap-2"
                onClick={() => setShowBulkDeleteModal(true)}
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </Button>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleVerifyAll}
            disabled={positions.length === 0 || isVerifying}
          >
            <CheckCircle className="w-4 h-4" />
            {isVerifying ? "Verifying..." : "Verify All Tickers"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleRecalculateWeights}
            disabled={positions.length === 0}
          >
            <RefreshCw className="w-4 h-4" />
            Recalculate Weights
          </Button>
        </div>
      </div>

      {/* Allocation Summary */}
      <AllocationSummary 
        stocksPercent={stocksPercent}
        etfsPercent={etfsPercent}
        cashPercent={cashPercent}
        isLoading={isLoading}
      />

      {/* Positions Table or Empty State */}
      {!isLoading && positions.length === 0 ? (
        <div className="stat-card flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Briefcase className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">No positions yet</h2>
          <p className="text-muted-foreground text-center max-w-md mb-6">
            Start building your portfolio by adding your first position or uploading a screenshot from your broker.
          </p>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              className="gap-2"
              onClick={handleUploadScreenshot}
            >
              <Upload className="w-4 h-4" />
              Upload Screenshot
            </Button>
            <Button 
              className="gap-2"
              onClick={() => setShowAddModal(true)}
            >
              <Plus className="w-4 h-4" />
              Add First Position
            </Button>
          </div>
        </div>
      ) : (
        <PositionsTable
          positions={filteredPositions}
          isLoading={isLoading}
          onEdit={setEditingPosition}
          onDelete={setDeletingPosition}
          onLogDecision={setLoggingDecisionFor}
          onVerify={handleVerifyPosition}
          isVerifying={isVerifying}
          verifyingId={verifyingPositionId}
          selectedIds={selectedIds}
          onSelectionChange={setSelectedIds}
        />
      )}

      {/* Add Position Modal */}
      <PositionModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddPosition}
        isLoading={isAdding}
      />

      {/* Edit Position Modal */}
      <PositionModal
        open={!!editingPosition}
        onClose={() => setEditingPosition(null)}
        onSubmit={handleUpdatePosition}
        position={editingPosition}
        isLoading={isUpdating}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={!!deletingPosition}
        onClose={() => setDeletingPosition(null)}
        onConfirm={handleDeletePosition}
        ticker={deletingPosition?.ticker ?? ""}
        isLoading={isDeleting}
      />

      {/* Log Decision Modal */}
      <LogDecisionModal
        open={!!loggingDecisionFor}
        onClose={() => setLoggingDecisionFor(null)}
        position={loggingDecisionFor}
      />

      {/* Upload Screenshot Modal */}
      <UploadScreenshotModal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onImportComplete={handleUploadComplete}
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

      {/* Bulk Delete Confirmation Modal */}
      <DeleteConfirmModal
        open={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={handleBulkDelete}
        ticker={`${selectedIds.length} position${selectedIds.length !== 1 ? "s" : ""}`}
        isLoading={isBulkDeleting}
      />
    </div>
  );
}
