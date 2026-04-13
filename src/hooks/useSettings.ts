import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PortfolioMode = "capital_preservation" | "balanced" | "aggressive";

export interface UserSettings {
  alertSeverityThreshold: "all" | "warning" | "critical";
  emailAlerts: boolean;
  onboardingCompleted: boolean;
  portfolioMode: PortfolioMode;
}

const DEFAULT_SETTINGS: UserSettings = {
  alertSeverityThreshold: "all",
  emailAlerts: false,
  onboardingCompleted: false,
  portfolioMode: "balanced",
};

const SETTINGS_KEY = "keepitboring-settings";

export function useSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from localStorage + DB
  useEffect(() => {
    const loadSettings = async () => {
      const stored = localStorage.getItem(`${SETTINGS_KEY}-${user?.id}`);
      let merged = DEFAULT_SETTINGS;
      if (stored) {
        try {
          merged = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        } catch {
          // ignore
        }
      }

      // Load portfolio_mode from DB
      if (user) {
        const { data } = await supabase
          .from("user_settings")
          .select("portfolio_mode")
          .eq("user_id", user.id)
          .maybeSingle();
        if (data?.portfolio_mode) {
          merged = { ...merged, portfolioMode: data.portfolio_mode as PortfolioMode };
        }
      }

      setSettings(merged);
      setIsLoading(false);
    };
    loadSettings();
  }, [user?.id]);

  const updateSettings = async (updates: Partial<UserSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem(`${SETTINGS_KEY}-${user?.id}`, JSON.stringify(newSettings));

    // Persist portfolio_mode to DB
    if (updates.portfolioMode && user) {
      await supabase
        .from("user_settings")
        .upsert({ user_id: user.id, portfolio_mode: updates.portfolioMode }, { onConflict: "user_id" });
    }

    toast.success("Settings saved");
  };

  const exportAllData = async () => {
    if (!user) return;

    try {
      const [positions, newsletters, insights, decisions, rules, alerts, reports] = await Promise.all([
        supabase.from("positions").select("*").eq("user_id", user.id),
        supabase.from("newsletters").select("*").eq("user_id", user.id),
        // Insights scoped via user's newsletters (no direct user_id column)
        (async () => {
          const { data: userNls } = await supabase
            .from("newsletters")
            .select("id")
            .eq("user_id", user.id);
          const nlIds = (userNls ?? []).map(n => n.id);
          if (nlIds.length === 0) return { data: [], error: null };
          return supabase.from("insights").select("*").in("newsletter_id", nlIds);
        })(),
        supabase.from("decision_log").select("*").eq("user_id", user.id),
        supabase.from("philosophy_rules").select("*").eq("user_id", user.id),
        supabase.from("alerts").select("*").eq("user_id", user.id),
        supabase.from("reports").select("*").eq("user_id", user.id),
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        positions: positions.data,
        newsletters: newsletters.data,
        insights: insights.data,
        decisions: decisions.data,
        rules: rules.data,
        alerts: alerts.data,
        reports: reports.data,
        settings,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `keepitboring-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("All data exported successfully");
    } catch (error) {
      toast.error("Failed to export data");
    }
  };

  const exportDecisionLog = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from("decision_log")
        .select("*, positions(ticker)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!data || data.length === 0) {
        toast.warning("No decisions to export");
        return;
      }

      const headers = ["Date", "Action", "Position", "Reasoning", "Confidence", "Probability", "Information Set", "Invalidation Triggers", "Outcome"];
      const rows = data.map((d) => [
        new Date(d.created_at).toLocaleDateString(),
        d.action_type || "",
        d.positions?.ticker || "Portfolio-wide",
        `"${(d.reasoning || "").replace(/"/g, '""')}"`,
        d.confidence_level || "",
        d.probability_estimate || "",
        `"${(d.information_set || "").replace(/"/g, '""')}"`,
        `"${(d.invalidation_triggers || "").replace(/"/g, '""')}"`,
        `"${(d.outcome_notes || "").replace(/"/g, '""')}"`,
      ]);

      const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `decision-log-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("Decision log exported");
    } catch (error) {
      toast.error("Failed to export decision log");
    }
  };

  const clearAllAlerts = async () => {
    if (!user) return;

    try {
      await supabase.from("alerts").delete().eq("user_id", user.id);
      toast.success("All alerts cleared");
    } catch (error) {
      toast.error("Failed to clear alerts");
    }
  };

  const resetToDefaultRules = async () => {
    if (!user) return;

    try {
      // Delete existing rules
      await supabase.from("philosophy_rules").delete().eq("user_id", user.id);

      // Insert default rules
      const defaultRules = [
        {
          user_id: user.id,
          name: "Single Stock Limit",
          description: "No single stock should exceed 8% of portfolio",
          rule_type: "position_size",
          threshold_max: 8,
          source_books: ["The Intelligent Investor", "Thinking in Bets"],
        },
        {
          user_id: user.id,
          name: "ETF Allocation Target",
          description: "ETFs should comprise 80% of portfolio for passive stability",
          rule_type: "allocation",
          threshold_min: 75,
          threshold_max: 85,
          source_books: ["A Random Walk Down Wall Street"],
        },
        {
          user_id: user.id,
          name: "Sector Concentration",
          description: "No sector should exceed 25% of portfolio",
          rule_type: "sector",
          threshold_max: 25,
          source_books: ["The Intelligent Investor"],
        },
      ];

      await supabase.from("philosophy_rules").insert(defaultRules);
      toast.success("Rules reset to defaults");
    } catch (error) {
      toast.error("Failed to reset rules");
    }
  };

  const deleteAllData = async () => {
    if (!user) return;

    try {
      await Promise.all([
        supabase.from("positions").delete().eq("user_id", user.id),
        supabase.from("newsletters").delete().eq("user_id", user.id),
        supabase.from("decision_log").delete().eq("user_id", user.id),
        supabase.from("philosophy_rules").delete().eq("user_id", user.id),
        supabase.from("alerts").delete().eq("user_id", user.id),
        supabase.from("reports").delete().eq("user_id", user.id),
        supabase.from("analysis_history").delete().eq("user_id", user.id),
        supabase.from("portfolio_snapshots").delete().eq("user_id", user.id),
      ]);

      // Reset settings
      localStorage.removeItem(`${SETTINGS_KEY}-${user?.id}`);
      setSettings(DEFAULT_SETTINGS);

      toast.success("All data deleted");
    } catch (error) {
      toast.error("Failed to delete data");
    }
  };

  const completeOnboarding = () => {
    updateSettings({ onboardingCompleted: true });
  };

  const loadTestData = async () => {
    if (!user) return;

    const testPositions = [
      {"ticker": "AAPL", "name": "Apple Inc", "position_type": "stock", "category": "equity", "shares": 61, "avg_cost": 258.80, "current_price": 259.12, "market_value": 15806, "confidence_level": 7, "thesis_notes": "Best-in-class ecosystem with Services growth. Buyback machine."},
      {"ticker": "AMZN", "name": "Amazon", "position_type": "stock", "category": "equity", "shares": 85, "avg_cost": 230.01, "current_price": 239.42, "market_value": 20351, "confidence_level": 6, "thesis_notes": "AWS dominance + advertising growth. Margin expansion story."},
      {"ticker": "CRWD", "name": "CrowdStrike", "position_type": "stock", "category": "equity", "shares": 32, "avg_cost": 450.69, "current_price": 440.16, "market_value": 14085, "confidence_level": 6, "thesis_notes": "Cybersecurity platform consolidation leader."},
      {"ticker": "META", "name": "Meta Platforms", "position_type": "stock", "category": "equity", "shares": 25, "avg_cost": 640.14, "current_price": 714.44, "market_value": 17861, "confidence_level": 5, "thesis_notes": "Ad revenue dominance. AI investment risk but massive cash flow."},
      {"ticker": "III", "name": "3i Group", "position_type": "stock", "category": "equity", "shares": 100, "avg_cost": 31.19, "current_price": 45.53, "market_value": 4553, "confidence_level": 4, "thesis_notes": "PE exposure via public markets."},
      {"ticker": "PGY", "name": "Pagaya Technologies", "position_type": "stock", "category": "equity", "shares": 50, "avg_cost": 19.68, "current_price": 19.30, "market_value": 965, "confidence_level": 3, "thesis_notes": "AI lending platform. High risk, balance sheet concerns."},
      {"ticker": "PWR", "name": "Quanta Services", "position_type": "stock", "category": "equity", "shares": 10, "avg_cost": 435.66, "current_price": 474.70, "market_value": 4747, "confidence_level": 7, "thesis_notes": "Infrastructure buildout beneficiary. Grid modernization."},
      {"ticker": "VWRA", "name": "Vanguard FTSE All-World", "position_type": "etf", "category": "equity", "shares": 920, "avg_cost": 171.42, "current_price": 174.85, "market_value": 160865, "confidence_level": 9, "thesis_notes": null},
      {"ticker": "CSPX", "name": "iShares S&P 500", "position_type": "etf", "category": "equity", "shares": 62, "avg_cost": 738.05, "current_price": 743.31, "market_value": 46085, "confidence_level": 9, "thesis_notes": null},
      {"ticker": "IDTM", "name": "iShares USD Treasury Bond", "position_type": "etf", "category": "bond", "shares": 200, "avg_cost": 175.09, "current_price": 174.43, "market_value": 34886, "confidence_level": 8, "thesis_notes": null},
      {"ticker": "IMID", "name": "iShares EM Bond", "position_type": "etf", "category": "bond", "shares": 100, "avg_cost": 299.44, "current_price": 300.12, "market_value": 30012, "confidence_level": 7, "thesis_notes": null},
      {"ticker": "NDIA", "name": "iShares MSCI India", "position_type": "etf", "category": "country", "shares": 2200, "avg_cost": 9.575, "current_price": 9.34, "market_value": 20544, "confidence_level": 6, "thesis_notes": null},
      {"ticker": "CMOD", "name": "iShares Diversified Commodity", "position_type": "etf", "category": "commodity", "shares": 600, "avg_cost": 27.79, "current_price": 29.85, "market_value": 17912, "confidence_level": 7, "thesis_notes": null},
      {"ticker": "IGLN", "name": "iShares Physical Gold", "position_type": "etf", "category": "gold", "shares": 106, "avg_cost": 90.36, "current_price": 96.77, "market_value": 10258, "confidence_level": 7, "thesis_notes": null},
      {"ticker": "EIMI", "name": "iShares EM IMI", "position_type": "etf", "category": "equity", "shares": 100, "avg_cost": 48.84, "current_price": 48.84, "market_value": 4884, "confidence_level": 7, "thesis_notes": null},
      {"ticker": "COPX", "name": "Global X Copper Miners", "position_type": "etf", "category": "commodity", "shares": 100, "avg_cost": 63.31, "current_price": 67.15, "market_value": 6715, "confidence_level": 5, "thesis_notes": null},
      {"ticker": "IJPA", "name": "iShares MSCI Japan", "position_type": "etf", "category": "country", "shares": 138, "avg_cost": 73.24, "current_price": 73.32, "market_value": 10118, "confidence_level": 7, "thesis_notes": null},
      {"ticker": "IMEU", "name": "iShares MSCI Europe", "position_type": "etf", "category": "equity", "shares": 300, "avg_cost": 37.69, "current_price": 44.83, "market_value": 13450, "confidence_level": 7, "thesis_notes": null},
      {"ticker": "IB01", "name": "iShares USD Treasury 0-1yr", "position_type": "etf", "category": "bond", "shares": 100, "avg_cost": 119.18, "current_price": 119.17, "market_value": 11917, "confidence_level": 8, "thesis_notes": null}
    ];

    const cashBalance = 13800;
    const totalMarketValue = testPositions.reduce((sum, p) => sum + p.market_value, 0);
    const totalPortfolioValue = totalMarketValue + cashBalance;

    try {
      // Clear existing positions first
      await supabase.from("positions").delete().eq("user_id", user.id);

      // Insert positions with calculated weight_percent
      const positionsWithWeights = testPositions.map(p => ({
        ...p,
        user_id: user.id,
        weight_percent: (p.market_value / totalPortfolioValue) * 100,
      }));

      const { error: posError } = await supabase.from("positions").insert(positionsWithWeights);
      if (posError) throw posError;

      // Create/update portfolio snapshot with cash balance
      const today = new Date().toISOString().split("T")[0];
      const stocksPercent = testPositions
        .filter(p => p.position_type === "stock")
        .reduce((sum, p) => sum + (p.market_value / totalPortfolioValue) * 100, 0);
      const etfsPercent = testPositions
        .filter(p => p.position_type === "etf")
        .reduce((sum, p) => sum + (p.market_value / totalPortfolioValue) * 100, 0);

      // Delete existing snapshot for today if any
      await supabase.from("portfolio_snapshots").delete().eq("user_id", user.id).eq("snapshot_date", today);

      const { error: snapError } = await supabase.from("portfolio_snapshots").insert({
        user_id: user.id,
        snapshot_date: today,
        total_value: totalPortfolioValue,
        cash_balance: cashBalance,
        stocks_percent: stocksPercent,
        etfs_percent: etfsPercent,
        data_json: { positions: positionsWithWeights },
      });
      if (snapError) throw snapError;

      toast.success("Test data loaded successfully!");
      window.location.reload();
    } catch (error) {
      console.error("Failed to load test data:", error);
      toast.error("Failed to load test data");
    }
  };

  return {
    settings,
    isLoading,
    updateSettings,
    exportAllData,
    exportDecisionLog,
    clearAllAlerts,
    resetToDefaultRules,
    deleteAllData,
    completeOnboarding,
    loadTestData,
  };
}
