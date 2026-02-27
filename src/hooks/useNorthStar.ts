import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface NorthStarPosition {
  id: string;
  portfolio_id: string;
  user_id: string;
  ticker: string;
  name: string | null;
  target_weight_min: number | null;
  target_weight_max: number | null;
  target_weight_ideal: number | null;
  rationale: string | null;
  priority: number;
  status: "build" | "hold" | "reduce" | "exit";
  created_at: string;
}

export interface NorthStarPortfolio {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cash_target_ideal: number | null;
  cash_target_min: number | null;
  cash_target_max: number | null;
  created_at: string;
  updated_at: string;
}

export function useNorthStar() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const portfolioQuery = useQuery({
    queryKey: ["north_star_portfolio", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("north_star_portfolio" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as NorthStarPortfolio | null;
    },
    enabled: !!user,
  });

  const positionsQuery = useQuery({
    queryKey: ["north_star_positions", portfolioQuery.data?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("north_star_positions" as any)
        .select("*")
        .eq("portfolio_id", portfolioQuery.data!.id)
        .order("target_weight_ideal", { ascending: false });
      if (error) throw error;
      return (data as unknown as NorthStarPosition[]) || [];
    },
    enabled: !!portfolioQuery.data?.id,
  });

  const createPortfolio = useMutation({
    mutationFn: async (opts: { name?: string; description?: string }) => {
      if (!user) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("north_star_portfolio" as any)
        .insert({ user_id: user.id, name: opts.name || "Target Portfolio", description: opts.description } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as NorthStarPortfolio;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["north_star_portfolio"] });
    },
  });

  const addPosition = useMutation({
    mutationFn: async (pos: Omit<NorthStarPosition, "id" | "created_at" | "user_id" | "portfolio_id">) => {
      if (!user || !portfolioQuery.data) throw new Error("No portfolio");
      const { error } = await supabase
        .from("north_star_positions" as any)
        .insert({
          ...pos,
          user_id: user.id,
          portfolio_id: portfolioQuery.data.id,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["north_star_positions"] });
      toast.success("Position added to North Star");
    },
    onError: (e) => toast.error(e.message),
  });

  const updatePosition = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<NorthStarPosition> & { id: string }) => {
      const { error } = await supabase
        .from("north_star_positions" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["north_star_positions"] });
      toast.success("Position updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePosition = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("north_star_positions" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["north_star_positions"] });
      toast.success("Position removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateCashTarget = useMutation({
    mutationFn: async (target: { cash_target_ideal: number; cash_target_min: number; cash_target_max: number }) => {
      if (!portfolioQuery.data) throw new Error("No portfolio");
      const { error } = await supabase
        .from("north_star_portfolio" as any)
        .update(target as any)
        .eq("id", portfolioQuery.data.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["north_star_portfolio"] });
      toast.success("Cash target saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const importFromCurrent = useMutation({
    mutationFn: async (currentPositions: { ticker: string; name: string | null; weight: number | null }[]) => {
      if (!user) throw new Error("Not authenticated");
      const { data: portfolio, error: pErr } = await supabase
        .from("north_star_portfolio" as any)
        .insert({ user_id: user.id, name: "Target Portfolio" } as any)
        .select()
        .single();
      if (pErr) throw pErr;
      const pid = (portfolio as any).id;

      const rows = currentPositions.map((p) => ({
        portfolio_id: pid,
        user_id: user.id,
        ticker: p.ticker,
        name: p.name,
        target_weight_min: p.weight ? Math.max(0, (p.weight - 2)) : null,
        target_weight_max: p.weight ? (p.weight + 2) : null,
        target_weight_ideal: p.weight,
        status: "hold",
        priority: 2,
      }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from("north_star_positions" as any)
          .insert(rows as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["north_star_portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["north_star_positions"] });
      toast.success("North Star created from current portfolio");
    },
    onError: (e) => toast.error(e.message),
  });

  return {
    portfolio: portfolioQuery.data,
    positions: positionsQuery.data ?? [],
    isLoading: portfolioQuery.isLoading,
    isLoadingPositions: positionsQuery.isLoading,
    createPortfolio: createPortfolio.mutateAsync,
    addPosition: addPosition.mutateAsync,
    updatePosition: updatePosition.mutateAsync,
    deletePosition: deletePosition.mutateAsync,
    updateCashTarget: updateCashTarget.mutateAsync,
    isUpdatingCashTarget: updateCashTarget.isPending,
    importFromCurrent: importFromCurrent.mutateAsync,
    isImporting: importFromCurrent.isPending,
  };
}
