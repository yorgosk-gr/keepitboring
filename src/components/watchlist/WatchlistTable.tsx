import { useState } from "react";
import { Pencil, Trash2, ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import type { WatchlistItem } from "@/hooks/useWatchlist";

interface WatchlistTableProps {
  items: WatchlistItem[];
  onEdit: (item: WatchlistItem) => void;
  onDelete: (id: string) => void;
  onImport: (item: WatchlistItem) => void;
}

function getStatus(item: WatchlistItem) {
  if (item.current_price == null) return "wait";
  if (item.current_price <= item.target_price) return "triggered";
  const dist = ((item.current_price - item.target_price) / item.target_price) * 100;
  if (dist <= 5) return "approaching";
  return "wait";
}

function getDistance(item: WatchlistItem) {
  if (item.current_price == null) return null;
  return ((item.current_price - item.target_price) / item.target_price) * 100;
}

export function WatchlistTable({ items, onEdit, onDelete, onImport }: WatchlistTableProps) {
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedThesis, setExpandedThesis] = useState<string | null>(null);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="pb-3 font-medium">Ticker</th>
              <th className="pb-3 font-medium">Name</th>
              <th className="pb-3 font-medium">Type</th>
              <th className="pb-3 font-medium">Class</th>
              <th className="pb-3 font-medium text-right">Target</th>
              <th className="pb-3 font-medium text-right">Current</th>
              <th className="pb-3 font-medium text-right">Distance</th>
              <th className="pb-3 font-medium text-right">Size %</th>
              <th className="pb-3 font-medium">Safety</th>
              <th className="pb-3 font-medium">Thesis</th>
              <th className="pb-3 font-medium text-right">Inval.</th>
              <th className="pb-3 font-medium">Source</th>
              <th className="pb-3 font-medium w-24"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((item) => {
              const status = getStatus(item);
              const distance = getDistance(item);
              const maxSize = item.position_type === "stock" ? 8 : 15;
              const breaches = (item.intended_size_percent ?? 0) > maxSize;
              const invalidated = item.invalidation_price != null && item.current_price != null && item.current_price < item.invalidation_price;

              return (
                <tr
                  key={item.id}
                  className={cn(
                    "group hover:bg-secondary/30 transition-colors",
                    status === "triggered" && "bg-emerald-500/5",
                    status === "approaching" && "bg-amber-500/5"
                  )}
                >
                  <td className="py-3 font-mono font-bold text-foreground">{item.ticker}</td>
                  <td className="py-3 text-muted-foreground">{item.name || "—"}</td>
                  <td className="py-3">
                    <Badge variant="outline" className="text-xs uppercase">
                      {item.position_type}
                    </Badge>
                  </td>
                  <td className="py-3 text-xs text-muted-foreground">{item.category || "—"}</td>
                  <td className="py-3 text-right font-mono">${item.target_price.toFixed(2)}</td>
                  <td className="py-3 text-right font-mono">
                    {item.current_price != null ? `$${item.current_price.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-3 text-right">
                    {distance != null ? (
                      status === "triggered" ? (
                        <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30 text-xs">
                          TRIGGERED
                        </Badge>
                      ) : status === "approaching" ? (
                        <span className="text-amber-500 text-xs font-medium">
                          {distance.toFixed(1)}% away
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {distance.toFixed(1)}% away
                        </span>
                      )
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="py-3 text-right font-mono">
                    {item.intended_size_percent != null ? `${item.intended_size_percent}%` : "—"}
                  </td>
                  <td className="py-3">
                    {item.intended_size_percent != null ? (
                      breaches ? (
                        <span className="text-destructive text-xs">⚠ &gt;{maxSize}%</span>
                      ) : (
                        <span className="text-emerald-500 text-xs">✓</span>
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 max-w-[180px]">
                    {item.thesis ? (
                      <button
                        onClick={() => setExpandedThesis(expandedThesis === item.id ? null : item.id)}
                        className="text-left text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                      >
                        <span className={expandedThesis === item.id ? "" : "line-clamp-1"}>
                          {item.thesis}
                        </span>
                        {expandedThesis === item.id ? (
                          <ChevronUp className="w-3 h-3 shrink-0" />
                        ) : (
                          <ChevronDown className="w-3 h-3 shrink-0" />
                        )}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={cn("py-3 text-right font-mono text-xs", invalidated && "text-destructive font-bold")}>
                    {item.invalidation_price != null ? (
                      <>
                        ${item.invalidation_price.toFixed(2)}
                        {invalidated && " ✗"}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3">
                    <span className="text-xs text-muted-foreground">{item.source || "—"}</span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {status === "triggered" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-500" onClick={() => onImport(item)} title="Import to Portfolio">
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(item)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/20 hover:text-destructive" onClick={() => setDeleteId(item.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from Watchlist</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this item from your watchlist?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) onDelete(deleteId);
                setDeleteId(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
