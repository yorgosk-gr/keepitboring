import { useState, useEffect } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  CheckCircle, XCircle, Clock, AlertCircle, Tag, Plus,
  TrendingUp, TrendingDown, Pencil, Trash2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { usePositions } from "@/hooks/usePositions";
import type { JournalEntry, Lesson } from "@/hooks/useDecisionJournal";

const actionColors: Record<string, string> = {
  buy: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  sell: "bg-red-500/10 text-red-500 border-red-500/20",
};

const outcomeOptions = [
  { value: "pending", label: "Pending", icon: Clock, color: "text-muted-foreground" },
  { value: "reviewing", label: "Reviewing", icon: AlertCircle, color: "text-amber-500" },
  { value: "right", label: "Right", icon: CheckCircle, color: "text-emerald-500" },
  { value: "wrong", label: "Wrong", icon: XCircle, color: "text-red-500" },
  { value: "too_early", label: "Too Early", icon: Clock, color: "text-blue-500" },
  { value: "mixed", label: "Mixed", icon: AlertCircle, color: "text-purple-500" },
];

const categoryLabels: Record<string, string> = {
  bias: "Bias",
  timing: "Timing",
  sizing: "Sizing",
  thesis: "Thesis",
  process: "Process",
  other: "Other",
};

interface Props {
  entry: JournalEntry;
  lessons: Lesson[];
  onUpdate: (params: any) => void;
  onDelete: (id: string) => void;
  isUpdating: boolean;
  isDeleting: boolean;
  onCreateLesson: (params: { label: string; category: string; description?: string }) => Promise<Lesson>;
  onUseLesson: (lessonId: string) => void;
}

