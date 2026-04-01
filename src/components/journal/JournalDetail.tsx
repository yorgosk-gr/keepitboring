import { useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  CheckCircle, XCircle, Clock, AlertCircle, Star, Tag, Plus,
  Lock, TrendingUp, TrendingDown, Check, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { JournalEntry, Assumption, Lesson } from "@/hooks/useDecisionJournal";

const actionColors: Record<string, string> = {
  buy: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  sell: "bg-red-500/10 text-red-500 border-red-500/20",
  trim: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  add: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  hold: "bg-muted text-muted-foreground border-border",
  rebalance: "bg-purple-500/10 text-purple-500 border-purple-500/20",
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
  isUpdating: boolean;
  onCreateLesson: (params: { label: string; category: string; description?: string }) => Promise<Lesson>;
  onUseLesson: (lessonId: string) => void;
}

export function JournalDetail({
  entry,
  lessons,
  onUpdate,
  isUpdating,
  onCreateLesson,
  onUseLesson,
}: Props) {
  const [editingOutcome, setEditingOutcome] = useState(false);
  const [outcomeForm, setOutcomeForm] = useState({
    outcome_status: entry.outcome_status ?? "pending",
    outcome_notes: entry.outcome_notes ?? "",
    surprise_notes: entry.surprise_notes ?? "",
    different_notes: entry.different_notes ?? "",
  });
  const [showNewLesson, setShowNewLesson] = useState(false);
  const [newLesson, setNewLesson] = useState({ label: "", category: "other" });

  const isLocked = !!entry.locked_at;
  const daysSinceDecision = Math.floor(
    (Date.now() - new Date(entry.created_at).getTime()) / 86_400_000
  );

  const comparePrice = entry.reviewed_at ? entry.price_at_review : entry.current_price;
  const priceReturn = entry.entry_price && comparePrice
    ? ((comparePrice - entry.entry_price) / entry.entry_price) * 100
    : null;

  const handleSaveOutcome = () => {
    onUpdate({
      id: entry.id,
      ...outcomeForm,
      price_at_review: entry.current_price,
    });
    setEditingOutcome(false);
  };

  const toggleAssumption = (idx: number) => {
    const updated = [...(entry.assumptions ?? [])];
    updated[idx] = { ...updated[idx], invalidated: !updated[idx].invalidated };
    onUpdate({ id: entry.id, assumptions: updated });
  };

  const handleAddLesson = async () => {
    if (!newLesson.label.trim()) return;
    const created = await onCreateLesson({
      label: newLesson.label.trim(),
      category: newLesson.category,
    });
    // Add lesson to this entry
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
                    {entry.position_ticker ?? entry.ticker ?? "Portfolio-wide"}
                  </span>
                  <Badge variant="outline" className={cn("capitalize", actionColors[entry.action_type ?? "hold"])}>
                    {entry.action_type ?? "hold"}
                  </Badge>
                  {entry.confidence_level && (
                    <span className="text-sm text-muted-foreground">
                      Confidence: {entry.confidence_level}/10
                    </span>
                  )}
                  {isLocked && (
                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {format(new Date(entry.created_at), "MMM d, yyyy 'at' h:mm a")}
                  {" · "}
                  {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}
                </p>
              </div>

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
                    ${entry.entry_price?.toFixed(2)} → ${entry.current_price?.toFixed(2)}
                  </p>
                </div>
              )}
            </div>

            {entry.expected_timeframe && (
              <div className="mt-2">
                <Badge variant="secondary" className="text-xs">
                  <Clock className="w-3 h-3 mr-1" />
                  Expected: {entry.expected_timeframe}
                  {daysSinceDecision > 0 && ` · ${daysSinceDecision}d elapsed`}
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* What I Thought */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              What I Thought
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {entry.reasoning && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Thesis</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{entry.reasoning}</p>
              </div>
            )}

            {entry.information_set && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Information at Decision Time</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{entry.information_set}</p>
              </div>
            )}

            {entry.invalidation_triggers && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">What Would Make Me Wrong</p>
                <p className="text-sm text-foreground">{entry.invalidation_triggers}</p>
              </div>
            )}

            {entry.probability_estimate && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Probability Estimate</p>
                <p className="text-sm text-foreground">{entry.probability_estimate}</p>
              </div>
            )}

            {/* Assumptions Checklist */}
            {entry.assumptions && entry.assumptions.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Key Assumptions</p>
                <div className="space-y-1.5">
                  {entry.assumptions.map((a: Assumption, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => toggleAssumption(idx)}
                      className={cn(
                        "flex items-center gap-2 w-full text-left p-2 rounded text-sm transition-colors",
                        a.invalidated
                          ? "bg-red-500/5 line-through text-muted-foreground"
                          : "bg-secondary/30 text-foreground hover:bg-secondary/50"
                      )}
                    >
                      {a.invalidated ? (
                        <X className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
                      ) : (
                        <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      )}
                      {a.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* What Actually Happened */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                What Actually Happened
              </CardTitle>
              {!editingOutcome && (
                <Button size="sm" variant="outline" onClick={() => {
                  setOutcomeForm({
                    outcome_status: entry.outcome_status ?? "pending",
                    outcome_notes: entry.outcome_notes ?? "",
                    surprise_notes: entry.surprise_notes ?? "",
                    different_notes: entry.different_notes ?? "",
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
                  <p className="text-xs font-medium text-muted-foreground mb-1">Outcome Notes</p>
                  <Textarea
                    value={outcomeForm.outcome_notes}
                    onChange={e => setOutcomeForm({ ...outcomeForm, outcome_notes: e.target.value })}
                    placeholder="What was the result? Was the process sound?"
                    rows={3}
                    className="resize-none"
                  />
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">What Surprised Me</p>
                  <Textarea
                    value={outcomeForm.surprise_notes}
                    onChange={e => setOutcomeForm({ ...outcomeForm, surprise_notes: e.target.value })}
                    placeholder="What happened that you didn't expect?"
                    rows={2}
                    className="resize-none"
                  />
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">What I'd Do Differently</p>
                  <Textarea
                    value={outcomeForm.different_notes}
                    onChange={e => setOutcomeForm({ ...outcomeForm, different_notes: e.target.value })}
                    placeholder="With hindsight, what would you change about the process?"
                    rows={2}
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
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Outcome</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{entry.outcome_notes}</p>
                  </div>
                )}
                {entry.surprise_notes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">What Surprised Me</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{entry.surprise_notes}</p>
                  </div>
                )}
                {entry.different_notes && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">What I'd Do Differently</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{entry.different_notes}</p>
                  </div>
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
            {/* Tagged lessons */}
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

            {/* New lesson form */}
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

            {/* Existing lessons to tag */}
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
    </ScrollArea>
  );
}
