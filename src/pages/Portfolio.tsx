import { useState, useMemo } from "react";
import { Upload, Plus, Search, Briefcase, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePositions, type Position, type PositionFormData } from "@/hooks/usePositions";
import { AllocationSummary } from "@/components/portfolio/AllocationSummary";
import { PositionsTable } from "@/components/portfolio/PositionsTable";
import { PositionModal } from "@/components/portfolio/PositionModal";
import { DeleteConfirmModal } from "@/components/portfolio/DeleteConfirmModal";
import { LogDecisionModal } from "@/components/decisions/LogDecisionModal";
import { UploadScreenshotModal } from "@/components/portfolio/UploadScreenshotModal";
import { toast } from "sonner";

export default function Portfolio() {
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

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [deletingPosition, setDeletingPosition] = useState<Position | null>(null);
  const [loggingDecisionFor, setLoggingDecisionFor] = useState<Position | null>(null);

  // Calculate allocations
  const totalValue = positions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
  const stocksValue = positions
    .filter(p => p.position_type === "stock")
    .reduce((sum, p) => sum + (p.market_value ?? 0), 0);
  const etfsValue = positions
    .filter(p => p.position_type === "etf")
    .reduce((sum, p) => sum + (p.market_value ?? 0), 0);
  
  const stocksPercent = totalValue > 0 ? (stocksValue / totalValue) * 100 : 0;
  const etfsPercent = totalValue > 0 ? (etfsValue / totalValue) * 100 : 0;

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            {positions.length} positions • €{totalValue.toLocaleString("de-DE", { minimumFractionDigits: 0 })} total
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2">
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
        
        <div className="flex gap-2">
          {selectedIds.length > 0 && (
            <span className="text-sm text-muted-foreground self-center mr-2">
              {selectedIds.length} selected
            </span>
          )}
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
    </div>
  );
}
