import { useState } from "react";
import { Loader2, Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

export interface ExtractedPosition {
  ticker: string;
  name: string | null;
  shares: number | null;
  avg_price: number | null;
  current_price: number | null;
  market_value: number | null;
  pnl: number | null;
  source_page?: number;
}

interface EditablePosition extends ExtractedPosition {
  id: string;
  position_type: "stock" | "etf";
  category: "equity" | "bond" | "commodity" | "gold" | "country" | "theme";
  selected: boolean;
}

interface ScreenshotPreviewTableProps {
  positions: ExtractedPosition[];
  cashBalances?: Record<string, number>;
  totalValue?: number | null;
  onCancel: () => void;
  onImportComplete: () => void;
}

export function ScreenshotPreviewTable({
  positions,
  cashBalances,
  totalValue,
  onCancel,
  onImportComplete,
}: ScreenshotPreviewTableProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isImporting, setIsImporting] = useState(false);

  // Check if we have multi-page data
  const hasSourcePages = positions.some(p => p.source_page !== undefined);

  const [editablePositions, setEditablePositions] = useState<EditablePosition[]>(
    positions.map((p, i) => ({
      ...p,
      id: `temp-${i}`,
      position_type: "stock" as const,
      category: "equity" as const,
      selected: true,
    }))
  );

  const updatePosition = (id: string, field: keyof EditablePosition, value: unknown) => {
    setEditablePositions((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const removePosition = (id: string) => {
    setEditablePositions((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleAll = (selected: boolean) => {
    setEditablePositions((prev) => prev.map((p) => ({ ...p, selected })));
  };

  const selectedCount = editablePositions.filter((p) => p.selected).length;

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

    setIsImporting(true);

    try {
      // Calculate total value for weight calculation
      const totalMV = toImport.reduce((sum, p) => sum + (p.market_value ?? 0), 0);

      // Prepare positions for upsert
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

      // For each position, upsert (update if exists by ticker, insert if not)
      for (const pos of positionsToUpsert) {
        // Check if position with this ticker exists
        const { data: existing } = await supabase
          .from("positions")
          .select("id")
          .eq("user_id", user.id)
          .eq("ticker", pos.ticker)
          .maybeSingle();

        if (existing) {
          // Update existing
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
          // Insert new
          const { error } = await supabase.from("positions").insert(pos);
          if (error) throw error;
        }
      }

      // Create portfolio snapshot
      const stocksValue = toImport
        .filter((p) => p.position_type === "stock")
        .reduce((sum, p) => sum + (p.market_value ?? 0), 0);
      const etfsValue = toImport
        .filter((p) => p.position_type === "etf")
        .reduce((sum, p) => sum + (p.market_value ?? 0), 0);

      const { error: snapshotError } = await supabase.from("portfolio_snapshots").insert({
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
        },
      });

      if (snapshotError) {
        // Non-fatal, continue
      }

      // Invalidate queries
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
      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">
            {selectedCount} of {editablePositions.length} positions selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleAll(true)}
            className="h-7 px-2"
          >
            Select All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleAll(false)}
            className="h-7 px-2"
          >
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
            Some positions have missing data. Please fill in the required values before importing.
          </span>
        </div>
      )}

      {/* Table */}
      <ScrollArea className="h-[400px] rounded-lg border border-border">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10">
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="w-10"></TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead>Name</TableHead>
              {hasSourcePages && <TableHead className="w-16">Page</TableHead>}
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Avg Price</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {editablePositions.map((pos) => (
              <TableRow
                key={pos.id}
                className={`border-border ${!pos.selected ? "opacity-50" : ""}`}
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
                  <Input
                    value={pos.ticker}
                    onChange={(e) => updatePosition(pos.id, "ticker", e.target.value)}
                    className="h-8 w-20 font-mono font-semibold"
                  />
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
                      {pos.source_page ?? "-"}
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
                      updatePosition(
                        pos.id,
                        "shares",
                        e.target.value ? parseFloat(e.target.value) : null
                      )
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
                      updatePosition(
                        pos.id,
                        "avg_price",
                        e.target.value ? parseFloat(e.target.value) : null
                      )
                    }
                    className="h-8 w-24 text-right"
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    step="0.01"
                    value={pos.current_price ?? ""}
                    onChange={(e) =>
                      updatePosition(
                        pos.id,
                        "current_price",
                        e.target.value ? parseFloat(e.target.value) : null
                      )
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
                      updatePosition(
                        pos.id,
                        "market_value",
                        e.target.value ? parseFloat(e.target.value) : null
                      )
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
            disabled={selectedCount === 0 || isImporting}
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
