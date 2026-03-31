import { useState, useMemo } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  BookOpen, Filter, Search, Plus, ChevronDown, ChevronUp,
  ShoppingCart, Trash2, Scissors, Minus, RefreshCw, CheckCircle,
  XCircle, Clock, AlertCircle, Star, Tag, TrendingUp, TrendingDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useDecisionJournal, type JournalEntry, type Assumption } from "@/hooks/useDecisionJournal";
import { LogDecisionModal } from "@/components/decisions/LogDecisionModal";
import { JournalAnalytics } from "@/components/journal/JournalAnalytics";
import { JournalDetail } from "@/components/journal/JournalDetail";

const actionIcons: Record<string, React.ReactNode> = {
  buy: <ShoppingCart className="w-3.5 h-3.5 text-emerald-500" />,
  sell: <Trash2 className="w-3.5 h-3.5 text-red-500" />,
  trim: <Scissors className="w-3.5 h-3.5 text-amber-500" />,
  add: <Plus className="w-3.5 h-3.5 text-blue-500" />,
  hold: <Minus className="w-3.5 h-3.5 text-muted-foreground" />,
  rebalance: <RefreshCw className="w-3.5 h-3.5 text-purple-500" />,
};

const actionColors: Record<string, string> = {
  buy: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  sell: "bg-red-500/10 text-red-500 border-red-500/20",
  trim: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  add: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  hold: "bg-muted text-muted-foreground border-border",
  rebalance: "bg-purple-500/10 text-purple-500 border-purple-500/20",
};

const outcomeConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle }> = {
  pending: { label: "Pending", color: "bg-muted text-muted-foreground", icon: Clock },
  reviewing: { label: "Reviewing", color: "bg-amber-500/10 text-amber-500", icon: AlertCircle },
  right: { label: "Right", color: "bg-emerald-500/10 text-emerald-500", icon: CheckCircle },
  wrong: { label: "Wrong", color: "bg-red-500/10 text-red-500", icon: XCircle },
  too_early: { label: "Too Early", color: "bg-blue-500/10 text-blue-500", icon: Clock },
  mixed: { label: "Mixed", color: "bg-purple-500/10 text-purple-500", icon: AlertCircle },
};

function priceReturn(entry: JournalEntry): { value: number; formatted: string } | null {
  if (!entry.entry_price || !entry.current_price) return null;
  const ret = ((entry.current_price - entry.entry_price) / entry.entry_price) * 100;
  const sign = ret >= 0 ? "+" : "";
  return { value: ret, formatted: `${sign}${ret.toFixed(1)}%` };
}

function EntryCard({
  entry,
  isSelected,
  onClick,
}: {
  entry: JournalEntry;
  isSelected: boolean;
  onClick: () => void;
}) {
  const ret = priceReturn(entry);
  const outcome = outcomeConfig[entry.outcome_status ?? "pending"];
  const OutcomeIcon = outcome.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-3 rounded-lg border transition-colors",
        isSelected
          ? "bg-primary/5 border-primary/30"
          : "bg-card border-border hover:bg-secondary/30"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {actionIcons[entry.action_type ?? "hold"]}
          <span className="font-mono font-bold text-sm truncate">
            {entry.position_ticker ?? entry.ticker ?? "Portfolio"}
          </span>
          <Badge variant="outline" className={cn("text-xs capitalize shrink-0", actionColors[entry.action_type ?? "hold"])}>
            {entry.action_type ?? "hold"}
          </Badge>
        </div>
        <Badge variant="outline" className={cn("text-xs shrink-0", outcome.color)}>
          <OutcomeIcon className="w-3 h-3 mr-1" />
          {outcome.label}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
        {entry.reasoning ?? "No reasoning recorded"}
      </p>

      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
        <span>{formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}</span>
        {entry.confidence_level && (
          <span>Confidence: {entry.confidence_level}/10</span>
        )}
        {ret && (
          <span className={ret.value >= 0 ? "text-emerald-500" : "text-destructive"}>
            {ret.formatted}
          </span>
        )}
        {(entry.lesson_ids?.length ?? 0) > 0 && (
          <span className="flex items-center gap-0.5">
            <Tag className="w-3 h-3" />
            {entry.lesson_ids!.length}
          </span>
        )}
      </div>
    </button>
  );
}

