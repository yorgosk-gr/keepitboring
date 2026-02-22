import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePhilosophyRules } from "./usePhilosophyRules";
import { usePositions } from "./usePositions";
import { toast } from "sonner";
import type { AnalysisResult } from "./usePortfolioAnalysis";

export type IdealAllocationMode = "clean_slate" | "adjust";

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
  const { positions } = usePositions();
  const [result, setResult] = useState<IdealAllocationResult | null>(null);
  const [mode, setMode] = useState<IdealAllocationMode>("clean_slate");

  const mutation = useMutation({
    mutationFn: async (params: { mode: IdealAllocationMode; currentAnalysis?: AnalysisResult | null }) => {
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

      const body: any = {
        rules: activeRules,
        intelligence_brief: intelligenceBrief,
        mode: params.mode === "adjust" ? "adjust" : "clean_slate",
      };

      if (params.mode === "adjust") {
        body.positions = positions;
        if (params.currentAnalysis) {
          body.analysis = params.currentAnalysis;
        }
      }

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
    mode,
    setMode,
    generate: (currentAnalysis?: AnalysisResult | null) =>
      mutation.mutate({ mode, currentAnalysis }),
    isGenerating: mutation.isPending,
  };
}
