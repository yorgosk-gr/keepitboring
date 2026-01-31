import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { usePositions } from "./usePositions";

export interface PhilosophyRule {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  rule_type: string | null;
  threshold_min: number | null;
  threshold_max: number | null;
  is_active: boolean;
  source_books: string[] | null;
  created_at: string;
}

export interface RuleCheckResult {
  rule: PhilosophyRule;
  status: "passing" | "warning" | "failing";
  currentValue: number | null;
  message: string;
}

export interface RuleFormData {
  name: string;
  description: string;
  rule_type: string;
  threshold_min?: number | null;
  threshold_max?: number | null;
  source_books?: string[];
}

const DEFAULT_RULES: Omit<PhilosophyRule, "id" | "user_id" | "created_at">[] = [
  // Allocation Rules
  { name: "Stock Allocation", rule_type: "allocation", threshold_min: 15, threshold_max: 25, description: "Individual stocks should be 15-25% of portfolio", source_books: ["Graham", "Malkiel"], is_active: true },
  { name: "ETF Allocation", rule_type: "allocation", threshold_min: 75, threshold_max: 85, description: "ETFs should be 75-85% of portfolio", source_books: ["Malkiel", "Siegel"], is_active: true },
  { name: "Minimum Equity", rule_type: "allocation", threshold_min: 60, threshold_max: null, description: "Maintain at least 60% in equities", source_books: ["Siegel"], is_active: true },
  { name: "Cash Limit", rule_type: "allocation", threshold_min: null, threshold_max: 10, description: "Cash should not exceed 10%", source_books: ["Siegel", "Erkan"], is_active: true },
  { name: "Sector Limit", rule_type: "allocation", threshold_min: null, threshold_max: 25, description: "No sector should exceed 25%", source_books: ["Graham", "Marks"], is_active: true },
  // Position Size Rules
  { name: "Single Stock Limit", rule_type: "position_size", threshold_min: null, threshold_max: 8, description: "No single stock over 8%", source_books: ["Graham", "Duke"], is_active: true },
  { name: "Theme ETF Limit", rule_type: "position_size", threshold_min: null, threshold_max: 15, description: "Non-broad ETFs max 15%", source_books: ["Marks"], is_active: true },
  { name: "Broad ETF Limit", rule_type: "position_size", threshold_min: null, threshold_max: 35, description: "Global ETFs can go to 35%", source_books: ["Malkiel"], is_active: true },
  { name: "Country ETF Limit", rule_type: "position_size", threshold_min: null, threshold_max: 10, description: "Single country (ex-US) max 10%", source_books: ["Marks"], is_active: true },
  // Quality Rules
  { name: "Earnings Yield Floor", rule_type: "quality", threshold_min: 5, threshold_max: null, description: "Prefer stocks with >5% earnings yield", source_books: ["Greenblatt"], is_active: true },
  { name: "ROIC Floor", rule_type: "quality", threshold_min: 15, threshold_max: null, description: "Prefer stocks with >15% ROIC", source_books: ["Greenblatt", "Thorndike"], is_active: true },
  // Decision Rules
  { name: "Bet Type Required", rule_type: "decision", threshold_min: null, threshold_max: null, description: "Positions >3% must have declared bet type", source_books: ["Duke"], is_active: true },
  { name: "Confidence Required", rule_type: "decision", threshold_min: null, threshold_max: null, description: "All positions need confidence rating", source_books: ["Duke"], is_active: true },
  { name: "Thesis Required", rule_type: "decision", threshold_min: null, threshold_max: null, description: "Stock positions need written thesis", source_books: ["Duke", "Marks"], is_active: true },
  { name: "Invalidation Required", rule_type: "decision", threshold_min: null, threshold_max: null, description: "Must define what would invalidate thesis", source_books: ["Duke"], is_active: true },
  // Market Rules
  { name: "Bubble Language Alert", rule_type: "market", threshold_min: null, threshold_max: null, description: "Flag euphoria language in newsletters", source_books: ["Kindleberger", "Taleb"], is_active: true },
  { name: "Extreme Consensus Alert", rule_type: "market", threshold_min: null, threshold_max: null, description: "Flag when >80% newsletters agree", source_books: ["Marks", "Lefèvre"], is_active: true },
];

