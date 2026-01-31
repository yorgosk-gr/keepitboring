import { useState } from "react";
import { Loader2, Trash2, AlertCircle, CheckCircle2, AlertTriangle, Info, Pencil, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export interface ExtractedPosition {
  ticker: string;
  name: string | null;
  isin?: string | null;
  shares: number | null;
  avg_price: number | null;
  current_price: number | null;
  market_value: number | null;
  pnl: number | null;
  pnl_percent?: number | null;
  currency?: string | null;
  source_page?: number;
  needs_verification?: boolean;
}

interface EditablePosition extends ExtractedPosition {
  id: string;
  position_type: "stock" | "etf";
  category: "equity" | "bond" | "commodity" | "gold" | "country" | "theme";
  selected: boolean;
  verified: boolean;
  originalTicker?: string;
}

export interface ExtractionMetadata {
  detected_broker?: string;
  detected_currency?: string;
  extraction_quality?: "good" | "partial" | "poor";
  extraction_notes?: string;
}

interface ScreenshotPreviewTableProps {
  positions: ExtractedPosition[];
  cashBalances?: Record<string, number>;
  totalValue?: number | null;
  metadata?: ExtractionMetadata;
  onCancel: () => void;
  onImportComplete: () => void;
}

export function ScreenshotPreviewTable({
  positions,
  cashBalances,
  totalValue,
  metadata,
  onCancel,
  onImportComplete,
}: ScreenshotPreviewTableProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);

  const hasSourcePages = positions.some(p => p.source_page !== undefined && p.source_page > 1);
  const hasVerificationNeeded = positions.some(p => p.needs_verification);

  const [editablePositions, setEditablePositions] = useState<EditablePosition[]>(
    positions.map((p, i) => ({
      ...p,
      id: `temp-${i}`,
      position_type: "stock" as const,
      category: "equity" as const,
      selected: true,
      verified: !p.needs_verification,
      originalTicker: p.needs_verification ? p.ticker : undefined,
    }))
  );

  const updatePosition = (id: string, field: keyof EditablePosition, value: unknown) => {
    setEditablePositions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const verifyPosition = (id: string) => {
    setEditablePositions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, verified: true, needs_verification: false } : p))
    );
  };

  const removePosition = (id: string) => {
    setEditablePositions((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleAll = (selected: boolean) => {
    setEditablePositions((prev) => prev.map((p) => ({ ...p, selected })));
  };

  const selectedCount = editablePositions.filter((p) => p.selected).length;
  const unverifiedCount = editablePositions.filter((p) => p.selected && p.needs_verification && !p.verified).length;

  // Check if import is allowed
  const canImport = selectedCount > 0 && hasReviewed && unverifiedCount === 0;

  const handleImport = async () => {
    if (!user) {
      toast.error("Please log in to import positions");
      return;
    }

    const toImport = editablePositions.filter((p) => p.selected);
    if (toImport.length === 0) {
      toast.error("Please select at least one position to import");
      return;
    }

    if (unverifiedCount > 0) {
      toast.error("Please verify all positions marked for review");
      return;
    }

    setIsImporting(true);

    try {
      const totalMV = toImport.reduce((sum, p) => sum + (p.market_value ?? 0), 0);

      const positionsToUpsert = toImport.map((p) => ({
        user_id: user.id,
        ticker: p.ticker.toUpperCase(),
        name: p.name || null,
        position_type: p.position_type,
        category: p.category,
        shares: p.shares,
        avg_cost: p.avg_price,
        current_price: p.current_price,
        market_value: p.market_value,
        weight_percent: totalMV > 0 ? ((p.market_value ?? 0) / totalMV) * 100 : 0,
        bet_type: "passive_carry",
        confidence_level: 5,
      }));

      for (const pos of positionsToUpsert) {
        const { data: existing } = await supabase
          .from("positions")
          .select("id")
          .eq("user_id", user.id)
          .eq("ticker", pos.ticker)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("positions")
            .update({
              name: pos.name,
              position_type: pos.position_type,
              category: pos.category,
              shares: pos.shares,
              avg_cost: pos.avg_cost,
              current_price: pos.current_price,
              market_value: pos.market_value,
              weight_percent: pos.weight_percent,
            })
            .eq("id", existing.id);

          if (error) throw error;
        } else {
          const { error } = await supabase.from("positions").insert(pos);
          if (error) throw error;
        }
      }

      const stocksValue = toImport
        .filter((p) => p.position_type === "stock")
        .reduce((sum, p) => sum + (p.market_value ?? 0), 0);
      const etfsValue = toImport
        .filter((p) => p.position_type === "etf")
        .reduce((sum, p) => sum + (p.market_value ?? 0), 0);

      await supabase.from("portfolio_snapshots").insert({
        user_id: user.id,
        total_value: totalValue ?? totalMV,
        stocks_percent: totalMV > 0 ? (stocksValue / totalMV) * 100 : 0,
        etfs_percent: totalMV > 0 ? (etfsValue / totalMV) * 100 : 0,
        cash_balance: cashBalances
          ? Object.values(cashBalances).reduce((a, b) => a + b, 0)
          : null,
        data_json: {
          positions: toImport.length,
          cash_balances: cashBalances,
          imported_at: new Date().toISOString(),
          detected_broker: metadata?.detected_broker,
        },
      });

      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });

      onImportComplete();
      navigate("/portfolio");
    } catch (error) {
      toast.error("Failed to import positions. Please try again.");
    } finally {
      setIsImporting(false);
    }
  };

  const hasIncompleteData = editablePositions.some(
    (p) => p.selected && (p.shares === null || p.market_value === null)
  );

  return (
    <div className="space-y-4">
      {/* Metadata badges */}
      <div className="flex flex-wrap items-center gap-2">
        {metadata?.detected_broker && (
          <Badge variant="secondary" className="gap-1">
            <span className="text-muted-foreground">Broker:</span>
            {metadata.detected_broker}
          </Badge>
        )}
        {metadata?.detected_currency && (
          <Badge variant="secondary" className="gap-1">
            <span className="text-muted-foreground">Currency:</span>
            {metadata.detected_currency.toUpperCase()}
          </Badge>
        )}
        {metadata?.extraction_quality && (
          <Badge 
            variant={metadata.extraction_quality === "good" ? "default" : "outline"}
            className={cn(
              "gap-1",
              metadata.extraction_quality === "partial" && "border-amber-500/50 text-amber-500",
              metadata.extraction_quality === "poor" && "border-destructive/50 text-destructive"
            )}
          >
            {metadata.extraction_quality === "good" && <CheckCircle2 className="w-3 h-3" />}
            {metadata.extraction_quality === "partial" && <AlertTriangle className="w-3 h-3" />}
            {metadata.extraction_quality === "poor" && <AlertCircle className="w-3 h-3" />}
            {metadata.extraction_quality === "good" ? "High quality" : 
             metadata.extraction_quality === "partial" ? "Partial extraction" : "Low quality"}
          </Badge>
        )}
      </div>

      {/* Extraction notes */}
      {metadata?.extraction_notes && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border border-border">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">{metadata.extraction_notes}</p>
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {selectedCount} of {editablePositions.length} positions selected
          </span>
          <Button variant="ghost" size="sm" onClick={() => toggleAll(true)} className="h-7 px-2">
            Select All
          </Button>
          <Button variant="ghost" size="sm" onClick={() => toggleAll(false)} className="h-7 px-2">
            Deselect All
          </Button>
        </div>
        {cashBalances && Object.keys(cashBalances).length > 0 && (
          <div className="text-muted-foreground">
            Cash:{" "}
            {Object.entries(cashBalances)
              .map(([currency, amount]) => `${currency} ${amount.toLocaleString()}`)
              .join(" | ")}
          </div>
        )}
      </div>

      {/* Warning for incomplete data */}
      {hasIncompleteData && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="w-4 h-4 text-amber-500" />
          <span className="text-sm text-amber-500">
            Some positions have missing data. Please fill in the required values.
          </span>
        </div>
      )}

      {/* Warning for unverified positions */}
      {unverifiedCount > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-sm text-amber-500">
            {unverifiedCount} position{unverifiedCount !== 1 ? "s" : ""} need{unverifiedCount === 1 ? "s" : ""} verification. Please review the highlighted rows.
          </span>
        </div>
      )}

      {/* Table */}
      <ScrollArea className="h-[350px] rounded-lg border border-border">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10"></TableHead>
              <TableHead className="w-10">Status</TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead>Name</TableHead>
              {hasSourcePages && <TableHead className="w-16">Page</TableHead>}
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Avg Price</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {editablePositions.map((pos) => (
              <TableRow
                key={pos.id}
                className={cn(
                  "border-border",
                  !pos.selected && "opacity-50",
                  pos.needs_verification && !pos.verified && "bg-amber-500/5"
                )}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    checked={pos.selected}
                    onChange={(e) => updatePosition(pos.id, "selected", e.target.checked)}
                    className="rounded border-border"
                  />
                </TableCell>
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          {pos.needs_verification && !pos.verified ? (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          )}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {pos.needs_verification && !pos.verified
                          ? `AI guessed "${pos.originalTicker || pos.ticker}" - please verify`
                          : "Verified"}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Input
                      value={pos.ticker}
                      onChange={(e) => updatePosition(pos.id, "ticker", e.target.value)}
                      className={cn(
                        "h-8 w-20 font-mono font-semibold",
                        pos.needs_verification && !pos.verified && "border-amber-500/50"
                      )}
                    />
                    {pos.needs_verification && !pos.verified && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10"
                        onClick={() => verifyPosition(pos.id)}
                        title="Confirm this ticker"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Input
                    value={pos.name || ""}
                    onChange={(e) => updatePosition(pos.id, "name", e.target.value)}
                    placeholder="Company name"
                    className="h-8 w-32"
                  />
                </TableCell>
                {hasSourcePages && (
                  <TableCell>
                    <Badge variant="outline" className="font-normal">
                      {pos.source_page ?? 1}
                    </Badge>
                  </TableCell>
                )}
                <TableCell>
                  <Select
                    value={pos.position_type}
                    onValueChange={(v) => updatePosition(pos.id, "position_type", v)}
                  >
                    <SelectTrigger className="h-8 w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stock">Stock</SelectItem>
                      <SelectItem value="etf">ETF</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select
                    value={pos.category}
                    onValueChange={(v) => updatePosition(pos.id, "category", v)}
                  >
                    <SelectTrigger className="h-8 w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equity">Equity</SelectItem>
                      <SelectItem value="bond">Bond</SelectItem>
                      <SelectItem value="commodity">Commodity</SelectItem>
                      <SelectItem value="gold">Gold</SelectItem>
                      <SelectItem value="country">Country</SelectItem>
                      <SelectItem value="theme">Theme</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    value={pos.shares ?? ""}
                    onChange={(e) =>
                      updatePosition(pos.id, "shares", e.target.value ? parseFloat(e.target.value) : null)
                    }
                    className="h-8 w-20 text-right"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    step="0.01"
                    value={pos.avg_price ?? ""}
                    onChange={(e) =>
                      updatePosition(pos.id, "avg_price", e.target.value ? parseFloat(e.target.value) : null)
                    }
                    className="h-8 w-24 text-right"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    step="0.01"
                    value={pos.market_value ?? ""}
                    onChange={(e) =>
                      updatePosition(pos.id, "market_value", e.target.value ? parseFloat(e.target.value) : null)
                    }
                    className="h-8 w-28 text-right"
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removePosition(pos.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      {/* Review checkbox */}
      <div className="flex items-center space-x-2 p-3 rounded-lg bg-muted/30 border border-border">
        <Checkbox
          id="review-confirm"
          checked={hasReviewed}
          onCheckedChange={(checked) => setHasReviewed(checked === true)}
        />
        <label
          htmlFor="review-confirm"
          className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
        >
          I have reviewed all positions and verified the data is correct
        </label>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {totalValue && (
            <span>
              Total Value: €{totalValue.toLocaleString("de-DE", { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onCancel} disabled={isImporting}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!canImport || isImporting}
            className="gap-2"
          >
            {isImporting && <Loader2 className="w-4 h-4 animate-spin" />}
            Import {selectedCount} Position{selectedCount !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
