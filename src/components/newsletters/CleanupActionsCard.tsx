import { useState } from "react";
import { Archive, Copy, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useNewsletterCleanup, type CleanupPreview } from "@/hooks/useNewsletterCleanup";
import { HelpTooltip } from "@/components/common/HelpTooltip";

export function CleanupActionsCard() {
  const {
    getCleanupPreview,
    archiveOldNewsletters,
    isArchiving,
    removeDuplicates,
    isRemovingDuplicates,
    clearOldUnstarred,
    isClearing,
  } = useNewsletterCleanup();

  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [actionType, setActionType] = useState<"archive" | "duplicates" | "clear" | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const handleAction = async (type: "archive" | "duplicates" | "clear") => {
    setIsLoadingPreview(true);
    try {
      const p = await getCleanupPreview();
      setPreview(p);
      setActionType(type);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const executeAction = async () => {
    if (!preview || !actionType) return;

    switch (actionType) {
      case "archive":
        await archiveOldNewsletters();
        break;
      case "duplicates":
        await removeDuplicates(preview);
        break;
      case "clear":
        await clearOldUnstarred(preview.oldUnstarred.insightIds);
        break;
    }

    setActionType(null);
    setPreview(null);
  };

  const getDialogContent = () => {
    if (!preview || !actionType) return null;

    switch (actionType) {
      case "archive":
        return {
          title: "Archive Old Newsletters",
          description: `This will archive ${preview.archiveOld.count} newsletters older than 90 days. Their insights will be excluded from analysis unless they mention tickers in your current portfolio.`,
          items: preview.archiveOld.newsletters.slice(0, 5).map(
            (n) => `${n.source_name} (${n.upload_date})`
          ),
          count: preview.archiveOld.count,
        };
      case "duplicates":
        return {
          title: "Remove Duplicate Insights",
          description: `This will remove ${preview.duplicateInsights.count} duplicate insights (same ticker + sentiment from the same week). The most recent insight in each group will be kept.`,
          items: preview.duplicateInsights.groups.slice(0, 5).map(
            (g) => `${g.ticker} (${g.sentiment}) - week ${g.week}: ${g.removeIds.length} duplicates`
          ),
          count: preview.duplicateInsights.count,
        };
      case "clear":
        return {
          title: "Clear Old Unstarred Insights",
          description: `This will permanently delete ${preview.oldUnstarred.count} unstarred insights older than 6 months. Starred insights will be preserved.`,
          items: [],
          count: preview.oldUnstarred.count,
        };
    }
  };

  const dialogContent = getDialogContent();
  const isLoading = isArchiving || isRemovingDuplicates || isClearing || isLoadingPreview;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Bulk Cleanup</CardTitle>
            <HelpTooltip content="Actions to keep your newsletter and insights collection organized. All actions show a preview before executing and require confirmation." />
          </div>
          <CardDescription>
            Organize and clean up newsletters and insights
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => handleAction("archive")}
            disabled={isLoading}
          >
            {isLoadingPreview && actionType === "archive" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Archive className="w-4 h-4" />
            )}
            Archive newsletters older than 90 days
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-2"
            onClick={() => handleAction("duplicates")}
            disabled={isLoading}
          >
            {isLoadingPreview && actionType === "duplicates" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
            Remove duplicate insights
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-destructive hover:text-destructive"
            onClick={() => handleAction("clear")}
            disabled={isLoading}
          >
            {isLoadingPreview && actionType === "clear" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Clear unstarred insights older than 6 months
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={!!actionType} onOpenChange={() => setActionType(null)}>
        <AlertDialogContent className="bg-card border-border max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {actionType === "clear" && <AlertTriangle className="w-5 h-5 text-destructive" />}
              {dialogContent?.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p>{dialogContent?.description}</p>
              
              {dialogContent && dialogContent.count === 0 && (
                <p className="text-muted-foreground italic">
                  Nothing to clean up — your data is already organized!
                </p>
              )}

              {dialogContent && dialogContent.items.length > 0 && (
                <div className="mt-2 p-3 rounded-lg bg-secondary/50 text-sm">
                  <p className="font-medium mb-2">Preview (showing first 5):</p>
                  <ul className="space-y-1 text-muted-foreground">
                    {dialogContent.items.map((item, i) => (
                      <li key={i}>• {item}</li>
                    ))}
                    {dialogContent.count > 5 && (
                      <li className="text-primary">
                        ...and {dialogContent.count - 5} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={isLoading || (dialogContent?.count ?? 0) === 0}
              className={actionType === "clear" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              {actionType === "archive" && "Archive"}
              {actionType === "duplicates" && "Remove Duplicates"}
              {actionType === "clear" && "Delete Insights"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
