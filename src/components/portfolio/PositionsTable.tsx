import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2, FileText, Search, Loader2, Feather, AlertTriangle } from "lucide-react";
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

type SortField = "ticker" | "name" | "position_type" | "category" | "exchange" | "currency" | "shares" | "avg_cost" | "current_price" | "market_value" | "gain_loss" | "weight_percent";
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
  hideDeleteActions?: boolean;
  cashBalance?: number;
  totalValue?: number;
  onOpenThesis?: (position: Position) => void;
}

function calculatePnL(position: Position) {
  // Use unrealized_pnl directly from IB if available
  const unrealizedPnl = (position as any).unrealized_pnl;
  const costBasisMoney = (position as any).cost_basis_money;

  if (unrealizedPnl != null && unrealizedPnl !== 0) {
    const percent = costBasisMoney && costBasisMoney !== 0
      ? (unrealizedPnl / Math.abs(costBasisMoney)) * 100
      : 0;
    return { value: Number(unrealizedPnl), percent };
  }

  // Fallback calculation
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

// Shorten exchange names to standard codes
function shortenExchange(exchange: string | null): string {
  if (!exchange) return "—";
  const map: Record<string, string> = {
    "London Stock Exchange": "LSE",
    "New York Stock Exchange": "NYSE",
    "Euronext Amsterdam": "AMS",
    "Euronext Paris": "EPA",
    "Australian Securities Exchange": "ASX",
    "Tokyo Stock Exchange": "TSE",
    "XETRA": "XETRA",
    "Hong Kong Stock Exchange": "HKEX",
    "Toronto Stock Exchange": "TSX",
  };
  return map[exchange] || exchange;
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
  hideDeleteActions,
  cashBalance,
  totalValue,
  onOpenThesis,
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
        case "name":
          return sortDirection === "asc"
            ? (a.name || "").localeCompare(b.name || "")
            : (b.name || "").localeCompare(a.name || "");
        case "position_type":
          return sortDirection === "asc"
            ? (a.position_type || "").localeCompare(b.position_type || "")
            : (b.position_type || "").localeCompare(a.position_type || "");
        case "category":
          return sortDirection === "asc"
            ? mapCategory(a.category).localeCompare(mapCategory(b.category))
            : mapCategory(b.category).localeCompare(mapCategory(a.category));
        case "exchange":
          return sortDirection === "asc"
            ? (a.exchange || "").localeCompare(b.exchange || "")
            : (b.exchange || "").localeCompare(a.exchange || "");
        case "currency":
          return sortDirection === "asc"
            ? ((a as any).currency || "USD").localeCompare((b as any).currency || "USD")
            : ((b as any).currency || "USD").localeCompare((a as any).currency || "USD");
        case "shares":
          aVal = a.shares ?? 0;
          bVal = b.shares ?? 0;
          break;
        case "avg_cost":
          aVal = a.avg_cost ?? 0;
          bVal = b.avg_cost ?? 0;
          break;
        case "current_price":
          aVal = a.current_price ?? 0;
          bVal = b.current_price ?? 0;
          break;
        case "market_value":
          aVal = a.market_value ?? 0;
          bVal = b.market_value ?? 0;
          break;
        case "gain_loss":
          aVal = calculatePnL(a).value;
          bVal = calculatePnL(b).value;
          break;
        case "weight_percent":
          aVal = a.weight_percent ?? 0;
          bVal = b.weight_percent ?? 0;
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
              {!hideDeleteActions && (
                <th className="pb-3 pr-2 w-8">
                  <Checkbox
                    checked={selectedIds.length === positions.length && positions.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </th>
              )}
              <SortHeader field="ticker">Ticker</SortHeader>
              <SortHeader field="name">Name</SortHeader>
              <SortHeader field="position_type">Type</SortHeader>
              <SortHeader field="category">Category</SortHeader>
              <SortHeader field="exchange">Exchange</SortHeader>
              <SortHeader field="currency">Ccy</SortHeader>
              <SortHeader field="shares">Shares</SortHeader>
              <SortHeader field="avg_cost">Avg Cost</SortHeader>
              <SortHeader field="current_price">Price</SortHeader>
              <SortHeader field="market_value">
                <span className="text-foreground">Value ($)</span>
              </SortHeader>
              <SortHeader field="gain_loss">Gain/Loss ($)</SortHeader>
              <SortHeader field="weight_percent">Weight</SortHeader>
              <th className="text-right pb-3 font-medium w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sortedPositions.map((position) => {
              const isExpanded = expandedId === position.id;
              const isSelected = selectedIds.includes(position.id);
              // Use stored currency, default to USD
              const currency = (position as any).currency || "USD";
              
              return (
                <>
                  <tr
                    key={position.id}
                    className={`group hover:bg-secondary/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                  >
                    {!hideDeleteActions && (
                      <td className="py-3 pr-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(position.id)}
                        />
                      </td>
                    )}
                    <td className="py-3">
                      <div className="flex items-center gap-1.5">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                className="cursor-pointer hover:scale-110 transition-transform"
                                onClick={() => onOpenThesis?.(position)}
                              >
                                {(() => {
                                  const hasThesis = !!position.thesis_notes;
                                  const hasInvalidation = !!position.invalidation_trigger;
                                  if (hasThesis && hasInvalidation) {
                                    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />;
                                  } else if (hasThesis || hasInvalidation) {
                                    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500" />;
                                  } else {
                                    return <span className="inline-block w-2.5 h-2.5 rounded-full bg-destructive" />;
                                  }
                                })()}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {position.thesis_notes && position.invalidation_trigger
                                ? "View thesis"
                                : "Add thesis"}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
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
                      </div>
                    </td>
                    <td className="py-3 text-muted-foreground max-w-[120px] truncate text-xs">
                      {position.name || "—"}
                    </td>
                    <td className="py-3">{getTypeBadge(position.position_type)}</td>
                    <td className="py-3 text-muted-foreground text-xs">{mapCategory(position.category)}</td>
                    <td className="py-3 text-muted-foreground text-xs font-mono">
                      {shortenExchange(position.exchange)}
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
                    <td className="py-3 text-right font-mono text-xs">
                      {(() => {
                        const pnl = calculatePnL(position);
                        if (pnl.value === 0) return "—";
                        const color = pnl.value > 0 ? "text-emerald-500" : "text-destructive";
                        const sign = pnl.value > 0 ? "+" : "";
                        return (
                          <span className={color}>
                            {sign}{formatWholeNumber(pnl.value)}
                            {pnl.percent !== 0 && (
                              <span className="text-[10px] ml-1 opacity-70">
                                ({sign}{pnl.percent.toFixed(1)}%)
                              </span>
                            )}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-3 text-right font-mono text-xs">
                      {(position.weight_percent ?? 0).toFixed(1)}%
                    </td>
                    <td className="py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
                                >
                                  {isVerifying && verifyingId === position.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Search className="w-3.5 h-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Verify ticker &amp; update price</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onLogDecision(position)}>
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(position)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        {!hideDeleteActions && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/20 hover:text-destructive" onClick={() => onDelete(position)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
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
            {/* Cash row */}
            {cashBalance != null && cashBalance > 0 && (
              <tr className="border-t-2 border-border bg-secondary/10">
                {!hideDeleteActions && <td className="py-3 pr-2" />}
                <td className="py-3 font-bold text-foreground text-base">Cash</td>
                <td className="py-3 text-muted-foreground text-xs">USD Cash Balance</td>
                <td className="py-3">
                  <span className="px-2 py-0.5 text-xs font-medium bg-muted/50 text-muted-foreground rounded-full">
                    Cash
                  </span>
                </td>
                <td className="py-3 text-muted-foreground text-xs">Cash</td>
                <td className="py-3 text-muted-foreground text-xs font-mono">—</td>
                <td className="py-3 text-center text-muted-foreground text-xs font-mono">USD</td>
                <td className="py-3 text-right font-mono text-xs">—</td>
                <td className="py-3 text-right font-mono text-xs">—</td>
                <td className="py-3 text-right font-mono text-xs">—</td>
                <td className="py-3 text-right font-mono font-semibold text-base text-foreground">
                  {formatWholeNumber(cashBalance)}
                </td>
                <td className="py-3 text-right font-mono text-xs">—</td>
                <td className="py-3 text-right font-mono text-xs">
                  {totalValue && totalValue > 0 ? ((cashBalance / totalValue) * 100).toFixed(1) : "0.0"}%
                </td>
                <td className="py-3" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
