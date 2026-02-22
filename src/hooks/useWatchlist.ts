import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface WatchlistItem {
  id: string;
  user_id: string;
  ticker: string;
  name: string | null;
  position_type: string | null;
  category: string | null;
  target_price: number;
  invalidation_price: number | null;
  intended_size_percent: number | null;
  thesis: string | null;
  source: string | null;
  notes: string | null;
  current_price: number | null;
  currency: string | null;
  exchange: string | null;
  last_price_refresh: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchlistFormData {
  ticker: string;
  name?: string;
  position_type: "stock" | "etf";
  category: "Equities" | "Bonds" | "Commodities";
  target_price: number;
  invalidation_price?: number | null;
  intended_size_percent?: number | null;
  thesis?: string;
  source?: string;
  notes?: string;
  currency?: string;
  exchange?: string;
}

export function useWatchlist() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["watchlist", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("watchlist")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as WatchlistItem[];
    },
    enabled: !!user,
  });

  const addItem = useMutation({
    mutationFn: async (form: WatchlistFormData) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("watchlist").insert({
        user_id: user.id,
        ticker: form.ticker.toUpperCase(),
        name: form.name || null,
        position_type: form.position_type,
        category: form.category,
        target_price: form.target_price,
        invalidation_price: form.invalidation_price ?? null,
        intended_size_percent: form.intended_size_percent ?? null,
        thesis: form.thesis || null,
        source: form.source || null,
        notes: form.notes || null,
        currency: form.currency || "USD",
        exchange: form.exchange || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success("Added to watchlist");
    },
    onError: () => toast.error("Failed to add to watchlist"),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<WatchlistFormData> & Record<string, any> }) => {
      const { error } = await supabase
        .from("watchlist")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("watchlist").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success("Removed from watchlist");
    },
    onError: () => toast.error("Failed to remove item"),
  });

  const updatePrices = async (prices: { ticker: string; price: number }[]) => {
    const now = new Date().toISOString();
    for (const p of prices) {
      const matching = items.filter((i) => i.ticker === p.ticker);
      for (const item of matching) {
        await supabase
          .from("watchlist")
          .update({ current_price: p.price, last_price_refresh: now })
          .eq("id", item.id);
      }
    }
    queryClient.invalidateQueries({ queryKey: ["watchlist"] });
  };

  // Stats
  const triggered = items.filter((i) => i.current_price != null && i.current_price <= i.target_price);
  const approaching = items.filter((i) => {
    if (i.current_price == null) return false;
    const dist = ((i.current_price - i.target_price) / i.target_price) * 100;
    return dist > 0 && dist <= 5;
  });
  const waiting = items.length - triggered.length - approaching.length;

  return {
    items,
    isLoading,
    addItem: addItem.mutateAsync,
    isAdding: addItem.isPending,
    updateItem: updateItem.mutateAsync,
    deleteItem: deleteItem.mutateAsync,
    updatePrices,
    stats: {
      total: items.length,
      triggered: triggered.length,
      approaching: approaching.length,
      waiting,
    },
  };
}
