import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2, FileText, Search, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Position } from "@/hooks/usePositions";
import { ETFInfoTooltip } from "./ETFInfoTooltip";
import { useETFMetadata } from "@/hooks/useETFMetadata";

type SortField = "ticker" | "market_value" | "weight_percent" | "pnl_percent";
type SortDirection = "asc" | "desc";

interface PositionsTableProps {
  positions: Position[];
  isLoading?: boolean;
  onEdit: (position: Position) => void;
  onDelete: (position: Position) => void;
  onLogDecision: (position: Position) => void;
  onVerify?: (position: Position) => void;
  isVerifying?: boolean;
  verifyingId?: string | null;
  selectedIds: string[];
  onSelectionChange: (ids: string[]) => void;
}

function calculatePnL(position: Position) {
  const avgCost = position.avg_cost ?? 0;
  const currentPrice = position.current_price ?? 0;
  const shares = position.shares ?? 0;
  
  if (avgCost === 0 || shares === 0) {
    return { value: 0, percent: 0 };
  }
  
  const costBasis = avgCost * shares;
  const currentValue = currentPrice * shares;
  const pnlValue = currentValue - costBasis;
  const pnlPercent = ((currentPrice - avgCost) / avgCost) * 100;
  
  return { value: pnlValue, percent: pnlPercent };
}

// Map old categories to new simplified categories
function mapCategory(category: string | null): string {
  if (!category) return "Equities";
  const lower = category.toLowerCase();
  if (lower === "bond" || lower === "bonds") return "Bonds";
  if (lower === "commodity" || lower === "commodities") return "Commodities";
  if (lower === "crypto" || lower === "cryptocurrency") return "Crypto";
  // equity, stock, country, theme, gold -> Equities
  return "Equities";
}

