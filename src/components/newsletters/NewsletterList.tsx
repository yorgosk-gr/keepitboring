import { useState, useCallback } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  Trash2,
  Eye,
  Play,
  Loader2,
  Pencil,
  Check,
  X,
  FileText,
  User,
  Calendar,
  RefreshCw,
  AlertCircle,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { type Newsletter } from "@/hooks/useNewsletters";
import { SourceQualityBadge } from "@/components/newsletters/SourceQualityBadge";

interface NewsletterListProps {
  newsletters: Newsletter[];
  isLoading: boolean;
  onProcess: (newsletter: Newsletter) => Promise<void>;
  onView: (newsletter: Newsletter) => void;
  onDelete: (newsletter: Newsletter) => Promise<void>;
  onUpdateSourceName: (id: string, sourceName: string) => void;
  processingId: string | null;
}

export function NewsletterList({
  newsletters,
  isLoading,
  onProcess,
  onView,
  onDelete,
  onUpdateSourceName,
  processingId,
}: NewsletterListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<Newsletter | null>(null);

  // ── Bulk selection ────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessingIds, setBulkProcessingIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const allSelected = newsletters.length > 0 && selectedIds.size === newsletters.length;
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(newsletters.map((n) => n.id)));
    }
  }, [allSelected, newsletters]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedIds(new Set());

  // ── Bulk reprocess ────────────────────────────────────────────────────────
  const handleBulkReprocess = async () => {
    const targets = newsletters.filter((n) => selectedIds.has(n.id));
    setBulkProcessingIds(new Set(targets.map((n) => n.id)));
    let delay = 1000;
    for (let i = 0; i < targets.length; i++) {
      const n = targets[i];
      try {
        await onProcess(n);
        delay = 1000;
      } catch {
        delay = Math.min(delay * 2, 10000);
      }
      setBulkProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(n.id);
        return next;
      });
      if (i < targets.length - 1) await new Promise((r) => setTimeout(r, delay));
    }
    clearSelection();
  };

  // ── Bulk delete ───────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    setIsBulkDeleting(true);
    const targets = newsletters.filter((n) => selectedIds.has(n.id));
    for (const n of targets) {
      try { await onDelete(n); } catch { /* continue */ }
    }
    setIsBulkDeleting(false);
    clearSelection();
  };

  // ── Edit helpers ──────────────────────────────────────────────────────────
  const startEditing = (newsletter: Newsletter) => {
    setEditingId(newsletter.id);
    setEditValue(newsletter.source_name);
  };

  const saveEdit = (id: string) => {
    if (editValue.trim()) onUpdateSourceName(id, editValue.trim());
    setEditingId(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (newsletters.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <FileText className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">No newsletters yet</h3>
        <p className="text-muted-foreground">Upload your first newsletter PDF to get started</p>
      </div>
    );
  }

  const selectedNewsletters = newsletters.filter((n) => selectedIds.has(n.id));
  const isBulkReprocessing = bulkProcessingIds.size > 0;

  return (
    <>
      {/* ── Bulk action toolbar ── */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-primary/20 bg-primary/5 mb-3">
          <div className="flex items-center gap-3">
            <CheckSquare className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} selected
            </span>
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={clearSelection}
            >
              Clear
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8"
              onClick={handleBulkReprocess}
              disabled={isBulkReprocessing || isBulkDeleting}
            >
              {isBulkReprocessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {isBulkReprocessing
                ? `Processing ${selectedNewsletters.length - bulkProcessingIds.size}/${selectedNewsletters.length}`
                : "Reprocess"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-8 border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => setShowBulkDeleteConfirm(true)}
              disabled={isBulkReprocessing || isBulkDeleting}
            >
              {isBulkDeleting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Trash2 className="w-3.5 h-3.5" />
              )}
              Delete
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50 hover:bg-secondary/50">
              {/* Select-all checkbox */}
              <TableHead className="w-10 pr-0">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) (el as any).indeterminate = someSelected;
                  }}
                  onCheckedChange={toggleSelectAll}
                  aria-label="Select all newsletters"
                />
              </TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Upload Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Insights</TableHead>
              <TableHead className="text-center">Quality</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {newsletters.map((newsletter) => {
              const isSelected = selectedIds.has(newsletter.id);
              const isBulkProcessingThis = bulkProcessingIds.has(newsletter.id);

              return (
                <TableRow
                  key={newsletter.id}
                  className={isSelected ? "bg-primary/5 border-border" : "border-border"}
                >
                  {/* Row checkbox */}
                  <TableCell className="w-10 pr-0">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelect(newsletter.id)}
                      aria-label={`Select ${newsletter.source_name}`}
                    />
                  </TableCell>

                  <TableCell>
                    {editingId === newsletter.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="h-8 w-48"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(newsletter.id);
                            if (e.key === "Escape") cancelEdit();
                          }}
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => saveEdit(newsletter.id)}>
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={cancelEdit}>
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{newsletter.source_name}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:opacity-100"
                              onClick={() => startEditing(newsletter)}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </div>
                          {(newsletter.author || newsletter.publication_date) && (
                            <div className="flex items-center gap-3 mt-0.5">
                              {newsletter.author && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <User className="w-3 h-3" />
                                  {newsletter.author}
                                </span>
                              )}
                              {newsletter.publication_date && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Calendar className="w-3 h-3" />
                                  {new Date(newsletter.publication_date).toLocaleDateString("en-US", {
                                    month: "short", day: "numeric", year: "numeric",
                                  })}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </TableCell>

                  <TableCell className="text-muted-foreground">
                    <span title={format(new Date(newsletter.created_at), "PPP p")}>
                      {formatDistanceToNow(new Date(newsletter.created_at), { addSuffix: true })}
                    </span>
                  </TableCell>

                  <TableCell>
                    {newsletter.processed ? (
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                        Processed
                      </Badge>
                    ) : newsletter.processing_error ? (
                      <Tooltip delayDuration={0}>
                        <TooltipTrigger asChild>
                          <span className="inline-flex">
                            <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20 gap-1 cursor-help">
                              <AlertCircle className="w-3 h-3" />
                              Failed
                            </Badge>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <p className="text-sm">{newsletter.processing_error}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                        Pending
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    <span className="text-muted-foreground">{newsletter.insights_count || 0}</span>
                  </TableCell>

                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      <SourceQualityBadge
                        confidenceScore={newsletter.source_confidence}
                        insightsCount={newsletter.insights_count}
                      />
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      {!newsletter.processed && !newsletter.processing_error && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-primary"
                          onClick={() => onProcess(newsletter)}
                          disabled={processingId === newsletter.id || isBulkProcessingThis}
                        >
                          {processingId === newsletter.id || isBulkProcessingThis ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Play className="w-4 h-4" />
                          )}
                          Process
                        </Button>
                      )}
                      {(newsletter.processing_error || (newsletter.processed && (newsletter.insights_count || 0) === 0)) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className={`gap-1 ${newsletter.processing_error ? "text-destructive" : "text-amber-500"}`}
                          onClick={() => onProcess(newsletter)}
                          disabled={processingId === newsletter.id || isBulkProcessingThis}
                        >
                          {processingId === newsletter.id || isBulkProcessingThis ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          Retry
                        </Button>
                      )}
                      {newsletter.processed && (newsletter.insights_count || 0) > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1"
                          onClick={() => onView(newsletter)}
                        >
                          <Eye className="w-4 h-4" />
                          View
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteConfirm(newsletter)}
                        disabled={isBulkProcessingThis}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Single delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Newsletter</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.source_name}"? This will also delete
              all extracted insights. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteConfirm) onDelete(deleteConfirm);
                setDeleteConfirm(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation */}
      <AlertDialog open={showBulkDeleteConfirm} onOpenChange={setShowBulkDeleteConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} newsletters?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete {selectedIds.size} newsletter{selectedIds.size !== 1 ? "s" : ""} and
              all their extracted insights. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setShowBulkDeleteConfirm(false);
                handleBulkDelete();
              }}
            >
              Delete {selectedIds.size}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
