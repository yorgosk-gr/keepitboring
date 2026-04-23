import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UserSettings {
  alertSeverityThreshold: "all" | "warning" | "critical";
  emailAlerts: boolean;
  onboardingCompleted: boolean;
}

const DEFAULT_SETTINGS: UserSettings = {
  alertSeverityThreshold: "all",
  emailAlerts: false,
  onboardingCompleted: false,
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

      setSettings(merged);
      setIsLoading(false);
    };
    loadSettings();
  }, [user?.id]);

  const updateSettings = async (updates: Partial<UserSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    localStorage.setItem(`${SETTINGS_KEY}-${user?.id}`, JSON.stringify(newSettings));

    toast.success("Settings saved");
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
    completeOnboarding,
    loadTestData,
  };
}
