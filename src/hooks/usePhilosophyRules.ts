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
  { name: "Bond Allocation", rule_type: "allocation", threshold_min: 10, threshold_max: 25, description: "Bond ETFs should be 10-25% of portfolio", source_books: ["Graham", "Siegel"], is_active: true, rule_enforcement: "hard", scope: "portfolio", category: "allocation", metric: "bonds_percent", operator: "between", tags: ["bonds", "allocation"], message_on_breach: "Bond allocation outside target range", scoring_weight: 1 },
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

  const evaluateRule = (rule: PhilosophyRule): RuleCheckResult => {
    // Default result
    let status: RuleCheckResult["status"] = "passing";
    let currentValue: number | null = null;
    let message = "Rule passing";

    // Helper to calculate position weight correctly (using total including cash)
    const getPositionWeight = (p: { market_value: number | null }) => {
      if (totalValue === 0) return 0;
      return ((p.market_value ?? 0) / totalValue) * 100;
    };

    // Helper to calculate true asset class allocation using ETF metadata
    const calculateAssetClassAllocation = (assetClass: string) => {
      let total = 0;
      for (const p of positions) {
        const weight = getPositionWeight(p);
        if (p.position_type === "etf") {
          const meta = etfMetadata[p.ticker];
          const category = meta?.category || p.category || "equity";
          if (category === assetClass) {
            total += weight;
          }
        } else if (assetClass === "equity") {
          // Stocks are always equity
          total += weight;
        }
      }
      return total;
    };

    // Helper to calculate geography allocation
    const calculateGeographyAllocation = (geography: string) => {
      let total = 0;
      for (const p of positions) {
        const weight = getPositionWeight(p);
        if (p.position_type === "etf") {
          const meta = etfMetadata[p.ticker];
          const geo = meta?.geography || "other";
          if (geo === geography) {
            total += weight;
          }
        } else if (geography === "us") {
          // Default stocks to US
          total += weight;
        }
      }
      return total;
    };

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
      case "Equity Allocation": {
        // True equity = stocks + equity ETFs (using metadata)
        currentValue = calculateAssetClassAllocation("equity");
        if (rule.threshold_min && currentValue < rule.threshold_min) {
          status = "warning";
          message = `True equity at ${currentValue.toFixed(1)}%, below ${rule.threshold_min}% target`;
        } else if (rule.threshold_max && currentValue > rule.threshold_max) {
          status = "failing";
          message = `True equity at ${currentValue.toFixed(1)}%, above ${rule.threshold_max}% limit`;
        } else {
          message = `True equity at ${currentValue.toFixed(1)}% - within range`;
        }
        break;
      }
      case "Bond Allocation": {
        currentValue = calculateAssetClassAllocation("bond");
        if (rule.threshold_min && currentValue < rule.threshold_min) {
          status = "warning";
          message = `Bonds at ${currentValue.toFixed(1)}%, below ${rule.threshold_min}% target`;
        } else if (rule.threshold_max && currentValue > rule.threshold_max) {
          status = "failing";
          message = `Bonds at ${currentValue.toFixed(1)}%, above ${rule.threshold_max}% limit`;
        } else {
          message = `Bonds at ${currentValue.toFixed(1)}% - within range`;
        }
        break;
      }
      case "Commodity + Gold Allocation": {
        const commodities = calculateAssetClassAllocation("commodity");
        const gold = calculateAssetClassAllocation("gold");
        currentValue = commodities + gold;
        if (rule.threshold_min && currentValue < rule.threshold_min) {
          status = "warning";
          message = `Commodities + Gold at ${currentValue.toFixed(1)}%, below ${rule.threshold_min}% target`;
        } else if (rule.threshold_max && currentValue > rule.threshold_max) {
          status = "failing";
          message = `Commodities + Gold at ${currentValue.toFixed(1)}%, above ${rule.threshold_max}% limit`;
        } else {
          message = `Commodities + Gold at ${currentValue.toFixed(1)}% - within range`;
        }
        break;
      }
      case "Anti-Fragile Minimum": {
        // Gold + bonds + cash
        const gold = calculateAssetClassAllocation("gold");
        const bonds = calculateAssetClassAllocation("bond");
        currentValue = gold + bonds + cashPercent;
        if (rule.threshold_min && currentValue < rule.threshold_min) {
          status = "warning";
          message = `Anti-fragile at ${currentValue.toFixed(1)}%, below ${rule.threshold_min}% minimum`;
        } else {
          message = `Anti-fragile at ${currentValue.toFixed(1)}% - sufficient protection`;
        }
        break;
      }
      case "Cash Limit": {
        currentValue = cashPercent;
        if (rule.threshold_max && cashPercent > rule.threshold_max) {
          status = "failing";
          message = `Cash at ${cashPercent.toFixed(1)}%, above ${rule.threshold_max}% limit`;
        } else {
          message = `Cash at ${cashPercent.toFixed(1)}% - within limit`;
        }
        break;
      }
      case "Minimum Equity": {
        const equityPercent = stocksPercent + etfsPercent;
        currentValue = equityPercent;
        if (rule.threshold_min && equityPercent < rule.threshold_min) {
          status = "warning";
          message = `Equities at ${equityPercent.toFixed(1)}%, below ${rule.threshold_min}% minimum`;
        } else {
          message = `Equities at ${equityPercent.toFixed(1)}% - above minimum`;
        }
        break;
      }
      case "Single Stock Limit": {
        const violatingStocks = positions.filter(
          (p) =>
            p.position_type === "stock" &&
            rule.threshold_max &&
            getPositionWeight(p) > rule.threshold_max
        );
        if (violatingStocks.length > 0) {
          status = "failing";
          currentValue = Math.max(...violatingStocks.map((p) => getPositionWeight(p)));
          message = `${violatingStocks.map((p) => p.ticker).join(", ")} exceed ${rule.threshold_max}%`;
        } else {
          const maxStock = positions
            .filter((p) => p.position_type === "stock")
            .reduce((max, p) => Math.max(max, getPositionWeight(p)), 0);
          message = `All stocks within limit (max: ${maxStock.toFixed(1)}%)`;
        }
        break;
      }
      case "Broad ETF Limit": {
        // Use etf_metadata.is_broad_market to identify broad ETFs
        const broadEtfs = positions.filter((p) => {
          if (p.position_type !== "etf") return false;
          const meta = etfMetadata[p.ticker];
          return meta?.is_broad_market === true;
        });
        const violating = broadEtfs.filter(
          (p) => rule.threshold_max && getPositionWeight(p) > rule.threshold_max
        );
        if (violating.length > 0) {
          status = "failing";
          currentValue = Math.max(...violating.map((p) => getPositionWeight(p)));
          message = `${violating.map((p) => p.ticker).join(", ")} exceed ${rule.threshold_max}%`;
        } else {
          const maxBroad = broadEtfs.reduce((max, p) => Math.max(max, getPositionWeight(p)), 0);
          message = `Broad ETFs within limit (max: ${maxBroad.toFixed(1)}%)`;
        }
        break;
      }
      case "Country ETF Limit": {
        // Use etf_metadata.category = 'country' to identify country ETFs
        const countryEtfs = positions.filter((p) => {
          if (p.position_type !== "etf") return false;
          const meta = etfMetadata[p.ticker];
          return meta?.category === "equity" && meta?.geography && !meta?.is_broad_market;
        });
        const violating = countryEtfs.filter(
          (p) => rule.threshold_max && getPositionWeight(p) > rule.threshold_max
        );
        if (violating.length > 0) {
          status = "warning";
          currentValue = Math.max(...violating.map((p) => getPositionWeight(p)));
          message = `${violating.map((p) => p.ticker).join(", ")} exceed ${rule.threshold_max}%`;
        } else {
          const maxCountry = countryEtfs.reduce((max, p) => Math.max(max, getPositionWeight(p)), 0);
          message = `Country ETFs within limit (max: ${maxCountry.toFixed(1)}%)`;
        }
        break;
      }
      case "Theme ETF Limit": {
        // Non-broad ETFs (is_broad_market = false or not equity)
        const themeEtfs = positions.filter((p) => {
          if (p.position_type !== "etf") return false;
          const meta = etfMetadata[p.ticker];
          // Theme = not broad market AND not purely a category ETF (commodity, gold, bond are fine)
          return meta?.is_broad_market === false || 
                 (!meta && p.category !== "equity");
        });
        const violating = themeEtfs.filter(
          (p) => rule.threshold_max && getPositionWeight(p) > rule.threshold_max
        );
        if (violating.length > 0) {
          status = "warning";
          currentValue = Math.max(...violating.map((p) => getPositionWeight(p)));
          message = `${violating.map((p) => p.ticker).join(", ")} exceed ${rule.threshold_max}%`;
        } else {
          const maxTheme = themeEtfs.reduce((max, p) => Math.max(max, getPositionWeight(p)), 0);
          message = `Theme ETFs within limit (max: ${maxTheme.toFixed(1)}%)`;
        }
        break;
      }
      case "Single Country Concentration": {
        // Check each country (except US) for concentration
        const countryTotals: Record<string, number> = {};
        for (const p of positions) {
          if (p.position_type !== "etf") continue;
          const meta = etfMetadata[p.ticker];
          const geo = meta?.geography;
          // Only track specific countries (not 'us', 'global', 'other', 'emerging_markets')
          if (geo && !["us", "global", "other", "emerging_markets"].includes(geo)) {
            countryTotals[geo] = (countryTotals[geo] || 0) + getPositionWeight(p);
          }
        }
        const violating = Object.entries(countryTotals).filter(
          ([, pct]) => rule.threshold_max && pct > rule.threshold_max
        );
        if (violating.length > 0) {
          status = "warning";
          currentValue = Math.max(...violating.map(([, pct]) => pct));
          message = `${violating.map(([c]) => c).join(", ")} exceed ${rule.threshold_max}%`;
        } else {
          const maxCountry = Math.max(...Object.values(countryTotals), 0);
          message = `All countries within limit (max: ${maxCountry.toFixed(1)}%)`;
        }
        break;
      }
      case "Emerging Markets Limit": {
        // Sum of all EM exposure
        currentValue = calculateGeographyAllocation("emerging_markets");
        // Also add country ETFs from EM regions
        const emCountries = ["india", "brazil", "china", "mexico", "south_africa"];
        for (const country of emCountries) {
          currentValue += calculateGeographyAllocation(country);
        }
        if (rule.threshold_max && currentValue > rule.threshold_max) {
          status = "warning";
          message = `EM exposure at ${currentValue.toFixed(1)}%, above ${rule.threshold_max}% limit`;
        } else {
          message = `EM exposure at ${currentValue.toFixed(1)}% - within limit`;
        }
        break;
      }
      case "Bet Type Required": {
        const largeWithoutBet = positions.filter(
          (p) => getPositionWeight(p) > 3 && !p.bet_type
        );
        if (largeWithoutBet.length > 0) {
          status = "warning";
          message = `${largeWithoutBet.map((p) => p.ticker).join(", ")} >3% without bet type`;
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
          message = `${stocksWithoutThesis.map((p) => p.ticker).join(", ")} missing thesis`;
        } else {
          message = "All stocks have thesis";
        }
        break;
      }
      case "Sector Limit": {
        // Group positions by category and check limits
        const categoryTotals = positions.reduce((acc, p) => {
          const cat = p.category || "other";
          acc[cat] = (acc[cat] || 0) + getPositionWeight(p);
          return acc;
        }, {} as Record<string, number>);
        
        const violating = Object.entries(categoryTotals).filter(
          ([, pct]) => rule.threshold_max && pct > rule.threshold_max
        );
        if (violating.length > 0) {
          status = "warning";
          currentValue = Math.max(...violating.map(([, pct]) => pct));
          message = `${violating.map(([cat]) => cat).join(", ")} exceed ${rule.threshold_max}%`;
        } else {
          const maxSector = Math.max(...Object.values(categoryTotals));
          message = `All sectors within limit (max: ${maxSector.toFixed(1)}%)`;
        }
        break;
      }
      default: {
        // For qualitative rules (market, quality) that need external data
        if (rule.rule_type === "quality") {
          message = "Quality metrics require external data";
        } else if (rule.rule_type === "market") {
          message = "Market signals evaluated during newsletter analysis";
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
