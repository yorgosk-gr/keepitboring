import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { usePositions } from "./usePositions";
import { useDashboardData } from "./useDashboardData";
import { useAllETFMetadata } from "./useAllETFMetadata";

export type RuleEnforcement = "hard" | "soft" | "diagnostic";
export type RuleScope = "portfolio" | "cluster" | "position";
export type RuleCategory = "allocation" | "size" | "quality" | "market" | "behavior";
export type RuleOperator = ">" | "<" | ">=" | "<=" | "between" | "outside";

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
  rule_enforcement: RuleEnforcement;
  created_at: string;
  // v2 fields
  scope: RuleScope;
  category: RuleCategory;
  metric: string;
  operator: RuleOperator;
  tags: string[];
  message_on_breach: string;
  scoring_weight: number | null;
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
  rule_enforcement?: RuleEnforcement;
  scope?: RuleScope;
  category?: RuleCategory;
  metric?: string;
  operator?: RuleOperator;
  tags?: string[];
  message_on_breach?: string;
  scoring_weight?: number | null;
}

const DEFAULT_RULES: Omit<PhilosophyRule, "id" | "user_id" | "created_at">[] = [
  // Allocation Rules
  { name: "Stock Allocation", rule_type: "allocation", threshold_min: 15, threshold_max: 25, description: "Individual stocks should be 15-25% of portfolio", source_books: ["Graham", "Malkiel"], is_active: true, rule_enforcement: "hard", scope: "portfolio", category: "allocation", metric: "stocks_percent", operator: "between", tags: ["stocks", "allocation"], message_on_breach: "Stock allocation outside target range", scoring_weight: 1 },
  { name: "ETF Allocation", rule_type: "allocation", threshold_min: 75, threshold_max: 85, description: "ETFs should be 75-85% of portfolio", source_books: ["Malkiel", "Siegel"], is_active: true, rule_enforcement: "hard", scope: "portfolio", category: "allocation", metric: "etfs_percent", operator: "between", tags: ["etf", "allocation"], message_on_breach: "ETF allocation outside target range", scoring_weight: 1 },
  { name: "Equity Allocation", rule_type: "allocation", threshold_min: 40, threshold_max: 60, description: "True equity exposure (stocks + equity ETFs) should be 40-60%", source_books: ["Siegel", "Malkiel"], is_active: true, rule_enforcement: "hard", scope: "portfolio", category: "allocation", metric: "equity_percent", operator: "between", tags: ["equity", "allocation"], message_on_breach: "Equity allocation outside target range", scoring_weight: 1 },
  { name: "Bond Allocation", rule_type: "allocation", threshold_min: 10, threshold_max: 40, description: "Bond ETFs should be 10-40% of portfolio", source_books: ["Graham", "Siegel"], is_active: true, rule_enforcement: "hard", scope: "portfolio", category: "allocation", metric: "bonds_percent", operator: "between", tags: ["bonds", "allocation"], message_on_breach: "Bond allocation outside target range", scoring_weight: 1 },
  { name: "Commodity + Gold Allocation", rule_type: "allocation", threshold_min: 5, threshold_max: 15, description: "Commodities + Gold should be 5-15%", source_books: ["Marks", "Taleb"], is_active: true, rule_enforcement: "hard", scope: "portfolio", category: "allocation", metric: "commodities_gold_percent", operator: "between", tags: ["commodities", "gold", "allocation"], message_on_breach: "Commodity + Gold allocation outside target range", scoring_weight: 1 },
  { name: "Anti-Fragile Minimum", rule_type: "allocation", threshold_min: 5, threshold_max: null, description: "Gold + short-term bonds + cash for tail risk protection", source_books: ["Taleb", "Marks"], is_active: true, rule_enforcement: "hard", scope: "portfolio", category: "allocation", metric: "antifragile_percent", operator: ">=", tags: ["tail-risk", "protection"], message_on_breach: "Anti-fragile protection below minimum", scoring_weight: 1 },
  { name: "Cash Limit", rule_type: "allocation", threshold_min: null, threshold_max: 10, description: "Cash should not exceed 10%", source_books: ["Siegel", "Erkan"], is_active: true, rule_enforcement: "hard", scope: "portfolio", category: "allocation", metric: "cash_percent", operator: "<=", tags: ["cash", "allocation"], message_on_breach: "Cash exceeds limit — deploy or invest", scoring_weight: 1 },
  { name: "Sector Limit", rule_type: "allocation", threshold_min: null, threshold_max: 25, description: "No sector should exceed 25%", source_books: ["Graham", "Marks"], is_active: true, rule_enforcement: "soft", scope: "portfolio", category: "allocation", metric: "sector_percent", operator: "<=", tags: ["sector", "concentration"], message_on_breach: "Sector concentration too high", scoring_weight: 1 },
  // Position Size Rules
  { name: "Single Stock Limit", rule_type: "position_size", threshold_min: null, threshold_max: 8, description: "No single stock over 8%", source_books: ["Graham", "Duke"], is_active: true, rule_enforcement: "hard", scope: "position", category: "size", metric: "position_weight", operator: "<=", tags: ["stocks", "concentration"], message_on_breach: "Single stock position too large", scoring_weight: 1 },
  { name: "Theme ETF Limit", rule_type: "position_size", threshold_min: null, threshold_max: 15, description: "Non-broad ETFs max 15%", source_books: ["Marks"], is_active: true, rule_enforcement: "soft", scope: "position", category: "size", metric: "theme_etf_weight", operator: "<=", tags: ["etf", "thematic"], message_on_breach: "Theme ETF position too large", scoring_weight: 1 },
  { name: "Broad ETF Limit", rule_type: "position_size", threshold_min: null, threshold_max: 35, description: "Global/All-World ETFs can go to 35%", source_books: ["Malkiel"], is_active: true, rule_enforcement: "soft", scope: "position", category: "size", metric: "broad_etf_weight", operator: "<=", tags: ["etf", "broad-market"], message_on_breach: "Broad ETF position exceeds limit", scoring_weight: 1 },
  { name: "Country ETF Limit", rule_type: "position_size", threshold_min: null, threshold_max: 10, description: "Single country (ex-US) max 10%", source_books: ["Marks"], is_active: true, rule_enforcement: "soft", scope: "position", category: "size", metric: "country_etf_weight", operator: "<=", tags: ["etf", "country"], message_on_breach: "Country ETF position too large", scoring_weight: 1 },
  // Geography Rules
  { name: "Single Country Concentration", rule_type: "allocation", threshold_min: null, threshold_max: 10, description: "Any single country (except US) max 10%", source_books: ["Marks"], is_active: true, rule_enforcement: "soft", scope: "portfolio", category: "allocation", metric: "country_percent", operator: "<=", tags: ["country", "concentration"], message_on_breach: "Single country allocation too high", scoring_weight: 1 },
  { name: "Emerging Markets Limit", rule_type: "allocation", threshold_min: null, threshold_max: 15, description: "Total EM exposure max 15%", source_books: ["Marks"], is_active: true, rule_enforcement: "soft", scope: "portfolio", category: "allocation", metric: "em_percent", operator: "<=", tags: ["emerging-markets", "concentration"], message_on_breach: "Emerging markets exposure too high", scoring_weight: 1 },
  // Quality Rules
  { name: "Earnings Yield Floor", rule_type: "quality", threshold_min: 5, threshold_max: null, description: "Prefer stocks with >5% earnings yield", source_books: ["Greenblatt"], is_active: true, rule_enforcement: "diagnostic", scope: "position", category: "quality", metric: "earnings_yield", operator: ">=", tags: ["fundamentals", "valuation"], message_on_breach: "Earnings yield below floor", scoring_weight: null },
  { name: "ROIC Floor", rule_type: "quality", threshold_min: 15, threshold_max: null, description: "Prefer stocks with >15% ROIC", source_books: ["Greenblatt", "Thorndike"], is_active: true, rule_enforcement: "diagnostic", scope: "position", category: "quality", metric: "roic", operator: ">=", tags: ["fundamentals", "quality"], message_on_breach: "ROIC below floor", scoring_weight: null },
  // Behavior Rules
  { name: "Bet Type Required", rule_type: "decision", threshold_min: null, threshold_max: null, description: "Positions >3% must have declared bet type", source_books: ["Duke"], is_active: true, rule_enforcement: "soft", scope: "position", category: "behavior", metric: "has_bet_type", operator: ">=", tags: ["discipline", "process"], message_on_breach: "Large position missing bet type classification", scoring_weight: null },
  { name: "Confidence Required", rule_type: "decision", threshold_min: null, threshold_max: null, description: "All positions need confidence rating", source_books: ["Duke"], is_active: true, rule_enforcement: "soft", scope: "position", category: "behavior", metric: "has_confidence", operator: ">=", tags: ["discipline", "process"], message_on_breach: "Position missing confidence rating", scoring_weight: null },
  { name: "Thesis Required", rule_type: "decision", threshold_min: null, threshold_max: null, description: "Stock positions need written thesis", source_books: ["Duke", "Marks"], is_active: true, rule_enforcement: "soft", scope: "position", category: "behavior", metric: "has_thesis", operator: ">=", tags: ["discipline", "process"], message_on_breach: "Stock missing investment thesis", scoring_weight: null },
  { name: "Invalidation Required", rule_type: "decision", threshold_min: null, threshold_max: null, description: "Must define what would invalidate thesis", source_books: ["Duke"], is_active: true, rule_enforcement: "soft", scope: "position", category: "behavior", metric: "has_invalidation", operator: ">=", tags: ["discipline", "process"], message_on_breach: "Position missing invalidation criteria", scoring_weight: null },
  // Market Rules
  { name: "Bubble Language Alert", rule_type: "market", threshold_min: null, threshold_max: null, description: "Flag euphoria language in newsletters", source_books: ["Kindleberger", "Taleb"], is_active: true, rule_enforcement: "diagnostic", scope: "portfolio", category: "market", metric: "euphoria_language", operator: ">=", tags: ["sentiment", "bubble"], message_on_breach: "Euphoria language detected in newsletters", scoring_weight: null },
  { name: "Extreme Consensus Alert", rule_type: "market", threshold_min: null, threshold_max: null, description: "Flag when >80% newsletters agree", source_books: ["Marks", "Lefèvre"], is_active: true, rule_enforcement: "diagnostic", scope: "portfolio", category: "market", metric: "consensus_level", operator: "<=", tags: ["sentiment", "contrarian"], message_on_breach: "Extreme consensus detected — contrarian signal", scoring_weight: null },
];

