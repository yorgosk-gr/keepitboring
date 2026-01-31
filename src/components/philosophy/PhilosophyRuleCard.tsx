import { useState } from "react";
import {
  CheckCircle,
  AlertTriangle,
  XCircle,
  Play,
  Trash2,
  Book,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
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
import { type PhilosophyRule, type RuleCheckResult } from "@/hooks/usePhilosophyRules";

const ruleTypeColors: Record<string, string> = {
  allocation: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  position_size: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  quality: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  decision: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  market: "bg-red-500/10 text-red-500 border-red-500/20",
};

const statusIcons = {
  passing: <CheckCircle className="w-5 h-5 text-emerald-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
  failing: <XCircle className="w-5 h-5 text-red-500" />,
};

const statusColors = {
  passing: "border-emerald-500/30 bg-emerald-500/5",
  warning: "border-amber-500/30 bg-amber-500/5",
  failing: "border-red-500/30 bg-red-500/5",
};

interface PhilosophyRuleCardProps {
  rule: PhilosophyRule;
  checkResult?: RuleCheckResult;
  onCheck: (rule: PhilosophyRule) => void;
  onUpdate: (id: string, updates: Partial<PhilosophyRule>) => void;
  onDelete: (id: string) => void;
  isChecking: boolean;
}

export function PhilosophyRuleCard({
  rule,
  checkResult,
  onCheck,
  onUpdate,
  onDelete,
  isChecking,
}: PhilosophyRuleCardProps) {
  const [showDelete, setShowDelete] = useState(false);
  const [editingThresholds, setEditingThresholds] = useState(false);
  const [thresholdMin, setThresholdMin] = useState(rule.threshold_min?.toString() ?? "");
  const [thresholdMax, setThresholdMax] = useState(rule.threshold_max?.toString() ?? "");

  const saveThresholds = () => {
    onUpdate(rule.id, {
      threshold_min: thresholdMin ? parseFloat(thresholdMin) : null,
      threshold_max: thresholdMax ? parseFloat(thresholdMax) : null,
    });
    setEditingThresholds(false);
  };

  return (
    <>
      <Card
        className={cn(
          "border-border transition-all",
          checkResult && statusColors[checkResult.status]
        )}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {checkResult && statusIcons[checkResult.status]}
              <h3 className="font-semibold text-foreground">{rule.name}</h3>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={rule.is_active}
                onCheckedChange={(checked) => onUpdate(rule.id, { is_active: checked })}
              />
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn("w-fit text-xs", ruleTypeColors[rule.rule_type || ""])}
          >
            {rule.rule_type?.replace("_", " ")}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{rule.description}</p>

          {/* Thresholds */}
          {(rule.threshold_min !== null || rule.threshold_max !== null) && (
            <div className="flex items-center gap-2">
              {editingThresholds ? (
                <>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Min:</span>
                    <Input
                      type="number"
                      value={thresholdMin}
                      onChange={(e) => setThresholdMin(e.target.value)}
                      className="h-7 w-16 text-xs"
                    />
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">Max:</span>
                    <Input
                      type="number"
                      value={thresholdMax}
                      onChange={(e) => setThresholdMax(e.target.value)}
                      className="h-7 w-16 text-xs"
                    />
                  </div>
                  <Button size="sm" variant="ghost" className="h-7" onClick={saveThresholds}>
                    Save
                  </Button>
                </>
              ) : (
                <button
                  onClick={() => setEditingThresholds(true)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {rule.threshold_min !== null && <span>Min: {rule.threshold_min}%</span>}
                  {rule.threshold_max !== null && <span>Max: {rule.threshold_max}%</span>}
                  <span className="text-primary">(edit)</span>
                </button>
              )}
            </div>
          )}

          {/* Check Result Message */}
          {checkResult && (
            <p
              className={cn(
                "text-xs font-medium",
                checkResult.status === "passing" && "text-emerald-500",
                checkResult.status === "warning" && "text-amber-500",
                checkResult.status === "failing" && "text-red-500"
              )}
            >
              {checkResult.message}
            </p>
          )}

          {/* Source Books */}
          {rule.source_books && rule.source_books.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Book className="w-3 h-3 text-muted-foreground" />
              {rule.source_books.map((book, i) => (
                <span key={i} className="text-xs text-muted-foreground">
                  {book}
                  {i < rule.source_books!.length - 1 && ","}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs"
              onClick={() => onCheck(rule)}
              disabled={!rule.is_active || isChecking}
            >
              {isChecking ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              Check Now
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{rule.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => onDelete(rule.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
