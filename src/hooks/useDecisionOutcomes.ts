import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { subDays } from "date-fns";

export function useDecisionOutcomes() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch decisions that need outcome tracking
  const { data: pendingOutcomes = [] } = useQuery({
    queryKey: ["decision_outcomes_pending", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const thirtyDaysAgo = subDays(new Date(), 30).toISOString();
      const { data, error } = await supabase
        .from("decision_log" as any)
        .select("*")
        .eq("user_id", user!.id)
        .not("entry_price", "is", null)
        .is("outcome_30d", null)
        .lt("created_at", thirtyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Fetch decisions with outcomes for review
  const { data: completedOutcomes = [] } = useQuery({
    queryKey: ["decision_outcomes_complete", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decision_log" as any)
        .select("*")
        .eq("user_id", user!.id)
        .not("outcome_30d", "is", null)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Record an outcome for a decision
  const recordOutcome = useMutation({
    mutationFn: async ({
      decisionId,
      currentPrice,
      period,
    }: {
      decisionId: string;
      currentPrice: number;
      period: "30d" | "90d" | "180d";
    }) => {
      const { data: decision } = await supabase
        .from("decision_log" as any)
        .select("entry_price")
        .eq("id", decisionId)
        .single();

      if (!decision || !(decision as any).entry_price) return;

      const entryPrice = (decision as any).entry_price as number;
      const returnPct = ((currentPrice - entryPrice) / entryPrice) * 100;
      const field = `outcome_${period}`;

      await supabase
        .from("decision_log" as any)
        .update({
          [field]: returnPct,
          outcome_checked_at: new Date().toISOString(),
          was_correct: returnPct > 0,
        })
        .eq("id", decisionId)
        .eq("user_id", user!.id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision_outcomes_pending"] });
      queryClient.invalidateQueries({ queryKey: ["decision_outcomes_complete"] });
    },
  });

  // Calculate hit rate
  const hitRate = completedOutcomes.length > 0
    ? completedOutcomes.filter((d: any) => d.was_correct).length / completedOutcomes.length
    : null;

  const avgReturn30d = completedOutcomes.length > 0
    ? completedOutcomes.reduce((sum: number, d: any) => sum + (d.outcome_30d ?? 0), 0) / completedOutcomes.length
    : null;

  return {
    pendingOutcomes,
    completedOutcomes,
    hitRate,
    avgReturn30d,
    recordOutcome: recordOutcome.mutate,
  };
}
