import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { usePositions, type Position } from "@/hooks/usePositions";
import type { RecommendedAction } from "@/hooks/usePortfolioAnalysis";
const formSchema = z.object({
  action_type: z.enum(["buy", "sell", "trim", "add", "hold", "rebalance"]),
  position_id: z.string().min(1, "Select a position"),
  reasoning: z.string().min(50, "Please provide at least 50 characters of reasoning"),
  confidence_level: z.number().min(1).max(10),
  probability_estimate: z.string().optional(),
  alternative_scenarios: z.string().optional(),
  information_set: z.string().min(1, "Required: What information did you have?"),
  invalidation_triggers: z.string().min(1, "Required: What would make this decision wrong?"),
  reversal_information: z.string().optional(),
  newsletter_insight_ids: z.array(z.string()).optional(),
  tags: z.string().optional(),
  entry_price: z.string().optional(),
  entry_date: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface LogDecisionModalProps {
  open: boolean;
  onClose: () => void;
  position?: Position | null;
  defaultAction?: string;
  recommendation?: RecommendedAction | null;
}

export function LogDecisionModal({
  open,
  onClose,
  position,
  defaultAction,
  recommendation,
}: LogDecisionModalProps) {
  const { user } = useAuth();
  const { positions } = usePositions();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      action_type: (defaultAction as FormValues["action_type"]) || "hold",
      position_id: position?.id || "portfolio-wide",
      reasoning: "",
      confidence_level: 5,
      probability_estimate: "",
      alternative_scenarios: "",
      information_set: "",
      invalidation_triggers: "",
      reversal_information: "",
      newsletter_insight_ids: [],
      tags: "",
      entry_price: "",
      entry_date: new Date().toISOString().split("T")[0],
    },
  });

  // Helper to extract action type from recommendation action text
  const extractActionType = (actionText: string): FormValues["action_type"] => {
    const lower = actionText.toLowerCase();
    if (lower.includes("trim") || lower.includes("reduce")) return "trim";
    if (lower.includes("sell") || lower.includes("exit")) return "sell";
    if (lower.includes("buy") || lower.includes("purchase")) return "buy";
    if (lower.includes("add") || lower.includes("increase")) return "add";
    if (lower.includes("rebalance")) return "rebalance";
    return "hold";
  };

  // Helper to extract ticker from recommendation action text
  const extractTicker = (actionText: string): string | null => {
    // Look for common patterns like "Review TSLA", "Trim NVDA position", etc.
    const tickerMatch = actionText.match(/\b([A-Z]{1,5})\b/);
    return tickerMatch ? tickerMatch[1] : null;
  };

  // Update form when position, defaultAction, or recommendation prop changes
  useEffect(() => {
    if (position) {
      form.setValue("position_id", position.id);
    }
    if (defaultAction) {
      form.setValue("action_type", defaultAction as FormValues["action_type"]);
    }
    
    // Pre-fill from recommendation
    if (recommendation) {
      // Extract action type from recommendation text
      const actionType = extractActionType(recommendation.action);
      form.setValue("action_type", actionType);
      
      // Try to find matching position from ticker in action text
      const ticker = extractTicker(recommendation.action);
      if (ticker) {
        const matchingPosition = positions.find(
          p => p.ticker.toUpperCase() === ticker.toUpperCase()
        );
        if (matchingPosition) {
          form.setValue("position_id", matchingPosition.id);
        }
      }
      
      // Pre-fill reasoning with the recommendation action and reasoning
      const prefillReasoning = `Based on analysis recommendation:\n\nAction: ${recommendation.action}\n\nReasoning: ${recommendation.reasoning}`;
      form.setValue("reasoning", prefillReasoning);
      
      // Set confidence based on recommendation confidence
      const confidenceMap = { high: 8, medium: 6, low: 4 };
      form.setValue("confidence_level", confidenceMap[recommendation.confidence] || 5);
    }
  }, [position, defaultAction, recommendation, positions]);

  const handleSubmit = async (values: FormValues) => {
    if (!user) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("decision_log").insert({
        user_id: user.id,
        position_id: values.position_id === "portfolio-wide" ? null : values.position_id,
        action_type: values.action_type,
        reasoning: values.reasoning,
        confidence_level: values.confidence_level,
        probability_estimate: values.probability_estimate || null,
        information_set: `${values.information_set}\n\n**Alternative Scenarios:**\n${values.alternative_scenarios || "N/A"}\n\n**Reversal Triggers:**\n${values.reversal_information || "N/A"}`,
        invalidation_triggers: values.invalidation_triggers,
        ticker: values.position_id !== "portfolio-wide"
          ? positions.find(p => p.id === values.position_id)?.ticker ?? null
          : null,
        entry_price: values.entry_price ? parseFloat(values.entry_price) : null,
        entry_date: values.entry_date || null,
      });

      if (error) throw error;

      toast.success("Decision logged successfully");
      queryClient.invalidateQueries({ queryKey: ["decision_logs"] });
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
    { value: "trim", label: "Trim", color: "text-amber-500" },
    { value: "add", label: "Add", color: "text-blue-500" },
    { value: "hold", label: "Hold", color: "text-muted-foreground" },
    { value: "rebalance", label: "Rebalance", color: "text-purple-500" },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
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
            <form onSubmit={form.handleSubmit(handleSubmit)} className="p-6 pt-4 space-y-6">
              {/* Core Fields */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="action_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Action Type *</FormLabel>
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
                          <SelectItem value="portfolio-wide">📊 Portfolio-wide</SelectItem>
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
                    <FormLabel>Reasoning * (min 50 chars)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Why are you making this decision? Be specific about your thesis..."
                        rows={4}
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

              {/* Probabilistic Fields */}
              <Accordion type="single" collapsible defaultValue="probabilistic">
                <AccordionItem value="probabilistic" className="border-border">
                  <AccordionTrigger className="text-sm font-medium">
                    Probabilistic Thinking
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4">
                    <FormField
                      control={form.control}
                      name="confidence_level"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Confidence Level: {field.value}/10
                          </FormLabel>
                          <FormControl>
                            <Slider
                              value={[field.value]}
                              onValueChange={([v]) => field.onChange(v)}
                              min={1}
                              max={10}
                              step={1}
                              className="py-4"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            1 = pure speculation, 10 = near certainty
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="probability_estimate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Probability Estimate</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="e.g., 60% chance of 20% return over 2 years"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            X% chance of Y outcome over Z timeframe
                          </FormDescription>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="alternative_scenarios"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Alternative Scenarios Considered</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="What other outcomes did you consider? What are the bear/bull cases?"
                              rows={2}
                              className="resize-none"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Anti-Resulting Fields */}
                <AccordionItem value="anti-resulting" className="border-border">
                  <AccordionTrigger className="text-sm font-medium">
                    Anti-Resulting (Process Quality)
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4">
                    <FormField
                      control={form.control}
                      name="information_set"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Information Available at Decision Time *</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="What did you know when making this decision? List key data points, reports, analysis..."
                              rows={3}
                              className="resize-none"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            This helps evaluate process vs outcome later
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
                          <FormLabel>What Would Make This Decision Wrong? *</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="Define specific conditions that would prove your thesis wrong..."
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
                      name="reversal_information"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>What New Information Would Cause Reversal?</FormLabel>
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder="What would you need to see to change your mind?"
                              rows={2}
                              className="resize-none"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>

                {/* Optional Fields */}
                <AccordionItem value="optional" className="border-border">
                  <AccordionTrigger className="text-sm font-medium">
                    Optional: Tags & Links
                  </AccordionTrigger>
                  <AccordionContent className="space-y-4 pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="entry_price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Entry Price (for outcome tracking)</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="e.g. 142.50"
                                type="number"
                                step="0.01"
                              />
                            </FormControl>
                            <FormDescription className="text-xs">
                              Used to track 30/90/180 day returns
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

                    <FormField
                      control={form.control}
                      name="tags"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tags</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="e.g., earnings, macro, valuation (comma separated)"
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>

              {/* Submit */}
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