export function JournalDetail({
  entry,
  lessons,
  onUpdate,
  onDelete,
  isUpdating,
  isDeleting,
  onCreateLesson,
  onUseLesson,
}: Props) {
  const { positions } = usePositions();
  const [editingThesis, setEditingThesis] = useState(false);
  const [editingOutcome, setEditingOutcome] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showNewLesson, setShowNewLesson] = useState(false);
  const [newLesson, setNewLesson] = useState({ label: "", category: "other" });

  const [thesisForm, setThesisForm] = useState({
    action_type: entry.action_type ?? "buy",
    position_id: entry.position_id ?? "",
    reasoning: entry.reasoning ?? "",
    invalidation_triggers: entry.invalidation_triggers ?? "",
    confidence_level: entry.confidence_level ?? 5,
    entry_price: entry.entry_price?.toString() ?? "",
    entry_date: entry.entry_date ?? "",
  });

  const [outcomeForm, setOutcomeForm] = useState({
    outcome_status: entry.outcome_status ?? "pending",
    outcome_notes: entry.outcome_notes ?? "",
  });

  // Reset forms when switching entries
  useEffect(() => {
    setEditingThesis(false);
    setEditingOutcome(false);
    setThesisForm({
      action_type: entry.action_type ?? "buy",
      position_id: entry.position_id ?? "",
      reasoning: entry.reasoning ?? "",
      invalidation_triggers: entry.invalidation_triggers ?? "",
      confidence_level: entry.confidence_level ?? 5,
      entry_price: entry.entry_price?.toString() ?? "",
      entry_date: entry.entry_date ?? "",
    });
    setOutcomeForm({
      outcome_status: entry.outcome_status ?? "pending",
      outcome_notes: entry.outcome_notes ?? "",
    });
  }, [entry.id]);

  const comparePrice = entry.reviewed_at ? entry.price_at_review : entry.current_price;
  const priceReturn = entry.entry_price && comparePrice
    ? ((comparePrice - entry.entry_price) / entry.entry_price) * 100
    : null;

  const handleSaveThesis = () => {
    // Only use position_id if it resolves to a current position (guards against
    // FK violations when a position has been removed from the portfolio).
    const pos = positions.find(p => p.id === thesisForm.position_id);
    onUpdate({
      id: entry.id,
      action_type: thesisForm.action_type,
      position_id: pos?.id ?? null,
      ticker: pos?.ticker ?? entry.ticker ?? null,
      reasoning: thesisForm.reasoning,
      invalidation_triggers: thesisForm.invalidation_triggers,
      confidence_level: thesisForm.confidence_level,
      entry_price: thesisForm.entry_price ? parseFloat(thesisForm.entry_price) : null,
      entry_date: thesisForm.entry_date || null,
    });
    setEditingThesis(false);
  };

  const handleSaveOutcome = () => {
    onUpdate({
      id: entry.id,
      ...outcomeForm,
      price_at_review: entry.current_price,
    });
    setEditingOutcome(false);
  };

  const handleAddLesson = async () => {
    if (!newLesson.label.trim()) return;
    const created = await onCreateLesson({
      label: newLesson.label.trim(),
      category: newLesson.category,
    });
    const currentIds = entry.lesson_ids ?? [];
    onUpdate({ id: entry.id, lesson_ids: [...currentIds, created.id] });
    onUseLesson(created.id);
    setNewLesson({ label: "", category: "other" });
    setShowNewLesson(false);
  };

  const handleTagExistingLesson = (lessonId: string) => {
    const currentIds = entry.lesson_ids ?? [];
    if (currentIds.includes(lessonId)) return;
    onUpdate({ id: entry.id, lesson_ids: [...currentIds, lessonId] });
    onUseLesson(lessonId);
  };

  const entryLessons = lessons.filter(l => (entry.lesson_ids ?? []).includes(l.id));
  const availableLessons = lessons.filter(l => !(entry.lesson_ids ?? []).includes(l.id));

  return (
    <ScrollArea className="h-[70vh]">
      <div className="space-y-4 pr-2">
        {/* Header */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-bold text-lg">
                    {entry.position_ticker ?? entry.ticker ?? "—"}
                  </span>
                  <Badge variant="outline" className={cn("capitalize", actionColors[entry.action_type ?? ""] ?? "bg-muted text-muted-foreground")}>
                    {entry.action_type ?? "—"}
                  </Badge>
                  {entry.confidence_level && (
                    <span className="text-sm text-muted-foreground">
                      Confidence: {entry.confidence_level}/10
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(entry.created_at), "MMM d, yyyy 'at' h:mm a")}
                  {" · "}
                  {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                </p>
              </div>

              <div className="flex items-start gap-3">
                {/* Price Change */}
                {priceReturn !== null && (
                  <div className="text-right">
                    <div className="flex items-center gap-1.5">
                      {priceReturn >= 0 ? (
                        <TrendingUp className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-destructive" />
                      )}
                      <span className={cn("text-lg font-bold", priceReturn >= 0 ? "text-emerald-500" : "text-destructive")}>
                        {priceReturn >= 0 ? "+" : ""}{priceReturn.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ${entry.entry_price?.toFixed(2)} → ${comparePrice?.toFixed(2)}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-1">
                  {!editingThesis && (
                    <Button size="sm" variant="ghost" onClick={() => setEditingThesis(true)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)} title="Delete" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Thesis (editable) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Thesis
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {editingThesis ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Action</p>
                    <Select
                      value={thesisForm.action_type}
                      onValueChange={v => setThesisForm({ ...thesisForm, action_type: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="buy">Buy</SelectItem>
                        <SelectItem value="sell">Sell</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Position</p>
                    <Select
                      value={thesisForm.position_id}
                      onValueChange={v => setThesisForm({ ...thesisForm, position_id: v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
                      <SelectContent>
                        {positions.map(p => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.ticker} — {p.name ?? "Unknown"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Thesis</p>
                  <Textarea
                    value={thesisForm.reasoning}
                    onChange={e => setThesisForm({ ...thesisForm, reasoning: e.target.value })}
                    rows={5}
                    className="resize-none"
                  />
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">What Would Prove Me Wrong</p>
                  <Textarea
                    value={thesisForm.invalidation_triggers}
                    onChange={e => setThesisForm({ ...thesisForm, invalidation_triggers: e.target.value })}
                    rows={2}
                    className="resize-none"
                  />
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    Confidence: {thesisForm.confidence_level}/10
                  </p>
                  <Slider
                    value={[thesisForm.confidence_level]}
                    onValueChange={([v]) => setThesisForm({ ...thesisForm, confidence_level: v })}
                    min={1}
                    max={10}
                    step={1}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Entry Price</p>
                    <Input
                      type="number"
                      step="0.01"
                      value={thesisForm.entry_price}
                      onChange={e => setThesisForm({ ...thesisForm, entry_price: e.target.value })}
                      placeholder="e.g. 142.50"
                    />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Decision Date</p>
                    <Input
                      type="date"
                      value={thesisForm.entry_date}
                      onChange={e => setThesisForm({ ...thesisForm, entry_date: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveThesis} disabled={isUpdating}>
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingThesis(false)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                {entry.reasoning ? (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{entry.reasoning}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No thesis recorded</p>
                )}

                {entry.invalidation_triggers && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">What Would Prove Me Wrong</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{entry.invalidation_triggers}</p>
                  </div>
                )}

                {(entry.entry_price || entry.entry_date) && (
                  <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t border-border">
                    {entry.entry_price != null && (
                      <span>Entry: ${entry.entry_price.toFixed(2)}</span>
                    )}
                    {entry.entry_date && (
                      <span>Date: {format(new Date(entry.entry_date), "MMM d, yyyy")}</span>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        {/* Review */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Review
              </CardTitle>
              {!editingOutcome && (
                <Button size="sm" variant="outline" onClick={() => {
                  setOutcomeForm({
                    outcome_status: entry.outcome_status ?? "pending",
                    outcome_notes: entry.outcome_notes ?? "",
                  });
                  setEditingOutcome(true);
                }}>
                  {entry.reviewed_at ? "Edit Review" : "Review"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {editingOutcome ? (
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Outcome</p>
                  <div className="flex flex-wrap gap-2">
                    {outcomeOptions.map(opt => {
                      const Icon = opt.icon;
                      const isSelected = outcomeForm.outcome_status === opt.value;
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setOutcomeForm({ ...outcomeForm, outcome_status: opt.value })}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                            isSelected
                              ? `${opt.color} border-current bg-current/10`
                              : "text-muted-foreground border-border hover:border-muted-foreground"
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Reflection</p>
                  <Textarea
                    value={outcomeForm.outcome_notes}
                    onChange={e => setOutcomeForm({ ...outcomeForm, outcome_notes: e.target.value })}
                    placeholder="What happened? What did you learn?"
                    rows={4}
                    className="resize-none"
                  />
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveOutcome} disabled={isUpdating}>
                    Save Review
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingOutcome(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : entry.reviewed_at ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {(() => {
                    const opt = outcomeOptions.find(o => o.value === entry.outcome_status);
                    const Icon = opt?.icon ?? Clock;
                    return (
                      <Badge variant="outline" className={opt?.color}>
                        <Icon className="w-3 h-3 mr-1" />
                        {opt?.label ?? entry.outcome_status}
                      </Badge>
                    );
                  })()}
                  <span className="text-xs text-muted-foreground">
                    Reviewed {format(new Date(entry.reviewed_at), "MMM d, yyyy")}
                  </span>
                </div>
                {entry.outcome_notes && (
                  <p className="text-sm text-foreground whitespace-pre-wrap">{entry.outcome_notes}</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                Not reviewed yet — click "Review" to record the outcome
              </p>
            )}
          </CardContent>
        </Card>

        {/* Lessons */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />
                Lessons
              </CardTitle>
              <Button size="sm" variant="ghost" onClick={() => setShowNewLesson(!showNewLesson)}>
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {entryLessons.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {entryLessons.map(l => (
                  <Badge key={l.id} variant="outline" className="bg-primary/5">
                    {l.label}
                    <span className="ml-1 opacity-50 text-xs">{l.category}</span>
                  </Badge>
                ))}
              </div>
            )}

            {showNewLesson && (
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Input
                    placeholder="e.g. Sold too early, FOMO, Anchoring bias..."
                    value={newLesson.label}
                    onChange={e => setNewLesson({ ...newLesson, label: e.target.value })}
                    className="h-8 text-sm"
                    onKeyDown={e => e.key === "Enter" && handleAddLesson()}
                  />
                </div>
                <Select
                  value={newLesson.category}
                  onValueChange={v => setNewLesson({ ...newLesson, category: v })}
                >
                  <SelectTrigger className="w-24 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(categoryLabels).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="h-8" onClick={handleAddLesson} disabled={!newLesson.label.trim()}>
                  Add
                </Button>
              </div>
            )}

            {availableLessons.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Tag an existing pattern:</p>
                <div className="flex flex-wrap gap-1.5">
                  {availableLessons.slice(0, 10).map(l => (
                    <button
                      key={l.id}
                      onClick={() => handleTagExistingLesson(l.id)}
                      className="text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entryLessons.length === 0 && !showNewLesson && availableLessons.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">
                No lessons yet — create one to start tracking patterns
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this decision?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the journal entry, including the thesis, review, and tagged lessons. Cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onDelete(entry.id);
                setConfirmDelete(false);
              }}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ScrollArea>
  );
}
