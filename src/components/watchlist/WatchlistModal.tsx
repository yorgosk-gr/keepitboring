import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertTriangle, CheckCircle } from "lucide-react";
import type { WatchlistFormData, WatchlistItem } from "@/hooks/useWatchlist";

interface WatchlistModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: WatchlistFormData) => Promise<void>;
  isLoading: boolean;
  editItem?: WatchlistItem | null;
  portfolioValue?: number;
}

export function WatchlistModal({
  open,
  onClose,
  onSubmit,
  isLoading,
  editItem,
  portfolioValue = 0,
}: WatchlistModalProps) {
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [positionType, setPositionType] = useState<"stock" | "etf">("stock");
  const [category, setCategory] = useState<"Equities" | "Bonds" | "Commodities">("Equities");
  const [targetPrice, setTargetPrice] = useState("");
  const [invalidationPrice, setInvalidationPrice] = useState("");
  const [intendedSize, setIntendedSize] = useState("");
  const [thesis, setThesis] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (editItem) {
      setTicker(editItem.ticker);
      setName(editItem.name || "");
      setPositionType((editItem.position_type as "stock" | "etf") || "stock");
      setCategory((editItem.category as "Equities" | "Bonds" | "Commodities") || "Equities");
      setTargetPrice(editItem.target_price.toString());
      setInvalidationPrice(editItem.invalidation_price?.toString() || "");
      setIntendedSize(editItem.intended_size_percent?.toString() || "");
      setThesis(editItem.thesis || "");
      setSource(editItem.source || "");
      setNotes(editItem.notes || "");
    } else {
      setTicker("");
      setName("");
      setPositionType("stock");
      setCategory("Equities");
      setTargetPrice("");
      setInvalidationPrice("");
      setIntendedSize("");
      setThesis("");
      setSource("");
      setNotes("");
    }
  }, [editItem, open]);

  const sizeNum = parseFloat(intendedSize) || 0;
  const maxSize = positionType === "stock" ? 8 : 15;
  const breachesLimit = sizeNum > maxSize;
  const portfolioDollarValue = portfolioValue > 0 && sizeNum > 0 ? (sizeNum / 100) * portfolioValue : 0;

  const handleSubmit = async () => {
    if (!ticker || !targetPrice) return;
    await onSubmit({
      ticker: ticker.toUpperCase(),
      name: name || undefined,
      position_type: positionType,
      category,
      target_price: parseFloat(targetPrice),
      invalidation_price: invalidationPrice ? parseFloat(invalidationPrice) : null,
      intended_size_percent: sizeNum || null,
      thesis: thesis || undefined,
      source: source || undefined,
      notes: notes || undefined,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editItem ? "Edit Watchlist Item" : "Add to Watchlist"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Ticker *</Label>
              <Input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="AAPL"
                className="font-mono"
              />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Apple Inc." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Type</Label>
              <Select value={positionType} onValueChange={(v) => setPositionType(v as "stock" | "etf")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  <SelectItem value="stock">Stock</SelectItem>
                  <SelectItem value="etf">ETF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Asset Class</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  <SelectItem value="Equities">Equities</SelectItem>
                  <SelectItem value="Bonds">Bonds</SelectItem>
                  <SelectItem value="Commodities">Commodities</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Target Price *</Label>
              <Input
                type="number"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                placeholder="150.00"
              />
            </div>
            <div>
              <Label>Invalidation Price</Label>
              <Input
                type="number"
                value={invalidationPrice}
                onChange={(e) => setInvalidationPrice(e.target.value)}
                placeholder="120.00"
              />
            </div>
          </div>

          <div>
            <Label>Intended Size %</Label>
            <Input
              type="number"
              value={intendedSize}
              onChange={(e) => setIntendedSize(e.target.value)}
              placeholder="5"
              min={0}
              max={100}
            />
            {sizeNum > 0 && (
              <div className="mt-2 space-y-1">
                {portfolioValue > 0 && (
                  <p className="text-xs text-muted-foreground">
                    ≈ ${portfolioDollarValue.toLocaleString(undefined, { maximumFractionDigits: 0 })} of current portfolio
                  </p>
                )}
                <div className="flex items-center gap-1.5">
                  {breachesLimit ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                      <span className="text-xs text-destructive">
                        Exceeds {positionType === "stock" ? "Graham" : "ETF"} limit ({maxSize}%)
                      </span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="text-xs text-emerald-500">
                        Within {positionType === "stock" ? "Graham" : "ETF"} limit ({maxSize}%)
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            <Label>Source</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue placeholder="Select source..." /></SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="Newsletter">Newsletter</SelectItem>
                <SelectItem value="Own Research">Own Research</SelectItem>
                <SelectItem value="Book Principle">Book Principle</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Thesis</Label>
            <Textarea
              value={thesis}
              onChange={(e) => setThesis(e.target.value)}
              placeholder="Why do you want this position?"
              rows={3}
            />
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={isLoading || !ticker || !targetPrice}>
              {isLoading ? "Saving..." : editItem ? "Update" : "Add"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