export default function Journal() {
  const [filters, setFilters] = useState({
    action_type: "all",
    outcome_status: "all",
    ticker: "",
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  const {
    entries,
    lessons,
    topLessons,
    isLoading,
    updateEntry,
    isUpdating,
    createLesson,
    useLesson,
    analytics,
  } = useDecisionJournal({
    action_type: filters.action_type,
    outcome_status: filters.outcome_status,
    ticker: filters.ticker || undefined,
  });

  const selectedEntry = useMemo(
    () => entries.find(e => e.id === selectedId) ?? null,
    [entries, selectedId]
  );

  // Auto-select first entry if nothing selected
  if (!selectedId && entries.length > 0 && !isLoading) {
    setSelectedId(entries[0].id);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Decision Journal</h1>
          <p className="text-sm text-muted-foreground">
            Track decisions, review outcomes, learn from patterns
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAnalytics(!showAnalytics)}
            className="gap-1.5"
          >
            <TrendingUp className="w-4 h-4" />
            {showAnalytics ? "Hide Analytics" : "Analytics"}
          </Button>
          <Button size="sm" onClick={() => setShowLogModal(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Log Decision
          </Button>
        </div>
      </div>

      {/* Analytics Panel */}
      {showAnalytics && (
        <JournalAnalytics analytics={analytics} topLessons={topLessons} />
      )}

      {/* Two-Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4" style={{ minHeight: "70vh" }}>
        {/* Left Panel: Entry List */}
        <div className="lg:col-span-2 space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-secondary/50 border border-border">
            <div className="relative flex-1 min-w-[120px]">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search ticker..."
                value={filters.ticker}
                onChange={e => setFilters({ ...filters, ticker: e.target.value })}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <Select
              value={filters.action_type}
              onValueChange={v => setFilters({ ...filters, action_type: v })}
            >
              <SelectTrigger className="w-28 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="buy">Buy</SelectItem>
                <SelectItem value="sell">Sell</SelectItem>
                <SelectItem value="trim">Trim</SelectItem>
                <SelectItem value="add">Add</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
                <SelectItem value="rebalance">Rebalance</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.outcome_status}
              onValueChange={v => setFilters({ ...filters, outcome_status: v })}
            >
              <SelectTrigger className="w-28 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="reviewing">Reviewing</SelectItem>
                <SelectItem value="right">Right</SelectItem>
                <SelectItem value="wrong">Wrong</SelectItem>
                <SelectItem value="too_early">Too Early</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entry List */}
          <ScrollArea className="h-[calc(70vh-60px)]">
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-12">
                <BookOpen className="w-10 h-10 text-primary/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No decisions logged yet</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => setShowLogModal(true)}>
                  Log Your First Decision
                </Button>
              </div>
            ) : (
              <div className="space-y-2 pr-2">
                {entries.map(entry => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    isSelected={entry.id === selectedId}
                    onClick={() => setSelectedId(entry.id)}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Right Panel: Detail */}
        <div className="lg:col-span-3">
          {selectedEntry ? (
            <JournalDetail
              entry={selectedEntry}
              lessons={lessons}
              onUpdate={updateEntry}
              isUpdating={isUpdating}
              onCreateLesson={createLesson}
              onUseLesson={useLesson}
            />
          ) : (
            <Card className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select a decision to view details</p>
              </div>
            </Card>
          )}
        </div>
      </div>

      <LogDecisionModal open={showLogModal} onClose={() => setShowLogModal(false)} />
    </div>
  );
}