function getTypeBadge(type: string | null) {
  if (type === "stock") {
    return (
      <span className="px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">
        Stock
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 text-xs font-medium bg-chart-3/20 text-chart-3 rounded-full">
      ETF
    </span>
  );
}

function getTierBadge(tier: string | null) {
  switch (tier) {
    case "core":
      return (
        <span className="px-2 py-0.5 text-xs font-medium bg-primary/20 text-primary rounded-full">
          Core
        </span>
      );
    case "satellite":
      return (
        <span className="px-2 py-0.5 text-xs font-medium bg-chart-4/20 text-chart-4 rounded-full">
          Satellite
        </span>
      );
    case "explore":
      return (
        <span className="px-2 py-0.5 text-xs font-medium bg-warning/20 text-warning rounded-full">
          Explore
        </span>
      );
    default:
      return null;
  }
}

// Format numbers with US locale (commas as thousands separator)
function formatNumber(value: number | null, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US", { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
}

function formatWholeNumber(value: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("en-US", { 
    minimumFractionDigits: 0, 
    maximumFractionDigits: 0 
  });
}

export function PositionsTable({
  positions,
  isLoading,
  onEdit,
  onDelete,
  onLogDecision,
  onVerify,
  isVerifying,
  verifyingId,
  selectedIds,
  onSelectionChange,
}: PositionsTableProps) {
  const [sortField, setSortField] = useState<SortField>("market_value");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Get ETF tickers for metadata lookup
  const etfTickers = useMemo(() => 
    positions.filter(p => p.position_type === "etf").map(p => p.ticker),
    [positions]
  );
  const { data: etfMetadata = {} } = useETFMetadata(etfTickers);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const sortedPositions = useMemo(() => {
    return [...positions].sort((a, b) => {
      let aVal: number, bVal: number;
      
      switch (sortField) {
        case "ticker":
          return sortDirection === "asc" 
            ? a.ticker.localeCompare(b.ticker)
            : b.ticker.localeCompare(a.ticker);
        case "market_value":
          aVal = a.market_value ?? 0;
          bVal = b.market_value ?? 0;
          break;
        case "weight_percent":
          aVal = a.weight_percent ?? 0;
          bVal = b.weight_percent ?? 0;
          break;
        case "pnl_percent":
          aVal = calculatePnL(a).percent;
          bVal = calculatePnL(b).percent;
          break;
        default:
          return 0;
      }
      
      return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
    });
  }, [positions, sortField, sortDirection]);

  const toggleSelectAll = () => {
    if (selectedIds.length === positions.length) {
      onSelectionChange([]);
    } else {
      onSelectionChange(positions.map(p => p.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter(i => i !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th
      className="text-left pb-3 font-medium cursor-pointer hover:text-foreground transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          sortDirection === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
        )}
      </div>
    </th>
  );

  if (isLoading) {
    return (
      <div className="stat-card overflow-hidden">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (positions.length === 0) {
    return null; // Let parent handle empty state
  }

  return (
    <div className="stat-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground uppercase tracking-wide border-b border-border">
            <tr>
              <th className="pb-3 pr-2 w-8">
                <Checkbox
                  checked={selectedIds.length === positions.length && positions.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <SortHeader field="ticker">Ticker</SortHeader>
              <th className="text-left pb-3 font-medium w-32">Name</th>
              <th className="text-left pb-3 font-medium w-16">Type</th>
              <th className="text-left pb-3 font-medium w-20">Category</th>
              <th className="text-left pb-3 font-medium w-16">Exchange</th>
              <th className="text-center pb-3 font-medium w-12">Ccy</th>
              <th className="text-right pb-3 font-medium w-16">Shares</th>
              <th className="text-right pb-3 font-medium w-20">Avg Cost</th>
              <th className="text-right pb-3 font-medium w-20">Price</th>
              <SortHeader field="market_value">
                <span className="text-foreground">Value ($)</span>
              </SortHeader>
              <SortHeader field="weight_percent">Weight</SortHeader>
              <SortHeader field="pnl_percent">P&L</SortHeader>
              <th className="text-left pb-3 font-medium w-20">Tier</th>
              <th className="text-right pb-3 font-medium w-24">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedPositions.map((position) => {
              const pnl = calculatePnL(position);
              const isExpanded = expandedId === position.id;
              const isSelected = selectedIds.includes(position.id);
              // Use stored currency, default to USD
              const currency = (position as any).currency || "USD";
              
              return (
                <>
                  <tr
                    key={position.id}
                    className={`hover:bg-secondary/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                  >
                    <td className="py-3 pr-2">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSelect(position.id)}
                      />
                    </td>
                    <td className="py-3">
                      <button
                        className="font-bold text-foreground hover:text-primary transition-colors flex items-center gap-1 text-base"
                        onClick={() => setExpandedId(isExpanded ? null : position.id)}
                      >
                        {position.ticker}
                        {position.position_type === "etf" && (
                          <ETFInfoTooltip metadata={etfMetadata[position.ticker] || null} />
                        )}
                        {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </td>
                    <td className="py-3 text-muted-foreground max-w-[120px] truncate text-xs">
                      {position.name || "—"}
                    </td>
                    <td className="py-3">{getTypeBadge(position.position_type)}</td>
                    <td className="py-3 text-muted-foreground text-xs">{mapCategory(position.category)}</td>
                    <td className="py-3 text-muted-foreground text-xs font-mono">
                      {position.exchange || "—"}
                    </td>
                    <td className="py-3 text-center text-muted-foreground text-xs font-mono">
                      {currency}
                    </td>
                    <td className="py-3 text-right font-mono text-xs">
                      {formatNumber(position.shares, 0)}
                    </td>
                    <td className="py-3 text-right font-mono text-xs">
                      {formatNumber(position.avg_cost)}
                    </td>
                    <td className="py-3 text-right font-mono text-xs">
                      {formatNumber(position.current_price)}
                    </td>
                    <td className="py-3 text-right font-mono font-semibold text-base text-foreground">
                      {formatWholeNumber(position.market_value)}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <Progress value={position.weight_percent ?? 0} className="w-12 h-1.5" />
                        <span className="text-right font-mono text-xs">
                          {(position.weight_percent ?? 0).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex flex-col items-end">
                        <span className={`font-mono font-medium ${pnl.value === 0 ? "text-muted-foreground" : pnl.value > 0 ? "text-primary" : "text-destructive"}`}>
                          {pnl.value >= 0 ? "+" : ""}{formatWholeNumber(pnl.value)}
                        </span>
                        <span className={`text-xs ${pnl.percent === 0 ? "text-muted-foreground" : pnl.percent > 0 ? "text-primary" : "text-destructive"}`}>
                          {pnl.percent >= 0 ? "+" : ""}{pnl.percent.toFixed(2)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3">
                      {position.bet_type ? getTierBadge(position.bet_type) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1">
                        {onVerify && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => onVerify(position)}
                                  disabled={isVerifying}
                                  title="Verify with web search"
                                >
                                  {isVerifying && verifyingId === position.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Search className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Verify ticker &amp; update price
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onLogDecision(position)}
                          title="Log decision"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => onEdit(position)}
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-destructive/20 hover:text-destructive"
                          onClick={() => onDelete(position)}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && position.thesis_notes && (
                    <tr key={`${position.id}-expanded`} className="bg-secondary/20">
                      <td colSpan={14} className="py-4 px-6">
                        <div className="text-sm">
                          <h4 className="font-medium text-foreground mb-2">Thesis Notes</h4>
                          <p className="text-muted-foreground whitespace-pre-wrap">
                            {position.thesis_notes}
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