export function usePhilosophyRules() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { positions } = usePositions();

  const rulesQuery = useQuery({
    queryKey: ["philosophy_rules", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("philosophy_rules")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as PhilosophyRule[];
    },
    enabled: !!user,
  });

  const seedDefaultRulesMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");

      // Check if rules already exist
      const { data: existing } = await supabase
        .from("philosophy_rules")
        .select("id")
        .limit(1);

      if (existing && existing.length > 0) {
        return { seeded: false };
      }

      // Insert default rules
      const rulesToInsert = DEFAULT_RULES.map((rule) => ({
        ...rule,
        user_id: user.id,
      }));

      const { error } = await supabase.from("philosophy_rules").insert(rulesToInsert);
      if (error) throw error;

      return { seeded: true };
    },
    onSuccess: (result) => {
      if (result.seeded) {
        queryClient.invalidateQueries({ queryKey: ["philosophy_rules"] });
        toast.success("Default rules loaded from 13 investment books");
      }
    },
    onError: (error) => {
      toast.error("Failed to seed rules: " + error.message);
    },
  });

  const addRuleMutation = useMutation({
    mutationFn: async (formData: RuleFormData) => {
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("philosophy_rules")
        .insert({
          user_id: user.id,
          name: formData.name,
          description: formData.description,
          rule_type: formData.rule_type,
          threshold_min: formData.threshold_min ?? null,
          threshold_max: formData.threshold_max ?? null,
          source_books: formData.source_books ?? [],
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["philosophy_rules"] });
      toast.success("Rule added");
    },
    onError: (error) => {
      toast.error("Failed to add rule: " + error.message);
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PhilosophyRule> }) => {
      const { error } = await supabase
        .from("philosophy_rules")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["philosophy_rules"] });
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("philosophy_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["philosophy_rules"] });
      toast.success("Rule deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    },
  });

  const evaluateRule = (rule: PhilosophyRule): RuleCheckResult => {
    const totalValue = positions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
    const stocksValue = positions
      .filter((p) => p.position_type === "stock")
      .reduce((sum, p) => sum + (p.market_value ?? 0), 0);
    const etfsValue = positions
      .filter((p) => p.position_type === "etf")
      .reduce((sum, p) => sum + (p.market_value ?? 0), 0);
    const stocksPercent = totalValue > 0 ? (stocksValue / totalValue) * 100 : 0;
    const etfsPercent = totalValue > 0 ? (etfsValue / totalValue) * 100 : 0;

    // Default result
    let status: RuleCheckResult["status"] = "passing";
    let currentValue: number | null = null;
    let message = "Rule passing";

    switch (rule.name) {
      case "Stock Allocation": {
        currentValue = stocksPercent;
        if (rule.threshold_min && stocksPercent < rule.threshold_min) {
          status = "warning";
          message = `Stocks at ${stocksPercent.toFixed(1)}%, below ${rule.threshold_min}% target`;
        } else if (rule.threshold_max && stocksPercent > rule.threshold_max) {
          status = "failing";
          message = `Stocks at ${stocksPercent.toFixed(1)}%, above ${rule.threshold_max}% limit`;
        } else {
          message = `Stocks at ${stocksPercent.toFixed(1)}% - within range`;
        }
        break;
      }
      case "ETF Allocation": {
        currentValue = etfsPercent;
        if (rule.threshold_min && etfsPercent < rule.threshold_min) {
          status = "warning";
          message = `ETFs at ${etfsPercent.toFixed(1)}%, below ${rule.threshold_min}% target`;
        } else if (rule.threshold_max && etfsPercent > rule.threshold_max) {
          status = "failing";
          message = `ETFs at ${etfsPercent.toFixed(1)}%, above ${rule.threshold_max}% limit`;
        } else {
          message = `ETFs at ${etfsPercent.toFixed(1)}% - within range`;
        }
        break;
      }
      case "Single Stock Limit": {
        const violatingStocks = positions.filter(
          (p) =>
            p.position_type === "stock" &&
            rule.threshold_max &&
            (p.weight_percent ?? 0) > rule.threshold_max
        );
        if (violatingStocks.length > 0) {
          status = "failing";
          currentValue = Math.max(...violatingStocks.map((p) => p.weight_percent ?? 0));
          message = `${violatingStocks.map((p) => p.ticker).join(", ")} exceed ${rule.threshold_max}%`;
        } else {
          message = "All stocks within limit";
        }
        break;
      }
      case "Bet Type Required": {
        const largeWithoutBet = positions.filter(
          (p) => (p.weight_percent ?? 0) > 3 && !p.bet_type
        );
        if (largeWithoutBet.length > 0) {
          status = "warning";
          message = `${largeWithoutBet.length} position(s) >3% without bet type`;
        } else {
          message = "All large positions have bet type";
        }
        break;
      }
      case "Confidence Required": {
        const withoutConfidence = positions.filter((p) => p.confidence_level === null);
        if (withoutConfidence.length > 0) {
          status = "warning";
          message = `${withoutConfidence.length} position(s) missing confidence`;
        } else {
          message = "All positions rated";
        }
        break;
      }
      case "Thesis Required": {
        const stocksWithoutThesis = positions.filter(
          (p) => p.position_type === "stock" && !p.thesis_notes
        );
        if (stocksWithoutThesis.length > 0) {
          status = "warning";
          message = `${stocksWithoutThesis.length} stock(s) missing thesis`;
        } else {
          message = "All stocks have thesis";
        }
        break;
      }
      default: {
        // Generic threshold check for other rules
        if (rule.rule_type === "allocation" || rule.rule_type === "position_size") {
          message = "Check manually - rule requires specific data";
          status = "passing";
        } else {
          message = "Qualitative rule - check manually";
        }
      }
    }

    return { rule, status, currentValue, message };
  };

  const runAllChecks = async (): Promise<RuleCheckResult[]> => {
    const activeRules = (rulesQuery.data ?? []).filter((r) => r.is_active);
    const results = activeRules.map(evaluateRule);

    // Create alerts for violations
    const violations = results.filter((r) => r.status === "failing" || r.status === "warning");

    for (const violation of violations) {
      // Check if similar alert already exists (unresolved)
      const { data: existing } = await supabase
        .from("alerts")
        .select("id")
        .eq("rule_id", violation.rule.id)
        .eq("resolved", false)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("alerts").insert({
          user_id: user!.id,
          rule_id: violation.rule.id,
          message: violation.message,
          severity: violation.status === "failing" ? "critical" : "warning",
          alert_type: "rule_violation",
        });
      }
    }

    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["alerts"] });

    return results;
  };

  return {
    rules: rulesQuery.data ?? [],
    isLoading: rulesQuery.isLoading,
    seedDefaultRules: seedDefaultRulesMutation.mutateAsync,
    isSeeding: seedDefaultRulesMutation.isPending,
    addRule: addRuleMutation.mutateAsync,
    isAdding: addRuleMutation.isPending,
    updateRule: updateRuleMutation.mutate,
    deleteRule: deleteRuleMutation.mutateAsync,
    isDeleting: deleteRuleMutation.isPending,
    evaluateRule,
    runAllChecks,
  };
}
