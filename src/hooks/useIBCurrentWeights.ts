import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface IBCurrentWeights {
  /** ticker → percent of total portfolio (positions + cash) */
  weights: Record<string, number>;
  /** ticker → description/name from IB */
  descriptions: Record<string, string>;
  /** cash weight as % of total portfolio */
  cashWeight: number;
  /** total portfolio value (positions + cash) */
  totalValue: number;
  isLoading: boolean;
}

export function useIBCurrentWeights(): IBCurrentWeights {
  const { user } = useAuth();

  const ibPosQuery = useQuery({
    queryKey: ["ib-positions-weights", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ib_positions")
        .select("symbol, percent_of_nav, position_value, description");
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const ibAccountQuery = useQuery({
    queryKey: ["ib-account-cash", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ib_accounts")
        .select("cash_balance")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const positions = ibPosQuery.data ?? [];
  const cashBalance = ibAccountQuery.data?.cash_balance ?? 0;

  const totalPositionValue = positions.reduce((s, p) => s + (p.position_value ?? 0), 0);
  const totalValue = totalPositionValue + cashBalance;

  // Calculate weights as % of total portfolio (positions + cash), not just NAV
  const weights: Record<string, number> = {};
  const descriptions: Record<string, string> = {};
  for (const p of positions) {
    if (p.symbol) {
      weights[p.symbol] = totalValue > 0 ? ((p.position_value ?? 0) / totalValue) * 100 : 0;
      if (p.description) descriptions[p.symbol] = p.description;
    }
  }

  const cashWeight = totalValue > 0 ? (cashBalance / totalValue) * 100 : 0;

  return {
    weights,
    descriptions,
    cashWeight,
    totalValue,
    isLoading: ibPosQuery.isLoading || ibAccountQuery.isLoading,
  };
}

/** Derive status from current weight vs target range */
export function deriveStatus(
  currentWeight: number,
  targetMin: number | null,
  targetMax: number | null,
  manualStatus: string | null
): "build" | "hold" | "reduce" | "exit" {
  if (manualStatus === "exit") return "exit";

  const min = targetMin ?? 0;
  const max = targetMax ?? 100;

  if (currentWeight < min) return "build";
  if (currentWeight > max) return "reduce";
  return "hold";
}

/** Generate tooltip explanation for derived status */
export function statusTooltip(
  currentWeight: number,
  targetMin: number | null,
  targetMax: number | null,
  status: "build" | "hold" | "reduce" | "exit"
): string {
  const min = targetMin ?? 0;
  const max = targetMax ?? 100;
  switch (status) {
    case "build":
      return `Currently ${currentWeight.toFixed(1)}%, target range is ${min.toFixed(0)}–${max.toFixed(0)}% — needs building`;
    case "hold":
      return `Currently ${currentWeight.toFixed(1)}%, within target range ${min.toFixed(0)}–${max.toFixed(0)}%`;
    case "reduce":
      return `Currently ${currentWeight.toFixed(1)}%, above target max ${max.toFixed(0)}% — needs reducing`;
    case "exit":
      return `Marked for exit — currently ${currentWeight.toFixed(1)}%`;
  }
}
