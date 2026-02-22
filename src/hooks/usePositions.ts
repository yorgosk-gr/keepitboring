import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Position {
  id: string;
  user_id: string;
  ticker: string;
  name: string | null;
  position_type: string | null;
  category: string | null;
  exchange: string | null;
  shares: number | null;
  avg_cost: number | null;
  current_price: number | null;
  market_value: number | null;
  weight_percent: number | null;
  thesis_notes: string | null;
  bet_type: string | null;
  confidence_level: number | null;
  last_review_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface PositionFormData {
  ticker: string;
  name?: string;
  position_type: "stock" | "etf";
  category: "equity" | "bond" | "commodity";
  shares: number;
  avg_cost: number;
  current_price: number;
  bet_type: "core" | "satellite" | "explore";
  confidence_level: number;
  thesis_notes?: string;
  invalidation_triggers?: string;
}

export function usePositions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const positionsQuery = useQuery({
    queryKey: ["positions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("*")
        .order("market_value", { ascending: false });
      
      if (error) throw error;
      return data as Position[];
    },
    enabled: !!user,
  });

  const addPositionMutation = useMutation({
    mutationFn: async (formData: PositionFormData) => {
      const marketValue = formData.shares * formData.current_price;
      
      const { data, error } = await supabase
        .from("positions")
        .insert({
          user_id: user!.id,
          ticker: formData.ticker.toUpperCase(),
          name: formData.name || null,
          position_type: formData.position_type,
          category: formData.category,
          shares: formData.shares,
          avg_cost: formData.avg_cost,
          current_price: formData.current_price,
          market_value: marketValue,
          bet_type: formData.bet_type,
          confidence_level: formData.confidence_level,
          thesis_notes: formData.thesis_notes 
            ? `${formData.thesis_notes}${formData.invalidation_triggers ? `\n\n**Invalidation Triggers:**\n${formData.invalidation_triggers}` : ""}`
            : null,
          // Mark as manually classified since user set the category
          manually_classified: true,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      toast.success("Position added successfully");
    },
    onError: (error) => {
      toast.error("Failed to add position: " + error.message);
    },
  });

  const updatePositionMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: PositionFormData }) => {
      const marketValue = formData.shares * formData.current_price;
      
      const { data, error } = await supabase
        .from("positions")
        .update({
          ticker: formData.ticker.toUpperCase(),
          name: formData.name || null,
          position_type: formData.position_type,
          category: formData.category,
          shares: formData.shares,
          avg_cost: formData.avg_cost,
          current_price: formData.current_price,
          market_value: marketValue,
          bet_type: formData.bet_type,
          confidence_level: formData.confidence_level,
          thesis_notes: formData.thesis_notes 
            ? `${formData.thesis_notes}${formData.invalidation_triggers ? `\n\n**Invalidation Triggers:**\n${formData.invalidation_triggers}` : ""}`
            : null,
          // Mark as manually classified when user edits the category
          manually_classified: true,
        })
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      toast.success("Position updated successfully");
    },
    onError: (error) => {
      toast.error("Failed to update position: " + error.message);
    },
  });

  const deletePositionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("positions")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      toast.success("Position deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete position: " + error.message);
    },
  });

  const recalculateWeights = async () => {
    const positions = positionsQuery.data ?? [];
    const totalValue = positions.reduce((sum, p) => sum + (p.market_value ?? 0), 0);
    
    if (totalValue === 0) return;

    const updates = positions.map(p => ({
      id: p.id,
      weight_percent: ((p.market_value ?? 0) / totalValue) * 100,
    }));

    for (const update of updates) {
      await supabase
        .from("positions")
        .update({ weight_percent: update.weight_percent })
        .eq("id", update.id);
    }

    queryClient.invalidateQueries({ queryKey: ["positions"] });
  };

  return {
    positions: positionsQuery.data ?? [],
    isLoading: positionsQuery.isLoading,
    addPosition: addPositionMutation.mutateAsync,
    isAdding: addPositionMutation.isPending,
    updatePosition: updatePositionMutation.mutateAsync,
    isUpdating: updatePositionMutation.isPending,
    deletePosition: deletePositionMutation.mutateAsync,
    isDeleting: deletePositionMutation.isPending,
    recalculateWeights,
  };
}
