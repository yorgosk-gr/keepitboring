import { useState } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { type Newsletter } from "@/hooks/useNewsletters";
import { SourceQualityBadge } from "@/components/newsletters/SourceQualityBadge";

interface NewsletterListProps {
  newsletters: Newsletter[];
  isLoading: boolean;
  onProcess: (newsletter: Newsletter) => void;
  onView: (newsletter: Newsletter) => void;
  onDelete: (newsletter: Newsletter) => void;
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

  const startEditing = (newsletter: Newsletter) => {
    setEditingId(newsletter.id);
    setEditValue(newsletter.source_name);
  };

  const saveEdit = (id: string) => {
    if (editValue.trim()) {
      onUpdateSourceName(id, editValue.trim());
    }
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
        <h3 className="text-lg font-medium text-foreground mb-2">
          No newsletters yet
        </h3>
        <p className="text-muted-foreground">
          Upload your first newsletter PDF to get started
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50 hover:bg-secondary/50">
              <TableHead>Source</TableHead>
              <TableHead>Upload Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-center">Insights</TableHead>
              <TableHead className="text-center">Quality</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {newsletters.map((newsletter) => (
              <TableRow key={newsletter.id} className="border-border">
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => saveEdit(newsletter.id)}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={cancelEdit}
                      >
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
                                {new Date(newsletter.publication_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
                    {formatDistanceToNow(new Date(newsletter.created_at), {
                      addSuffix: true,
                    })}
                  </span>
                </TableCell>
                <TableCell>
                  {newsletter.processed ? (
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                      Processed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20">
                      Pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <span className="text-muted-foreground">
                    {newsletter.insights_count || 0}
                  </span>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex justify-center">
                    <SourceQualityBadge
                      confidenceScore={(newsletter as any).source_confidence}
                      insightsCount={newsletter.insights_count}
                    />
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {!newsletter.processed && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-primary"
                        onClick={() => onProcess(newsletter)}
                        disabled={processingId === newsletter.id}
                      >
                        {processingId === newsletter.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4" />
                        )}
                        Process
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
