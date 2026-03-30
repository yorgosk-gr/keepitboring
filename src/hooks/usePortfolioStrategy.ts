import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface PositionEntry {
  ticker: string;
  rationale: string;
}

export interface PortfolioStrategy {
  id: string;
  user_id: string;
  mandate: string | null;
  philosophy: string | null;
  target_description: string | null;
  priorities: string[] | null;
  positions_to_build: PositionEntry[] | null;
  positions_to_exit: PositionEntry[] | null;
  constraints: string | null;
  updated_at: string;
}

const DEFAULT_STRATEGY = {
  mandate: "Long-term wealth building, Balanced risk profile, 3-5 year horizon",
  philosophy: "Index core with high-conviction satellites",
  target_description: "Build a diversified portfolio with a broad market ETF core and selective individual stock positions",
  priorities: [
    "Build a broad market equity core (60%+ of portfolio)",
    "Limit individual stocks to highest-conviction names only",
    "Maintain geographic diversification across developed and emerging markets",
    "Keep a cash buffer as dry powder for opportunities",
  ],
  positions_to_build: [],
  positions_to_exit: [],
  constraints: "No single position above 15% of portfolio",
};

export function usePortfolioStrategy() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["portfolio_strategy", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("portfolio_strategy" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as unknown as PortfolioStrategy | null;
    },
    enabled: !!user,
  });

  const upsertMutation = useMutation({
    mutationFn: async (strategy: Partial<PortfolioStrategy>) => {
      if (!user) throw new Error("Not authenticated");

      const existing = query.data;

      if (existing) {
        const { error } = await supabase
          .from("portfolio_strategy" as any)
          .update({
            ...strategy,
            updated_at: new Date().toISOString(),
          } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("portfolio_strategy" as any)
          .insert({
            user_id: user.id,
            ...strategy,
            updated_at: new Date().toISOString(),
          } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio_strategy"] });
      toast.success("Strategy brief saved");
    },
    onError: (error) => {
      toast.error("Failed to save: " + error.message);
    },
  });

  const seedDefault = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("portfolio_strategy" as any)
        .insert({
          user_id: user.id,
          ...DEFAULT_STRATEGY,
          updated_at: new Date().toISOString(),
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio_strategy"] });
    },
  });

  return {
    strategy: query.data,
    isLoading: query.isLoading,
    upsertStrategy: upsertMutation.mutateAsync,
    isSaving: upsertMutation.isPending,
    seedDefault: seedDefault.mutateAsync,
    isSeeding: seedDefault.isPending,
  };
}
