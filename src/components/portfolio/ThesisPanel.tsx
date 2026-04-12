import { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Save } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Position } from "@/hooks/usePositions";

interface ThesisPanelProps {
  open: boolean;
  onClose: () => void;
  position: Position | null;
  onSave: (data: {
    thesis_notes: string;
    confidence_level: number;
    bet_type: string;
    invalidation_trigger: string;
    last_review_date: string;
  }) => Promise<void>;
  isSaving?: boolean;
}

function formatPnL(position: Position) {
  const pnl = position.unrealized_pnl ?? 0;
  const sign = pnl >= 0 ? "+" : "";
  return `${sign}$${Math.abs(pnl).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function ThesisPanel({ open, onClose, position, onSave, isSaving }: ThesisPanelProps) {
  const [thesisNotes, setThesisNotes] = useState("");
  const [invalidationTrigger, setInvalidationTrigger] = useState("");
  const [lastReviewDate, setLastReviewDate] = useState<Date | undefined>(undefined);

  // Reset form when position changes
  useEffect(() => {
    if (position) {
      setThesisNotes(position.thesis_notes || "");
      setInvalidationTrigger(position.invalidation_trigger || "");
      setLastReviewDate(
        position.last_review_date ? new Date(position.last_review_date) : undefined
      );
    }
  }, [position]);

  const handleSave = async () => {
    if (!position) return;
    await onSave({
      thesis_notes: thesisNotes,
      confidence_level: position.confidence_level ?? 5,
      bet_type: position.bet_type ?? "active",
      invalidation_trigger: invalidationTrigger,
      last_review_date: lastReviewDate ? format(lastReviewDate, "yyyy-MM-dd") : "",
    });
  };

  if (!position) return null;

  const pnlValue = position.unrealized_pnl ?? 0;
  const pnlColor = pnlValue >= 0 ? "text-emerald-500" : "text-destructive";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-xl">{position.ticker}</SheetTitle>
          <SheetDescription className="space-y-1">
            <span className="block text-sm">{position.name || "—"}</span>
            <span className="block text-sm">
              Value: ${(position.market_value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 0 })}
              {" · "}
              <span className={pnlColor}>
                P&L: {formatPnL(position)}
              </span>
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-2">
          {/* Why do you hold this? */}
          <div className="space-y-2">
            <Label htmlFor="thesis-notes">Why do you hold this?</Label>
            <Textarea
              id="thesis-notes"
              placeholder="What's your rationale for this position?"
              value={thesisNotes}
              onChange={(e) => setThesisNotes(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          {/* Invalidation Trigger */}
          <div className="space-y-2">
            <Label htmlFor="invalidation-trigger">What would make you sell?</Label>
            <Textarea
              id="invalidation-trigger"
              placeholder="Price drops below X, revenue declines, thesis breaks..."
              value={invalidationTrigger}
              onChange={(e) => setInvalidationTrigger(e.target.value)}
              className="min-h-[80px]"
            />
          </div>

          {/* Last Reviewed */}
          <div className="space-y-2">
            <Label>Last Reviewed</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !lastReviewDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {lastReviewDate ? format(lastReviewDate, "PPP") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={lastReviewDate}
                  onSelect={setLastReviewDate}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Save */}
          <Button
            className="w-full gap-2"
            onClick={handleSave}
            disabled={isSaving}
          >
            <Save className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
