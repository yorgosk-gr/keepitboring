import { useState, useEffect, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, BookOpen } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePositions, type Position } from "@/hooks/usePositions";
import { PreTradeChecklist } from "@/components/decisions/PreTradeChecklist";
import type { RecommendedAction } from "@/hooks/usePortfolioAnalysis";

const formSchema = z.object({
  action_type: z.enum(["buy", "sell"]),
  position_id: z.string().min(1, "Select a position"),
  reasoning: z.string().min(50, "Please provide at least 50 characters of reasoning"),
  invalidation_triggers: z.string().min(1, "Required: What would make this decision wrong?"),
  confidence_level: z.number().min(1).max(10),
  entry_price: z.string().optional(),
  entry_date: z.string().optional(),
  executed_shares: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface LogDecisionModalProps {
  open: boolean;
  onClose: () => void;
  position?: Position | null;
  defaultAction?: string;
  recommendation?: RecommendedAction | null;
  sourceAnalysisId?: string | null;
  sourceActionIndex?: number | null;
}

export function LogDecisionModal({
  open,
  onClose,
  position,
  defaultAction,
  recommendation,
  sourceAnalysisId,
  sourceActionIndex,
}: LogDecisionModalProps) {
  const { user } = useAuth();
  const { positions } = usePositions();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);
  const [checklistPassed, setChecklistPassed] = useState(false);
  const didPrefillRef = useRef(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      action_type: (defaultAction as FormValues["action_type"]) || "buy",
      position_id: position?.id || "",
      reasoning: "",
      invalidation_triggers: "",
      confidence_level: 5,
      entry_price: "",
      entry_date: new Date().toISOString().split("T")[0],
      executed_shares: "",
    },
  });

  // Always show pre-trade checklist — every log is a buy or sell.
  useEffect(() => {
    if (open && !checklistPassed) {
      setShowChecklist(true);
    }
    if (!open) {
      setChecklistPassed(false);
      setShowChecklist(false);
      didPrefillRef.current = false;
    }
  }, [open, checklistPassed]);

  // Helper to extract action type from recommendation action text (buy/sell only)
  const extractActionType = (actionText: string): FormValues["action_type"] => {
    const lower = actionText.toLowerCase();
    if (lower.includes("sell") || lower.includes("exit") || lower.includes("trim") || lower.includes("reduce")) return "sell";
    return "buy";
  };

  const ACTION_VERBS = /^(BUY|SELL|HOLD|TRIM|EXIT|REDUCE|ADD|ROTATE|REBALANCE)$/i;

  const extractTicker = (rec: RecommendedAction): string | null => {
    for (const trade of rec.trades_involved ?? []) {
      const cleaned = trade.replace(/^(BUY|SELL|HOLD)\s+/i, "").trim();
      const m = cleaned.match(/\b([A-Z][A-Z0-9]{0,5})\b/);
      if (m && !ACTION_VERBS.test(m[1])) return m[1];
    }
    const matches = rec.action.match(/\b[A-Z][A-Z0-9]{0,5}\b/g) ?? [];
    for (const m of matches) if (!ACTION_VERBS.test(m)) return m;
    return null;
  };

  // One-shot prefill: runs once per open. Guarded so React Query refetches
  // (positions) don't stomp in-flight user edits.
  useEffect(() => {
    if (!open || didPrefillRef.current) return;
    if (!position && !defaultAction && !recommendation) return;
    if (recommendation && positions.length === 0) return; // wait for positions

    if (position) form.setValue("position_id", position.id);
    if (defaultAction) form.setValue("action_type", defaultAction as FormValues["action_type"]);

    if (recommendation) {
      form.setValue("action_type", extractActionType(recommendation.action));

      const ticker = extractTicker(recommendation);
      const matchingPosition = ticker
        ? positions.find(p => p.ticker.toUpperCase() === ticker.toUpperCase())
        : null;
      if (matchingPosition) {
        form.setValue("position_id", matchingPosition.id);
        if (matchingPosition.current_price) {
          form.setValue("entry_price", matchingPosition.current_price.toFixed(2));
        }
      }

      form.setValue(
        "reasoning",
        `Based on analysis recommendation:\n\nAction: ${recommendation.action}\n\nReasoning: ${recommendation.reasoning}`,
      );

      const confidenceMap = { high: 8, medium: 6, low: 4 };
      form.setValue("confidence_level", confidenceMap[recommendation.confidence] || 5);

      form.setValue(
        "invalidation_triggers",
        "Thesis-level signal contradicts the recommendation reasoning, or underlying allocation breach is resolved by other means.",
      );
    }

    didPrefillRef.current = true;
  }, [open, position, defaultAction, recommendation, positions]);

  const handleSubmit = async (values: FormValues) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("decision_log").insert({
        user_id: user.id,
        position_id: values.position_id,
        action_type: values.action_type,
        reasoning: values.reasoning,
        invalidation_triggers: values.invalidation_triggers,
        confidence_level: values.confidence_level,
        ticker: positions.find(p => p.id === values.position_id)?.ticker ?? null,
        entry_price: values.entry_price ? parseFloat(values.entry_price) : null,
        entry_date: values.entry_date || null,
        executed_shares: values.executed_shares ? parseFloat(values.executed_shares) : null,
        executed_price: values.entry_price ? parseFloat(values.entry_price) : null,
        source_analysis_id: sourceAnalysisId ?? null,
        source_action_index: sourceActionIndex ?? null,
      } as any);

      if (error) throw error;

      toast.success("Decision logged successfully");
      queryClient.invalidateQueries({ queryKey: ["decision_logs"] });
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      form.reset();
      onClose();
    } catch (error: any) {
      toast.error("Failed to log decision: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const actionTypes = [
    { value: "buy", label: "Buy", color: "text-emerald-500" },
    { value: "sell", label: "Sell", color: "text-red-500" },
  ];

  const watchedPositionId = useWatch({ control: form.control, name: "position_id" });
  const watchedActionType = useWatch({ control: form.control, name: "action_type" });
  const selectedPosition = positions.find(p => p.id === watchedPositionId);
  const selectedTicker = selectedPosition?.ticker ?? null;

  if (showChecklist && !checklistPassed) {
    return (
      <PreTradeChecklist
        open={open}
        ticker={selectedTicker}
        actionType={watchedActionType || (defaultAction ?? "buy")}
        positionId={selectedPosition?.id ?? null}
        onProceed={() => {
          setShowChecklist(false);
          setChecklistPassed(true);
        }}
        onCancel={() => {
          setShowChecklist(false);
          onClose();
        }}
      />
    );
  }

  return (
    <Dialog open={open && checklistPassed} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] bg-card border-border p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Log Decision
            {position && (
              <Badge variant="outline" className="ml-2">
                {position.ticker}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-100px)]">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="p-6 pt-4 space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="action_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Action *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {actionTypes.map((action) => (
                            <SelectItem key={action.value} value={action.value}>
                              <span className={action.color}>{action.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="position_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Position *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select position" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {positions.map((pos) => (
                            <SelectItem key={pos.id} value={pos.id}>
                              {pos.ticker} - {pos.name || "Unknown"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="reasoning"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Thesis *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Why are you making this decision? What's the thesis?"
                        rows={5}
                        className="resize-none"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {field.value.length}/50 characters minimum
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="invalidation_triggers"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>What Would Prove Me Wrong? *</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Specific conditions that would invalidate the thesis..."
                        rows={2}
                        className="resize-none"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confidence_level"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confidence: {field.value}/10</FormLabel>
                    <FormControl>
                      <Slider
                        value={[field.value]}
                        onValueChange={([v]) => field.onChange(v)}
                        min={1}
                        max={10}
                        step={1}
                        className="py-3"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">
                      1 = pure speculation, 10 = near certainty
                    </FormDescription>
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="entry_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Executed Price</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g. 142.50"
                          type="number"
                          step="0.01"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Pre-filled from market
                      </FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="executed_shares"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Shares</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="e.g. 25"
                          type="number"
                          step="0.0001"
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Optional, for track record
                      </FormDescription>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="entry_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Decision Date</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Log Decision
                </Button>
              </div>
            </form>
          </Form>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
