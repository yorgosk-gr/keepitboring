import { useState } from "react";
import { Download, Trash2, RotateCcw, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import { HelpTooltip } from "@/components/common/HelpTooltip";

interface DataManagementSectionProps {
  onExportAll: () => Promise<void>;
  onExportDecisions: () => Promise<void>;
  onClearAlerts: () => Promise<void>;
  onResetRules: () => Promise<void>;
  onDeleteAll: () => Promise<void>;
}

export function DataManagementSection({
  onExportAll,
  onExportDecisions,
  onClearAlerts,
  onResetRules,
  onDeleteAll,
}: DataManagementSectionProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [isExportingDecisions, setIsExportingDecisions] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleExportAll = async () => {
    setIsExporting(true);
    await onExportAll();
    setIsExporting(false);
  };

  const handleExportDecisions = async () => {
    setIsExportingDecisions(true);
    await onExportDecisions();
    setIsExportingDecisions(false);
  };

  const handleDeleteAll = async () => {
    setIsDeleting(true);
    await onDeleteAll();
    setIsDeleting(false);
    setShowDeleteConfirm(false);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Data Management</CardTitle>
            <HelpTooltip content="Export your data for backup or import into other tools. Be careful with destructive actions." />
          </div>
          <CardDescription>Export, backup, and manage your data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Export Actions */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Export Data</h4>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={handleExportAll}
                disabled={isExporting}
                className="gap-2"
              >
                {isExporting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Export All Data (JSON)
              </Button>
              <Button
                variant="outline"
                onClick={handleExportDecisions}
                disabled={isExportingDecisions}
                className="gap-2"
              >
                {isExportingDecisions ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                Export Decisions (CSV)
              </Button>
            </div>
          </div>

          <Separator />

          {/* Clear Actions */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Clear Data</h4>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={onClearAlerts}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear All Alerts
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowResetConfirm(true)}
                className="gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                Reset to Default Rules
              </Button>
            </div>
          </div>

          <Separator />

          {/* Danger Zone */}
          <div className="space-y-3 p-4 rounded-lg border border-destructive/50 bg-destructive/5">
            <h4 className="text-sm font-medium text-destructive flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Danger Zone
            </h4>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone. All your positions, newsletters, decisions, and analysis history will be permanently deleted.
            </p>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete All Data
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Delete All Data
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you absolutely sure? This will permanently delete all your:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Portfolio positions</li>
                <li>Newsletters and insights</li>
                <li>Decision logs</li>
                <li>Philosophy rules</li>
                <li>Analysis history</li>
                <li>Reports</li>
              </ul>
              <p className="mt-2 font-medium">This action cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAll}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Yes, Delete Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reset Rules Confirmation */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to Default Rules</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all your custom philosophy rules and restore the default set. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onResetRules}>Reset Rules</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
