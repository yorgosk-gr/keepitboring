import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePhilosophyRules } from "./usePhilosophyRules";
import { useDashboardData } from "./useDashboardData";
import { toast } from "sonner";

export interface IdealETF {
  ticker: string;
  name: string;
  asset_class: string;
  sub_category: string;
  domicile: string;
  exchange: string;
  amount_usd: number;
  percent: number;
  expense_ratio: number;
  explanation: string;
}

export interface IdealAllocationResult {
  etfs: IdealETF[];
  strategy_summary: string;
  tax_note: string;
}

export function useIdealAllocation() {
  const { rules } = usePhilosophyRules();
  const { totalValue } = useDashboardData();
  const [result, setResult] = useState<IdealAllocationResult | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const activeRules = rules.filter((r) => r.is_active);

      // Fetch latest intelligence brief
      let intelligenceBrief = null;
      try {
        const { data: briefData } = await supabase.functions.invoke("summarize-insights");
        if (briefData && !briefData.error) {
          intelligenceBrief = briefData;
        }
      } catch (e) {
        console.warn("Could not fetch intelligence brief:", e);
      }

      const body = {
        rules: activeRules,
        intelligence_brief: intelligenceBrief,
        portfolio_value: totalValue,
      };

      const { data, error } = await supabase.functions.invoke("ideal-allocation", { body });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data as IdealAllocationResult;
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success("Ideal allocation generated");
    },
    onError: (error) => {
      console.error("Ideal allocation failed:", error);
      toast.error("Failed to generate allocation: " + error.message);
    },
  });

  return {
    result,
    generate: () => mutation.mutate(),
    isGenerating: mutation.isPending,
  };
}
