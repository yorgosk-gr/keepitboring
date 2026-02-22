import { useState, useCallback } from "react";
import { Plus, RefreshCw, Loader2, Eye, AlertTriangle, Clock, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/common/EmptyState";
import { useWatchlist, type WatchlistItem, type WatchlistFormData } from "@/hooks/useWatchlist";
import { usePriceRefresh, type TickerInfo } from "@/hooks/usePriceRefresh";
import { useDashboardData } from "@/hooks/useDashboardData";
import { WatchlistModal } from "@/components/watchlist/WatchlistModal";
import { WatchlistTable } from "@/components/watchlist/WatchlistTable";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

export default function Watchlist() {
  const { items, isLoading, addItem, isAdding, updateItem, deleteItem, updatePrices, stats } = useWatchlist();
  const { fetchPrices, isFetching, progress } = usePriceRefresh();
  const { totalValue: portfolioValue } = useDashboardData();
  const navigate = useNavigate();

  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<WatchlistItem | null>(null);

  const handleSubmit = async (data: WatchlistFormData) => {
    if (editItem) {
      await updateItem({ id: editItem.id, updates: data });
      toast.success("Watchlist item updated");
    } else {
      await addItem(data);
    }
    setEditItem(null);
  };

  const handleEdit = (item: WatchlistItem) => {
    setEditItem(item);
    setShowModal(true);
  };

  const handleRefreshPrices = useCallback(async () => {
    if (items.length === 0) return;
    const tickerInfos: TickerInfo[] = items.map((i) => ({
      ticker: i.ticker,
      currency: i.currency || undefined,
    }));
    // Deduplicate
    const unique = tickerInfos.filter(
      (t, idx, arr) => arr.findIndex((x) => x.ticker === t.ticker) === idx
    );
    const { prices } = await fetchPrices(unique);
    if (prices.length > 0) {
      await updatePrices(prices.map((p) => ({ ticker: p.ticker, price: p.current_price })));
      toast.success(`Updated ${prices.length} prices`);
    }
  }, [items, fetchPrices, updatePrices]);

  const handleImport = (item: WatchlistItem) => {
    // Navigate to portfolio with pre-filled data via query params
    const params = new URLSearchParams({
      add: "1",
      ticker: item.ticker,
      name: item.name || "",
      type: item.position_type || "stock",
      category: item.category || "Equities",
      thesis: item.thesis || "",
    });
    navigate(`/portfolio?${params.toString()}`);
  };

  const lastRefresh = items
    .filter((i) => i.last_price_refresh)
    .sort((a, b) => new Date(b.last_price_refresh!).getTime() - new Date(a.last_price_refresh!).getTime())[0]
    ?.last_price_refresh;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <div className="flex gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 flex-1" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Watchlist</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Positions you want — at the right price
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleRefreshPrices}
            disabled={isFetching || items.length === 0}
          >
            {isFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {isFetching ? `${progress.current}/${progress.total}` : "Refresh Prices"}
          </Button>
          <Button className="gap-2" onClick={() => { setEditItem(null); setShowModal(true); }}>
            <Plus className="w-4 h-4" />
            Add to Watchlist
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Eye} label="Total Watching" value={stats.total} />
        <StatCard icon={Target} label="Triggered" value={stats.triggered} variant="success" />
        <StatCard icon={AlertTriangle} label="Approaching" value={stats.approaching} variant="warning" />
        <StatCard icon={Clock} label="Waiting" value={stats.waiting} />
      </div>

      {/* Last refresh */}
      {lastRefresh && (
        <p className="text-xs text-muted-foreground">
          Prices last updated {formatDistanceToNow(new Date(lastRefresh), { addSuffix: true })}
        </p>
      )}

      {/* Table or Empty State */}
      {items.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No positions on your watchlist yet"
          description="Add stocks or ETFs you want to buy — at the right price. Track Livermore's pivotal points and Graham's margin of safety targets."
          action={{
            label: "Add to Watchlist",
            onClick: () => { setEditItem(null); setShowModal(true); },
            icon: Plus,
          }}
        >
          <div className="mt-6 max-w-md text-left p-4 rounded-lg bg-primary/5 border border-primary/10">
            <p className="text-sm font-medium text-foreground mb-2">💡 Livermore's Pivotal Points</p>
            <p className="text-xs text-muted-foreground">
              Jesse Livermore identified "pivotal points" — specific price levels where a stock becomes a buy.
              Rather than chasing prices up, set your target price at the level where your thesis offers
              a margin of safety. Then wait. The price will come to you, or it won't — and that's fine too.
            </p>
          </div>
        </EmptyState>
      ) : (
        <WatchlistTable
          items={items}
          onEdit={handleEdit}
          onDelete={(id) => deleteItem(id)}
          onImport={handleImport}
        />
      )}

      {/* Modal */}
      <WatchlistModal
        open={showModal}
        onClose={() => { setShowModal(false); setEditItem(null); }}
        onSubmit={handleSubmit}
        isLoading={isAdding}
        editItem={editItem}
        portfolioValue={portfolioValue}
      />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  variant,
}: {
  icon: any;
  label: string;
  value: number;
  variant?: "success" | "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon
          className={`w-4 h-4 ${
            variant === "success"
              ? "text-emerald-500"
              : variant === "warning"
              ? "text-amber-500"
              : "text-muted-foreground"
          }`}
        />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p
        className={`text-2xl font-bold ${
          variant === "success"
            ? "text-emerald-500"
            : variant === "warning"
            ? "text-amber-500"
            : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
