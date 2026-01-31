import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { Archive, ArchiveRestore, Trash2, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useNewsletterCleanup } from "@/hooks/useNewsletterCleanup";
import type { Newsletter } from "@/hooks/useNewsletters";

interface NewsletterArchiveTabProps {
  newsletters: Newsletter[];
  isLoading: boolean;
  onView: (newsletter: Newsletter) => void;
  onDelete: (newsletter: Newsletter) => void;
}

export function NewsletterArchiveTab({
  newsletters,
  isLoading,
  onView,
  onDelete,
}: NewsletterArchiveTabProps) {
  const { toggleArchive, isTogglingArchive } = useNewsletterCleanup();
  const [deleteConfirm, setDeleteConfirm] = useState<Newsletter | null>(null);

  // Filter to only archived newsletters
  const archivedNewsletters = newsletters.filter((n) => n.is_archived);

  // Calculate date range
  const dates = archivedNewsletters.map((n) => new Date(n.upload_date));
  const oldestDate = dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
  const newestDate = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (archivedNewsletters.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Archive className="w-8 h-8 text-primary" />
        </div>
        <h3 className="text-lg font-medium text-foreground mb-2">
          No archived newsletters
        </h3>
        <p className="text-muted-foreground">
          Newsletters older than 90 days can be archived here.
          <br />
          Their insights will be excluded from analysis unless they mention your portfolio tickers.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <Badge variant="outline" className="gap-1">
            <Archive className="w-3 h-3" />
            {archivedNewsletters.length} archived
          </Badge>
          {oldestDate && newestDate && (
            <span>
              Date range: {format(oldestDate, "MMM yyyy")} – {format(newestDate, "MMM yyyy")}
            </span>
          )}
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                <TableHead>Source</TableHead>
                <TableHead>Upload Date</TableHead>
                <TableHead className="text-center">Insights</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {archivedNewsletters.map((newsletter) => (
                <TableRow key={newsletter.id} className="border-border">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{newsletter.source_name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span title={format(new Date(newsletter.upload_date), "PPP")}>
                      {formatDistanceToNow(new Date(newsletter.upload_date), {
                        addSuffix: true,
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="text-muted-foreground">
                      {newsletter.insights_count || 0}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
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
                        size="sm"
                        className="gap-1 text-primary"
                        onClick={() =>
                          toggleArchive({ id: newsletter.id, isArchived: false })
                        }
                        disabled={isTogglingArchive}
                      >
                        <ArchiveRestore className="w-4 h-4" />
                        Unarchive
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteConfirm(newsletter)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Newsletter</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.source_name}"? This will
              also delete all extracted insights. This action cannot be undone.
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
    </>
  );
}
