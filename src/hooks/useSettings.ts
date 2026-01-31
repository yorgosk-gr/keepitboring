import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UserSettings {
  currency: string;
  fiscalYearStart: number;
  rebalancingFrequency: "monthly" | "quarterly" | "annually";
  alertSeverityThreshold: "all" | "warning" | "critical";
  emailAlerts: boolean;
  onboardingCompleted: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  currency: "€",
  fiscalYearStart: 1,
  rebalancingFrequency: "quarterly",
  alertSeverityThreshold: "all",
  emailAlerts: false,
  onboardingCompleted: false,
};

const SETTINGS_KEY = "yk-invest-settings";

export function useSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(`${SETTINGS_KEY}-${user?.id}`);
    if (stored) {
      try {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      } catch {
        setSettings(DEFAULT_SETTINGS);
      }
    }
    setIsLoading(false);
  }, [user?.id]);

  const updateSettings = (updates: Partial<UserSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem(`${SETTINGS_KEY}-${user?.id}`, JSON.stringify(newSettings));
    toast.success("Settings saved");
  };

  const exportAllData = async () => {
    if (!user) return;

    try {
      const [positions, newsletters, insights, decisions, rules, alerts, reports] = await Promise.all([
        supabase.from("positions").select("*").eq("user_id", user.id),
        supabase.from("newsletters").select("*").eq("user_id", user.id),
        supabase.from("insights").select("*"),
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
      a.download = `yk-investagent-export-${new Date().toISOString().split("T")[0]}.json`;
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
  };
}
