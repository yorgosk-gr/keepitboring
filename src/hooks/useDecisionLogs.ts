import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface DecisionLog {
  id: string;
  user_id: string;
  position_id: string | null;
  action_type: string | null;
  reasoning: string | null;
  information_set: string | null;
  confidence_level: number | null;
  probability_estimate: string | null;
  invalidation_triggers: string | null;
  outcome_notes: string | null;
  created_at: string;
  // Joined fields
  position_ticker?: string;
  position_name?: string;
}

export function useDecisionLogs(filters?: {
  action_type?: string;
  position_id?: string;
  start_date?: Date;
  end_date?: Date;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const decisionLogsQuery = useQuery({
    queryKey: ["decision_logs", user?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from("decision_log")
        .select(`
          *,
          positions (
            ticker,
            name
          )
        `)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (filters?.action_type && filters.action_type !== "all") {
        query = query.eq("action_type", filters.action_type);
      }

      if (filters?.position_id && filters.position_id !== "all") {
        if (filters.position_id === "portfolio-wide") {
          query = query.is("position_id", null);
        } else {
          query = query.eq("position_id", filters.position_id);
        }
      }

      if (filters?.start_date) {
        query = query.gte("created_at", filters.start_date.toISOString());
      }

      if (filters?.end_date) {
        query = query.lte("created_at", filters.end_date.toISOString());
      }

      const { data, error } = await query;

      if (error) throw error;

      return data.map((d: any) => ({
        ...d,
        position_ticker: d.positions?.ticker,
        position_name: d.positions?.name,
      })) as DecisionLog[];
    },
    enabled: !!user,
  });

  const addOutcomeMutation = useMutation({
    mutationFn: async ({ id, outcome_notes }: { id: string; outcome_notes: string }) => {
      const { error } = await supabase
        .from("decision_log")
        .update({ outcome_notes })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision_logs"] });
      toast.success("Outcome recorded");
    },
    onError: (error) => {
      toast.error("Failed to save: " + error.message);
    },
  });

  // Get decisions from around 30 days ago for review
  const getDecisionsForReview = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyFiveDaysAgo = new Date();
    thirtyFiveDaysAgo.setDate(thirtyFiveDaysAgo.getDate() - 35);

    const { data, error } = await supabase
      .from("decision_log")
      .select(`
        *,
        positions (
          ticker,
          name
        )
      `)
      .gte("created_at", thirtyFiveDaysAgo.toISOString())
      .lte("created_at", thirtyDaysAgo.toISOString())
      .order("created_at", { ascending: false });

    if (error) throw error;

    return data.map((d: any) => ({
      ...d,
      position_ticker: d.positions?.ticker,
      position_name: d.positions?.name,
    })) as DecisionLog[];
  };

  return {
    decisions: decisionLogsQuery.data ?? [],
    isLoading: decisionLogsQuery.isLoading,
    addOutcome: addOutcomeMutation.mutate,
    isAddingOutcome: addOutcomeMutation.isPending,
    getDecisionsForReview,
  };
}
