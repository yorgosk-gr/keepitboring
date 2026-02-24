import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { z } from "zod";
import type { Position, PositionFormData } from "@/hooks/usePositions";

const positionSchema = z.object({
  ticker: z.string().min(1, "Ticker is required").max(10, "Ticker too long"),
  name: z.string().max(100, "Name too long").optional(),
  position_type: z.enum(["stock", "etf"]),
  category: z.enum(["equity", "bond", "commodity"]),
  shares: z.number().positive("Shares must be positive"),
  avg_cost: z.number().positive("Average cost must be positive"),
  current_price: z.number().positive("Current price must be positive"),
  bet_type: z.enum(["core", "satellite", "explore"]),
  confidence_level: z.number().min(1).max(10),
  thesis_notes: z.string().max(2000, "Notes too long").optional(),
  invalidation_triggers: z.string().max(1000, "Triggers too long").optional(),
});

interface PositionModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: PositionFormData) => Promise<void>;
  position?: Position | null;
  isLoading?: boolean;
}

export function PositionModal({ open, onClose, onSubmit, position, isLoading }: PositionModalProps) {
  const isEdit = !!position;
  
  // Parse existing thesis notes to extract invalidation triggers
  const parseThesisNotes = (notes: string | null) => {
    if (!notes) return { thesis: "", triggers: "" };
    const parts = notes.split("**Invalidation Triggers:**");
    return {
      thesis: parts[0].trim(),
      triggers: parts[1]?.trim() || "",
    };
  };

  const parsed = parseThesisNotes(position?.thesis_notes ?? null);

  const [formData, setFormData] = useState({
    ticker: position?.ticker ?? "",
    name: position?.name ?? "",
    position_type: (position?.position_type as "stock" | "etf") ?? "etf",
    category: (position?.category as PositionFormData["category"]) ?? "equity",
    shares: position?.shares?.toString() ?? "",
    avg_cost: position?.avg_cost?.toString() ?? "",
    current_price: position?.current_price?.toString() ?? "",
    bet_type: (position?.bet_type as PositionFormData["bet_type"]) ?? "core",
    confidence_level: position?.confidence_level ?? 5,
    thesis_notes: parsed.thesis,
    invalidation_triggers: parsed.triggers,
  });

  // Reset form when position changes (fixes edit not pre-populating)
  useEffect(() => {
    const parsed = parseThesisNotes(position?.thesis_notes ?? null);
    setFormData({
      ticker: position?.ticker ?? "",
      name: position?.name ?? "",
      position_type: (position?.position_type as "stock" | "etf") ?? "etf",
      category: (position?.category as PositionFormData["category"]) ?? "equity",
      shares: position?.shares?.toString() ?? "",
      avg_cost: position?.avg_cost?.toString() ?? "",
      current_price: position?.current_price?.toString() ?? "",
      bet_type: (position?.bet_type as PositionFormData["bet_type"]) ?? "core",
      confidence_level: position?.confidence_level ?? 5,
      thesis_notes: parsed.thesis,
      invalidation_triggers: parsed.triggers,
    });
    setErrors({});
  }, [position]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const dataToValidate = {
      ticker: formData.ticker.trim(),
      name: formData.name.trim() || undefined,
      position_type: formData.position_type,
      category: formData.category,
      shares: parseFloat(formData.shares) || 0,
      avg_cost: parseFloat(formData.avg_cost) || 0,
      current_price: parseFloat(formData.current_price) || 0,
      bet_type: formData.bet_type,
      confidence_level: formData.confidence_level,
      thesis_notes: formData.thesis_notes.trim() || undefined,
      invalidation_triggers: formData.invalidation_triggers.trim() || undefined,
    };

    const result = positionSchema.safeParse(dataToValidate);
    
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0].toString()] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    // Cast to PositionFormData since we've validated it
    const validatedData: PositionFormData = {
      ticker: result.data.ticker,
      name: result.data.name,
      position_type: result.data.position_type,
      category: result.data.category,
      shares: result.data.shares,
      avg_cost: result.data.avg_cost,
      current_price: result.data.current_price,
      bet_type: result.data.bet_type,
      confidence_level: result.data.confidence_level,
      thesis_notes: result.data.thesis_notes,
      invalidation_triggers: result.data.invalidation_triggers,
    };

    await onSubmit(validatedData);
    onClose();
  };

  const currencySymbol = (() => {
    const c = position?.currency;
    if (!c || c === "USD") return "$";
    if (c === "EUR") return "€";
    if (c === "GBP") return "£";
    if (c === "AUD") return "A$";
    return c + " ";
  })();

  const marketValue = (parseFloat(formData.shares) || 0) * (parseFloat(formData.current_price) || 0);
  const pnlPercent = formData.avg_cost && formData.current_price
    ? (((parseFloat(formData.current_price) - parseFloat(formData.avg_cost)) / parseFloat(formData.avg_cost)) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            {isEdit ? "Edit Position" : "Add New Position"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info Row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="ticker">Ticker *</Label>
              <Input
                id="ticker"
                value={formData.ticker}
                onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
                placeholder="AAPL"
                className="bg-secondary border-border"
              />
              {errors.ticker && <p className="text-xs text-destructive">{errors.ticker}</p>}
            </div>

            <div className="space-y-2 col-span-2 md:col-span-1">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Apple Inc."
                className="bg-secondary border-border"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="position_type">Type *</Label>
              <Select
                value={formData.position_type}
                onValueChange={(v) => setFormData({ ...formData, position_type: v as "stock" | "etf" })}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">Stock</SelectItem>
                  <SelectItem value="etf">ETF</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => setFormData({ ...formData, category: v as PositionFormData["category"] })}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equity">Equity</SelectItem>
                  <SelectItem value="bond">Bond</SelectItem>
                  <SelectItem value="commodity">Commodity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Numbers Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="shares">Shares *</Label>
              <Input
                id="shares"
                type="number"
                step="0.0001"
                value={formData.shares}
                onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                placeholder="100"
                className="bg-secondary border-border"
              />
              {errors.shares && <p className="text-xs text-destructive">{errors.shares}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="avg_cost">Avg Cost ({currencySymbol}) *</Label>
              <Input
                id="avg_cost"
                type="number"
                step="0.01"
                value={formData.avg_cost}
                onChange={(e) => setFormData({ ...formData, avg_cost: e.target.value })}
                placeholder="150.00"
                className="bg-secondary border-border"
              />
              {errors.avg_cost && <p className="text-xs text-destructive">{errors.avg_cost}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="current_price">Current Price ({currencySymbol}) *</Label>
              <Input
                id="current_price"
                type="number"
                step="0.01"
                value={formData.current_price}
                onChange={(e) => setFormData({ ...formData, current_price: e.target.value })}
                placeholder="175.00"
                className="bg-secondary border-border"
              />
              {errors.current_price && <p className="text-xs text-destructive">{errors.current_price}</p>}
            </div>
          </div>

          {/* Calculated Values */}
          {(formData.shares && formData.current_price) && (
            <div className="flex gap-6 p-3 rounded-lg bg-secondary/50">
              <div>
                <span className="text-xs text-muted-foreground">Market Value</span>
                <p className="text-lg font-semibold text-foreground">
                  {currencySymbol}{marketValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Unrealized P&L</span>
                <p className={`text-lg font-semibold ${pnlPercent >= 0 ? "text-primary" : "text-destructive"}`}>
                  {pnlPercent >= 0 ? "+" : ""}{pnlPercent.toFixed(2)}%
                </p>
              </div>
            </div>
          )}

          {/* Investment Strategy Row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="bet_type">Tier *</Label>
              <Select
                value={formData.bet_type}
                onValueChange={(v) => setFormData({ ...formData, bet_type: v as PositionFormData["bet_type"] })}
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="core">Core</SelectItem>
                  <SelectItem value="satellite">Satellite</SelectItem>
                  <SelectItem value="explore">Explore</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Core = broad index/bonds • Satellite = conviction picks • Explore = small experiments
              </p>
            </div>

            <div className="space-y-2">
              <Label>Confidence Level: {formData.confidence_level}/10</Label>
              <Slider
                value={[formData.confidence_level]}
                onValueChange={([v]) => setFormData({ ...formData, confidence_level: v })}
                min={1}
                max={10}
                step={1}
                className="py-4"
              />
            </div>
          </div>

          {/* Thesis Notes */}
          <div className="space-y-2">
            <Label htmlFor="thesis_notes">Thesis Notes</Label>
            <Textarea
              id="thesis_notes"
              value={formData.thesis_notes}
              onChange={(e) => setFormData({ ...formData, thesis_notes: e.target.value })}
              placeholder="Why are you investing in this position? What's your thesis?"
              rows={3}
              className="bg-secondary border-border resize-none"
            />
          </div>

          {/* Invalidation Triggers */}
          <div className="space-y-2">
            <Label htmlFor="invalidation_triggers">What would invalidate this thesis?</Label>
            <Textarea
              id="invalidation_triggers"
              value={formData.invalidation_triggers}
              onChange={(e) => setFormData({ ...formData, invalidation_triggers: e.target.value })}
              placeholder="Under what conditions would you sell this position?"
              rows={2}
              className="bg-secondary border-border resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : isEdit ? "Update Position" : "Add Position"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