export function usePhilosophyRules() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { positions } = usePositions();
  const { totalValue, cashBalance, stocksPercent, etfsPercent, cashPercent } = useDashboardData();
  const { data: etfMetadata = {} } = useAllETFMetadata();

  const rulesQuery = useQuery({
    queryKey: ["philosophy_rules", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("philosophy_rules")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return (data ?? []).map((d: any) => ({
        ...d,
        rule_enforcement: d.rule_enforcement ?? "hard",
        scope: d.scope ?? "portfolio",
        category: d.category ?? "allocation",
        metric: d.metric ?? "",
        operator: d.operator ?? "between",
        tags: d.tags ?? [],
        message_on_breach: d.message_on_breach ?? "",
        scoring_weight: d.scoring_weight ?? 1,
      })) as PhilosophyRule[];
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
          rule_enforcement: formData.rule_enforcement ?? "hard",
          is_active: true,
          scope: formData.scope ?? "portfolio",
          category: formData.category ?? "allocation",
          metric: formData.metric ?? "",
          operator: formData.operator ?? "between",
          tags: formData.tags ?? [],
          message_on_breach: formData.message_on_breach ?? "",
          scoring_weight: formData.scoring_weight ?? 1,
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

  // ── Helpers ──────────────────────────────────────────────────────
  const getPositionWeight = (p: { market_value: number | null }) => {
    if (totalValue === 0) return 0;
    return ((p.market_value ?? 0) / totalValue) * 100;
  };

  const calculateAssetClassAllocation = (assetClass: string) => {
    let total = 0;
    for (const p of positions) {
      const weight = getPositionWeight(p);
      if (p.position_type === "etf") {
        const meta = etfMetadata[p.ticker];
        const category = meta?.category || p.category || "equity";
        if (category === assetClass) total += weight;
      } else if (assetClass === "equity") {
        total += weight;
      }
    }
    return total;
  };

  const calculateGeographyAllocation = (geography: string) => {
    let total = 0;
    for (const p of positions) {
      const weight = getPositionWeight(p);
      if (p.position_type === "etf") {
        const meta = etfMetadata[p.ticker];
        const geo = meta?.geography || "other";
        if (geo === geography) total += weight;
      } else if (geography === "us") {
        total += weight;
      }
    }
    return total;
  };

  // ── Metric resolvers ──────────────────────────────────────────────
  // Each key maps a `metric` string to a function that returns the current
  // numeric value for portfolio-scope rules.

  const resolvePortfolioMetric = (metric: string): number | null => {
    switch (metric) {
      case "stocks_percent": return stocksPercent;
      case "etfs_percent": return etfsPercent;
      case "cash_percent": return cashPercent;
      case "equity_percent": return calculateAssetClassAllocation("equity");
      case "bonds_percent": return calculateAssetClassAllocation("bond");
      case "commodities_gold_percent": {
        return calculateAssetClassAllocation("commodity") + calculateAssetClassAllocation("gold");
      }
      case "antifragile_percent": {
        return calculateAssetClassAllocation("gold") + calculateAssetClassAllocation("bond") + cashPercent;
      }
      case "sector_percent": {
        // Return the MAX sector concentration
        const categoryTotals = positions.reduce((acc, p) => {
          const cat = p.category || "other";
          acc[cat] = (acc[cat] || 0) + getPositionWeight(p);
          return acc;
        }, {} as Record<string, number>);
        return Math.max(...Object.values(categoryTotals), 0);
      }
      case "country_percent": {
        // Return max single non-US country allocation
        const countryTotals: Record<string, number> = {};
        for (const p of positions) {
          if (p.position_type !== "etf") continue;
          const meta = etfMetadata[p.ticker];
          const geo = meta?.geography;
          if (geo && !["us", "global", "other", "emerging_markets"].includes(geo)) {
            countryTotals[geo] = (countryTotals[geo] || 0) + getPositionWeight(p);
          }
        }
        return Math.max(...Object.values(countryTotals), 0);
      }
      case "em_percent": {
        let em = calculateGeographyAllocation("emerging_markets");
        const emCountries = ["india", "brazil", "china", "mexico", "south_africa"];
        for (const c of emCountries) em += calculateGeographyAllocation(c);
        return em;
      }
      // Market / qualitative — not computable client-side
      case "euphoria_language":
      case "consensus_level":
        return null;
      default: return null;
    }
  };

  // Position-scope: returns { value, violators, allValues } for the worst case
  const resolvePositionMetric = (metric: string): { value: number; violators: string[]; count: number } => {
    switch (metric) {
      case "position_weight": {
        const stocks = positions.filter(p => p.position_type === "stock");
        const violators = stocks.filter(p => {
          const w = getPositionWeight(p);
          return w > 0;
        });
        const maxW = Math.max(...stocks.map(p => getPositionWeight(p)), 0);
        return { value: maxW, violators: stocks.filter(p => getPositionWeight(p) === maxW).map(p => p.ticker), count: stocks.length };
      }
      case "broad_etf_weight": {
        const broads = positions.filter(p => {
          if (p.position_type !== "etf") return false;
          const meta = etfMetadata[p.ticker];
          return meta?.is_broad_market === true;
        });
        const maxW = Math.max(...broads.map(p => getPositionWeight(p)), 0);
        return { value: maxW, violators: broads.filter(p => getPositionWeight(p) === maxW).map(p => p.ticker), count: broads.length };
      }
      case "country_etf_weight": {
        const countryEtfs = positions.filter(p => {
          if (p.position_type !== "etf") return false;
          const meta = etfMetadata[p.ticker];
          return meta?.category === "equity" && meta?.geography && !meta?.is_broad_market;
        });
        const maxW = Math.max(...countryEtfs.map(p => getPositionWeight(p)), 0);
        return { value: maxW, violators: countryEtfs.filter(p => getPositionWeight(p) === maxW).map(p => p.ticker), count: countryEtfs.length };
      }
      case "theme_etf_weight": {
        const themeEtfs = positions.filter(p => {
          if (p.position_type !== "etf") return false;
          const meta = etfMetadata[p.ticker];
          return meta?.is_broad_market === false || (!meta && p.category !== "equity");
        });
        const maxW = Math.max(...themeEtfs.map(p => getPositionWeight(p)), 0);
        return { value: maxW, violators: themeEtfs.filter(p => getPositionWeight(p) === maxW).map(p => p.ticker), count: themeEtfs.length };
      }
      default:
        return { value: 0, violators: [], count: 0 };
    }
  };

  // Behavior metrics: returns { passing, violators }
  const resolveBehaviorMetric = (metric: string): { passing: boolean; violators: string[] } => {
    switch (metric) {
      case "has_bet_type": {
        const v = positions.filter(p => getPositionWeight(p) > 3 && !p.bet_type);
        return { passing: v.length === 0, violators: v.map(p => p.ticker) };
      }
      case "has_confidence": {
        const v = positions.filter(p => p.confidence_level === null);
        return { passing: v.length === 0, violators: v.map(p => p.ticker) };
      }
      case "has_thesis": {
        const v = positions.filter(p => p.position_type === "stock" && !p.thesis_notes);
        return { passing: v.length === 0, violators: v.map(p => p.ticker) };
      }
      case "has_invalidation": {
        // No DB field for this yet — pass by default
        return { passing: true, violators: [] };
      }
      default:
        return { passing: true, violators: [] };
    }
  };

  // ── Threshold check helper ─────────────────────────────────────────
  const checkThreshold = (
    value: number,
    rule: PhilosophyRule
  ): { status: RuleCheckResult["status"]; breached: boolean } => {
    const { operator, threshold_min, threshold_max, rule_enforcement } = rule;
    let breached = false;

    switch (operator) {
      case "between":
        breached = (threshold_min !== null && value < threshold_min) ||
                   (threshold_max !== null && value > threshold_max);
        break;
      case "outside":
        breached = (threshold_min !== null && threshold_max !== null) &&
                   (value >= threshold_min && value <= threshold_max);
        break;
      case ">=":
        breached = threshold_min !== null && value < threshold_min;
        break;
      case ">":
        breached = threshold_min !== null && value <= threshold_min;
        break;
      case "<=":
        breached = threshold_max !== null && value > threshold_max;
        break;
      case "<":
        breached = threshold_max !== null && value >= threshold_max;
        break;
    }

    if (!breached) return { status: "passing", breached: false };

    // Enforcement determines severity
    if (rule_enforcement === "diagnostic") return { status: "passing", breached: true };
    if (rule_enforcement === "soft") return { status: "warning", breached: true };
    // hard
    // Below-min is warning, above-max is failing for "between" operator
    if (operator === "between" && threshold_min !== null && value < threshold_min) {
      return { status: "warning", breached: true };
    }
    return { status: "failing", breached: true };
  };

  // ── Main evaluator ─────────────────────────────────────────────────
  const evaluateRule = (rule: PhilosophyRule): RuleCheckResult => {
    const metricLabel = rule.metric.replace(/_/g, " ");

    // 1. Behavior rules (boolean, no numeric threshold)
    if (rule.category === "behavior") {
      const { passing, violators } = resolveBehaviorMetric(rule.metric);
      if (!passing) {
        const status = rule.rule_enforcement === "hard" ? "failing" as const : "warning" as const;
        const msg = rule.message_on_breach || `${violators.join(", ")} missing ${metricLabel}`;
        return { rule, status, currentValue: null, message: violators.length > 0 ? `${violators.join(", ")} — ${msg}` : msg };
      }
      return { rule, status: "passing", currentValue: null, message: `All positions satisfy ${metricLabel}` };
    }

    // 2. Market / qualitative rules (not computable client-side)
    if (rule.category === "market" || ["euphoria_language", "consensus_level", "earnings_yield", "roic"].includes(rule.metric)) {
      const label = rule.category === "quality" ? "Quality metrics require external data" : "Market signals evaluated during newsletter analysis";
      return { rule, status: "passing", currentValue: null, message: label };
    }

    // 3. Position-scope size rules
    if (rule.scope === "position" && rule.category === "size") {
      const { value, violators } = resolvePositionMetric(rule.metric);
      // Find all violating tickers (not just max)
      const allViolators = getPositionViolators(rule);
      if (allViolators.length > 0) {
        const maxVal = Math.max(...allViolators.map(v => v.weight));
        const { status } = checkThreshold(maxVal, rule);
        const msg = rule.message_on_breach || `Position exceeds ${metricLabel} limit`;
        return {
          rule,
          status,
          currentValue: maxVal,
          message: `${allViolators.map(v => v.ticker).join(", ")} exceed ${rule.threshold_max}% — ${msg}`,
        };
      }
      return {
        rule,
        status: "passing",
        currentValue: value,
        message: `All within ${metricLabel} limit (max: ${value.toFixed(1)}%)`,
      };
    }

    // 4. Portfolio-scope rules (allocation, geography, etc.)
    const value = resolvePortfolioMetric(rule.metric);
    if (value === null) {
      return { rule, status: "passing", currentValue: null, message: `${metricLabel} — not computable client-side` };
    }

    const { status, breached } = checkThreshold(value, rule);
    let message: string;
    if (breached) {
      message = rule.message_on_breach
        ? `${metricLabel} at ${value.toFixed(1)}% — ${rule.message_on_breach}`
        : `${metricLabel} at ${value.toFixed(1)}%, outside ${rule.threshold_min ?? "–"}–${rule.threshold_max ?? "–"}% range`;
    } else {
      message = `${metricLabel} at ${value.toFixed(1)}% — within range`;
    }

    return { rule, status, currentValue: value, message };
  };

  // Helper: find all position tickers violating a position-scope size rule
  const getPositionViolators = (rule: PhilosophyRule): { ticker: string; weight: number }[] => {
    const positionsForMetric = getPositionsForSizeMetric(rule.metric);
    return positionsForMetric
      .map(p => ({ ticker: p.ticker, weight: getPositionWeight(p) }))
      .filter(({ weight }) => {
        if (rule.threshold_max !== null && weight > rule.threshold_max) return true;
        if (rule.threshold_min !== null && weight < rule.threshold_min) return true;
        return false;
      });
  };

  const getPositionsForSizeMetric = (metric: string) => {
    switch (metric) {
      case "position_weight":
        return positions.filter(p => p.position_type === "stock");
      case "broad_etf_weight":
        return positions.filter(p => p.position_type === "etf" && etfMetadata[p.ticker]?.is_broad_market === true);
      case "country_etf_weight":
        return positions.filter(p => {
          if (p.position_type !== "etf") return false;
          const meta = etfMetadata[p.ticker];
          return meta?.category === "equity" && meta?.geography && !meta?.is_broad_market;
        });
      case "theme_etf_weight":
        return positions.filter(p => {
          if (p.position_type !== "etf") return false;
          const meta = etfMetadata[p.ticker];
          return meta?.is_broad_market === false || (!meta && p.category !== "equity");
        });
      default:
        return [];
    }
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
          alert_type: "portfolio", // Using 'portfolio' as rule violations are portfolio-level checks
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
