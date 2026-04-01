import { useState, useMemo, useEffect } from "react";
import { Search, Briefcase, Trash2, Download, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePositions, type Position, type PositionFormData } from "@/hooks/usePositions";
import { useDashboardData } from "@/hooks/useDashboardData";

import { PositionsTable } from "@/components/portfolio/PositionsTable";
import { PositionModal } from "@/components/portfolio/PositionModal";
import { LogDecisionModal } from "@/components/decisions/LogDecisionModal";
import { DeleteConfirmModal } from "@/components/portfolio/DeleteConfirmModal";
import { ThesisPanel } from "@/components/portfolio/ThesisPanel";
import { PortfolioValue } from "@/components/dashboard/PortfolioValue";

import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useIBSync } from "@/hooks/useIBSync";
import { toast } from "sonner";
import { formatDistanceToNow, format, isWeekend, isSameDay, startOfDay } from "date-fns";

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

  const { cashBalance, totalValue } = useDashboardData();
  const { sync, isSyncing, isConnected, lastSynced } = useIBSync();

  // Fetch latest data date (most recent of: last sync, last snapshot)
  const { data: latestDataDate } = useQuery({
    queryKey: ["latest-data-date", user?.id],
    queryFn: async () => {
      const dates: Date[] = [];

      const { data: snapshot } = await supabase
        .from("portfolio_snapshots")
        .select("created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (snapshot?.created_at) dates.push(new Date(snapshot.created_at));

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

  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState("");

  // Modal states
  const [editingPosition, setEditingPosition] = useState<Position | null>(null);
  const [loggingDecisionFor, setLoggingDecisionFor] = useState<Position | null>(null);
  const [thesisPosition, setThesisPosition] = useState<Position | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showMissingThesisOnly, setShowMissingThesisOnly] = useState(false);

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

  // Handle clearing all positions (IB source + annotations) and reset cash
  const handleClearAllPositions = async () => {
    if (!user) return;
    setIsClearing(true);
    try {
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

  return (
    <div className="space-y-6">
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
                  <p className="text-xs text-muted-foreground">Pull latest positions, prices, trades & cash from your IB Flex Query.</p>
                </TooltipContent>
              </Tooltip>
            )}

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
          onDelete={() => {}}
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
