import { useState } from "react";
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { Position } from "@/hooks/usePositions";
import type { PriceUpdate } from "@/hooks/usePriceRefresh";

interface PriceUpdatePreview {
  position: Position;
  newPrice: number;
  oldPrice: number;
  changePercent: number;
  currency: string;
  source: string;
  selected: boolean;
}

interface RefreshPricesModalProps {
  open: boolean;
  onClose: () => void;
  positions: Position[];
  prices: PriceUpdate[];
  notFound: string[];
  isFetching: boolean;
  progress: { current: number; total: number };
  onApply: (updates: { id: string; current_price: number }[]) => Promise<void>;
}

export function RefreshPricesModal({
  open,
  onClose,
  positions,
  prices,
  notFound,
  isFetching,
  progress,
  onApply,
}: RefreshPricesModalProps) {
  const [isApplying, setIsApplying] = useState(false);

  // Match prices to positions
  const [updates, setUpdates] = useState<PriceUpdatePreview[]>(() => {
    return prices.map(price => {
      const position = positions.find(p => 
        p.ticker.toUpperCase() === price.ticker.toUpperCase()
      );
      
      if (!position) return null;

      const oldPrice = position.current_price ?? 0;
      const changePercent = oldPrice > 0 
        ? ((price.current_price - oldPrice) / oldPrice) * 100 
        : 0;

      return {
        position,
        newPrice: price.current_price,
        oldPrice,
        changePercent,
        currency: price.currency,
        source: price.source,
        selected: true,
      };
    }).filter(Boolean) as PriceUpdatePreview[];
  });

  // Update the updates when prices change
  useState(() => {
    const newUpdates = prices.map(price => {
      const position = positions.find(p => 
        p.ticker.toUpperCase() === price.ticker.toUpperCase()
      );
      
      if (!position) return null;

      const oldPrice = position.current_price ?? 0;
      const changePercent = oldPrice > 0 
        ? ((price.current_price - oldPrice) / oldPrice) * 100 
        : 0;

      return {
        position,
        newPrice: price.current_price,
        oldPrice,
        changePercent,
        currency: price.currency,
        source: price.source,
        selected: true,
      };
    }).filter(Boolean) as PriceUpdatePreview[];

    setUpdates(newUpdates);
  });

  const toggleUpdate = (ticker: string) => {
    setUpdates(prev => prev.map(u => 
      u.position.ticker === ticker ? { ...u, selected: !u.selected } : u
    ));
  };

  const selectAll = () => {
    setUpdates(prev => prev.map(u => ({ ...u, selected: true })));
  };

  const deselectAll = () => {
    setUpdates(prev => prev.map(u => ({ ...u, selected: false })));
  };

  const selectedCount = updates.filter(u => u.selected).length;
  const significantChanges = updates.filter(u => Math.abs(u.changePercent) > 5);

  const handleApply = async () => {
    const toApply = updates
      .filter(u => u.selected)
      .map(u => ({
        id: u.position.id,
        current_price: u.newPrice,
      }));

    if (toApply.length === 0) {
      onClose();
      return;
    }

    setIsApplying(true);
    try {
      await onApply(toApply);
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => !isFetching && !isApplying && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Refresh Prices</DialogTitle>
          <DialogDescription>
            {isFetching 
              ? "Fetching current prices from the web..."
              : `Update ${selectedCount} position${selectedCount !== 1 ? "s" : ""} with new prices`
            }
          </DialogDescription>
        </DialogHeader>

        {isFetching ? (
          <div className="py-8 space-y-4">
            <div className="flex items-center justify-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <span className="text-muted-foreground">
                Looking up prices {progress.current} of {progress.total}...
              </span>
            </div>
            <Progress value={(progress.current / progress.total) * 100} className="h-2" />
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">
                  {updates.length} prices found
                </span>
                {notFound.length > 0 && (
                  <Badge variant="outline" className="text-amber-500 border-amber-500/50">
                    {notFound.length} not found
                  </Badge>
                )}
                {significantChanges.length > 0 && (
                  <Badge variant="outline" className="text-amber-500 border-amber-500/50 gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {significantChanges.length} significant change{significantChanges.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={selectAll} className="h-7 px-2">
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={deselectAll} className="h-7 px-2">
                  Deselect All
                </Button>
              </div>
            </div>

            {/* Not found warning */}
            {notFound.length > 0 && (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-sm">
                <span className="text-amber-500">
                  Could not find prices for: {notFound.join(", ")}
                </span>
              </div>
            )}

            {/* Price updates table */}
            <ScrollArea className="flex-1 max-h-[350px] rounded-lg border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Ticker</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Old Price</TableHead>
                    <TableHead className="text-right">New Price</TableHead>
                    <TableHead className="text-right">Change</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {updates.map((update) => {
                    const isSignificant = Math.abs(update.changePercent) > 5;
                    const isPositive = update.changePercent > 0;
                    
                    return (
                      <TableRow
                        key={update.position.id}
                        className={cn(
                          "border-border",
                          !update.selected && "opacity-50",
                          isSignificant && "bg-amber-500/5"
                        )}
                      >
                        <TableCell>
                          <Checkbox
                            checked={update.selected}
                            onCheckedChange={() => toggleUpdate(update.position.ticker)}
                          />
                        </TableCell>
                        <TableCell className="font-mono font-semibold">
                          {update.position.ticker}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm max-w-[150px] truncate">
                          {update.position.name || "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">
                          €{update.oldPrice.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          €{update.newPrice.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className={cn(
                            "flex items-center justify-end gap-1 font-mono text-sm",
                            isPositive ? "text-emerald-500" : "text-destructive"
                          )}>
                            {isPositive ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            {isPositive ? "+" : ""}{update.changePercent.toFixed(2)}%
                          </div>
                        </TableCell>
                        <TableCell>
                          {isSignificant && (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          </>
        )}

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={onClose}
            disabled={isFetching || isApplying}
          >
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={isFetching || isApplying || selectedCount === 0}
            className="gap-2"
          >
            {isApplying && <Loader2 className="w-4 h-4 animate-spin" />}
            Apply {selectedCount} Update{selectedCount !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
