import { useState, useEffect } from "react";
import { format, subDays } from "date-fns";
import { Calendar, Filter, BookOpen, AlertCircle, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDecisionLogs, type DecisionLog } from "@/hooks/useDecisionLogs";
import { usePositions } from "@/hooks/usePositions";
import { DecisionCard } from "@/components/decisions/DecisionCard";
import { LogDecisionModal } from "@/components/decisions/LogDecisionModal";
import { toast } from "sonner";

export function DecisionLogView() {
  const { positions } = usePositions();
  const [filters, setFilters] = useState({
    action_type: "all",
    position_id: "all",
    start_date: undefined as Date | undefined,
    end_date: undefined as Date | undefined,
  });

  const { decisions, isLoading, addOutcome, isAddingOutcome, getDecisionsForReview } =
    useDecisionLogs({
      action_type: filters.action_type,
      position_id: filters.position_id,
      start_date: filters.start_date,
      end_date: filters.end_date,
    });

  const [showLogModal, setShowLogModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDecisions, setReviewDecisions] = useState<DecisionLog[]>([]);
  const [isLoadingReview, setIsLoadingReview] = useState(false);

  // Check for decisions needing review on mount
  useEffect(() => {
    checkForReview();
  }, []);

  const checkForReview = async () => {
    try {
      setIsLoadingReview(true);
      const decisionsToReview = await getDecisionsForReview();
      if (decisionsToReview.length > 0) {
        setReviewDecisions(decisionsToReview);
        // Show prompt after a short delay
        setTimeout(() => {
          toast.info(
            `📊 ${decisionsToReview.length} decision(s) from 30 days ago ready for review`,
            {
              action: {
                label: "Review Now",
                onClick: () => setShowReviewModal(true),
              },
              duration: 10000,
            }
          );
        }, 2000);
      }
    } catch (error) {
      console.error("Failed to fetch review decisions:", error);
    } finally {
      setIsLoadingReview(false);
    }
  };

  const actionTypes = [
    { value: "all", label: "All Actions" },
    { value: "buy", label: "Buy" },
    { value: "sell", label: "Sell" },
    { value: "trim", label: "Trim" },
    { value: "add", label: "Add" },
    { value: "hold", label: "Hold" },
    { value: "rebalance", label: "Rebalance" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Decision Log</h2>
          <p className="text-sm text-muted-foreground">
            Track your investment decisions and learn from outcomes
          </p>
        </div>
        <div className="flex gap-2">
          {reviewDecisions.length > 0 && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => setShowReviewModal(true)}
            >
              <Calendar className="w-4 h-4" />
              Review ({reviewDecisions.length})
            </Button>
          )}
          <Button className="gap-2" onClick={() => setShowLogModal(true)}>
            <BookOpen className="w-4 h-4" />
            Log Decision
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 p-4 rounded-lg bg-secondary/50 border border-border">
        <Filter className="w-4 h-4 text-muted-foreground self-center" />
        <Select
          value={filters.action_type}
          onValueChange={(v) => setFilters({ ...filters, action_type: v })}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {actionTypes.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.position_id}
          onValueChange={(v) => setFilters({ ...filters, position_id: v })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Positions</SelectItem>
            <SelectItem value="portfolio-wide">Portfolio-wide</SelectItem>
            {positions.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.ticker}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Timeline */}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : decisions.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">No decisions logged yet</h3>
          <p className="text-muted-foreground mb-4">
            Start logging your investment decisions to build a learning record
          </p>
          <Button onClick={() => setShowLogModal(true)}>Log Your First Decision</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {decisions.map((decision) => (
            <DecisionCard
              key={decision.id}
              decision={decision}
              onAddOutcome={(id, outcome) => addOutcome({ id, outcome_notes: outcome })}
              isAddingOutcome={isAddingOutcome}
            />
          ))}
        </div>
      )}

      {/* Log Decision Modal */}
      <LogDecisionModal open={showLogModal} onClose={() => setShowLogModal(false)} />

      {/* Review Modal */}
      <ReviewModal
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        decisions={reviewDecisions}
        onAddOutcome={addOutcome}
        isAddingOutcome={isAddingOutcome}
      />
    </div>
  );
}

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
  decisions: DecisionLog[];
  onAddOutcome: (params: { id: string; outcome_notes: string }) => void;
  isAddingOutcome: boolean;
}

function ReviewModal({
  open,
  onClose,
  decisions,
  onAddOutcome,
  isAddingOutcome,
}: ReviewModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responses, setResponses] = useState<Record<string, { process: string; bias: string; lessons: string }>>({});

  const currentDecision = decisions[currentIndex];

  if (!currentDecision) return null;

  const saveReview = () => {
    const response = responses[currentDecision.id];
    if (response) {
      const outcome = `**Process Evaluation:**\n${response.process}\n\n**Resulting Bias Check:**\n${response.bias}\n\n**Lessons Learned:**\n${response.lessons}`;
      onAddOutcome({ id: currentDecision.id, outcome_notes: outcome });
    }

    if (currentIndex < decisions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      toast.success("Review complete! Great work on reflecting on your decisions.");
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Monthly Decision Review
            <Badge variant="secondary" className="ml-2">
              {currentIndex + 1} of {decisions.length}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="space-y-4 p-1">
            {/* Decision Summary */}
            <div className="p-4 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline" className="capitalize">
                  {currentDecision.action_type}
                </Badge>
                <Badge variant="outline" className="font-mono">
                  {currentDecision.position_ticker || "Portfolio-wide"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(currentDecision.created_at), "MMM d, yyyy")}
                </span>
              </div>
              <p className="text-sm text-foreground">{currentDecision.reasoning}</p>
              {currentDecision.probability_estimate && (
                <p className="text-xs text-muted-foreground mt-2">
                  Probability: {currentDecision.probability_estimate}
                </p>
              )}
            </div>

            {/* Review Questions */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  Was the process good regardless of outcome?
                </label>
                <Textarea
                  value={responses[currentDecision.id]?.process || ""}
                  onChange={(e) =>
                    setResponses({
                      ...responses,
                      [currentDecision.id]: {
                        ...responses[currentDecision.id],
                        process: e.target.value,
                      },
                    })
                  }
                  placeholder="Evaluate the quality of your decision-making process..."
                  rows={2}
                  className="mt-2 resize-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-500" />
                  Any resulting bias detected?
                </label>
                <Textarea
                  value={responses[currentDecision.id]?.bias || ""}
                  onChange={(e) =>
                    setResponses({
                      ...responses,
                      [currentDecision.id]: {
                        ...responses[currentDecision.id],
                        bias: e.target.value,
                      },
                    })
                  }
                  placeholder="Are you judging the decision based on outcome rather than process?"
                  rows={2}
                  className="mt-2 resize-none"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  Lessons learned?
                </label>
                <Textarea
                  value={responses[currentDecision.id]?.lessons || ""}
                  onChange={(e) =>
                    setResponses({
                      ...responses,
                      [currentDecision.id]: {
                        ...responses[currentDecision.id],
                        lessons: e.target.value,
                      },
                    })
                  }
                  placeholder="What would you do differently? What worked well?"
                  rows={2}
                  className="mt-2 resize-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-between pt-4 border-t border-border">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
              <div className="flex gap-2">
                {currentIndex > 0 && (
                  <Button variant="outline" onClick={() => setCurrentIndex(currentIndex - 1)}>
                    Previous
                  </Button>
                )}
                <Button onClick={saveReview} disabled={isAddingOutcome}>
                  {currentIndex < decisions.length - 1 ? "Save & Next" : "Complete Review"}
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
