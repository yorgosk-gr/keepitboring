import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/form";
import { Loader2 } from "lucide-react";
import { type RuleFormData, type RuleEnforcement, type RuleScope, type RuleCategory } from "@/hooks/usePhilosophyRules";

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().min(1, "Description is required").max(500),
  rule_type: z.enum(["allocation", "position_size", "quality", "decision", "market"]),
  rule_enforcement: z.enum(["hard", "soft", "diagnostic"]),
  scope: z.enum(["portfolio", "cluster", "position"]),
  category: z.enum(["allocation", "size", "quality", "market", "behavior"]),
  metric: z.string().optional(),
  message_on_breach: z.string().optional(),
  threshold_min: z.number().min(0, "Threshold cannot be negative").max(100, "Threshold cannot exceed 100%").nullable().optional(),
  threshold_max: z.number().min(0, "Threshold cannot be negative").max(100, "Threshold cannot exceed 100%").nullable().optional(),
  source_books: z.string().optional(),
}).refine((data) => {
  if (data.threshold_min !== null && data.threshold_min !== undefined && 
      data.threshold_max !== null && data.threshold_max !== undefined) {
    return data.threshold_max >= data.threshold_min;
  }
  return true;
}, {
  message: "Max threshold must be greater than or equal to min threshold",
  path: ["threshold_max"],
});

type FormValues = z.infer<typeof formSchema>;

interface AddRuleModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: RuleFormData) => Promise<void>;
  isLoading: boolean;
}

export function AddRuleModal({ open, onClose, onSubmit, isLoading }: AddRuleModalProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      rule_type: "allocation",
      rule_enforcement: "hard",
      scope: "portfolio",
      category: "allocation",
      metric: "",
      message_on_breach: "",
      threshold_min: null,
      threshold_max: null,
      source_books: "",
    },
  });

  const handleSubmit = async (values: FormValues) => {
    await onSubmit({
      name: values.name,
      description: values.description,
      rule_type: values.rule_type,
      rule_enforcement: values.rule_enforcement as RuleEnforcement,
      scope: values.scope as RuleScope,
      category: values.category as RuleCategory,
      metric: values.metric || "",
      message_on_breach: values.message_on_breach || "",
      threshold_min: values.threshold_min,
      threshold_max: values.threshold_max,
      source_books: values.source_books
        ? values.source_books.split(",").map((s) => s.trim())
        : [],
    });
    form.reset();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground">Add Custom Rule</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rule Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Maximum Tech Exposure" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="rule_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="allocation">Allocation</SelectItem>
                      <SelectItem value="position_size">Position Size</SelectItem>
                      <SelectItem value="quality">Quality</SelectItem>
                      <SelectItem value="decision">Decision</SelectItem>
                      <SelectItem value="market">Market</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="scope"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="portfolio">Portfolio</SelectItem>
                        <SelectItem value="cluster">Cluster</SelectItem>
                        <SelectItem value="position">Position</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="allocation">Allocation</SelectItem>
                        <SelectItem value="size">Size</SelectItem>
                        <SelectItem value="quality">Quality</SelectItem>
                        <SelectItem value="market">Market</SelectItem>
                        <SelectItem value="behavior">Behavior</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="rule_enforcement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Enforcement</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="hard">Hard — affects score & triggers alerts</SelectItem>
                      <SelectItem value="soft">Soft — alerts only, no score impact</SelectItem>
                      <SelectItem value="diagnostic">Diagnostic — informational only</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe what this rule checks for..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="metric"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Metric</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., bonds_percent" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="message_on_breach"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Breach Message</FormLabel>
                    <FormControl>
                      <Input placeholder="Message shown on violation" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="threshold_min"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Min Threshold (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        placeholder="e.g., 10"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="threshold_max"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Threshold (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        placeholder="e.g., 25"
                        value={field.value ?? ""}
                        onChange={(e) =>
                          field.onChange(e.target.value ? parseFloat(e.target.value) : null)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="source_books"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Source Books (comma separated)</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Graham, Marks, Duke" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Add Rule
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
