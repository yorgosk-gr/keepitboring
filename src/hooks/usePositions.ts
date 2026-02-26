import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

// Unified position type combining IB data + annotations
export interface Position {
  id: string;
  user_id: string;
  ticker: string;
  name: string | null;
  position_type: string | null;
  category: string | null;
  exchange: string | null;
  currency: string | null;
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
  manually_classified: boolean | null;
  unrealized_pnl: number | null;
}

// Annotation-only form data (no shares/price/ticker editing)
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
  currency?: string;
  exchange?: string;
}

function derivePositionType(assetClass: string | null, subCategory: string | null): string {
  const ac = (assetClass || "").toUpperCase();
  const sc = (subCategory || "").toUpperCase();
  if (ac === "STK") return "stock";
  if (ac === "FND" || ac === "ETF" || sc.includes("ETF")) return "etf";
  if (ac === "BOND" || ac === "BILL") return "bond";
  return "stock";
}

function deriveCategory(assetClass: string | null): string {
  const ac = (assetClass || "").toUpperCase();
  if (ac === "BOND" || ac === "BILL") return "bond";
  if (ac === "CMDTY") return "commodity";
  return "equity";
}

export function usePositions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch IB positions as primary source
  const ibPositionsQuery = useQuery({
    queryKey: ["ib-positions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ib_positions")
        .select("*")
        .order("position_value", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  // Fetch annotations from positions table (keyed by ticker)
  const annotationsQuery = useQuery({
    queryKey: ["position-annotations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("positions")
        .select("ticker, thesis_notes, bet_type, confidence_level, last_review_date, category, position_type, name, currency, exchange, manually_classified");
      if (error) throw error;
      // Index by ticker
      const map: Record<string, typeof data[number]> = {};
      for (const row of data) {
        map[row.ticker] = row;
      }
      return map;
    },
    enabled: !!user,
  });

  // Merge IB positions with annotations
  const positions: Position[] = (ibPositionsQuery.data ?? []).map((ib) => {
    const ticker = ib.symbol || "";
    const ann = annotationsQuery.data?.[ticker];
    const posType = ann?.manually_classified ? (ann.position_type || derivePositionType(ib.asset_class, ib.sub_category)) : derivePositionType(ib.asset_class, ib.sub_category);
    const cat = ann?.manually_classified ? (ann.category || deriveCategory(ib.asset_class)) : deriveCategory(ib.asset_class);

    return {
      id: ib.id,
      user_id: ib.user_id,
      ticker,
      name: ann?.name || ib.description || null,
      position_type: posType,
      category: cat,
      exchange: ann?.exchange || null,
      currency: ann?.currency || null,
      shares: ib.quantity,
      avg_cost: ib.cost_basis_price,
      current_price: ib.mark_price,
      market_value: ib.position_value,
      weight_percent: ib.percent_of_nav,
      thesis_notes: ann?.thesis_notes || null,
      bet_type: ann?.bet_type || null,
      confidence_level: ann?.confidence_level || null,
      last_review_date: ann?.last_review_date || null,
      created_at: ib.created_at || new Date().toISOString(),
      updated_at: ib.synced_at || new Date().toISOString(),
      manually_classified: ann?.manually_classified || null,
      unrealized_pnl: ib.unrealized_pnl,
    };
  });

  // Save/update annotations only (upsert to positions table keyed by ticker)
  const updateAnnotationMutation = useMutation({
    mutationFn: async ({ ticker, formData }: { ticker: string; formData: Partial<PositionFormData> }) => {
      if (!user) throw new Error("Not authenticated");

      // Check if annotation row exists
      const { data: existing } = await supabase
        .from("positions")
        .select("id")
        .eq("user_id", user.id)
        .eq("ticker", ticker)
        .maybeSingle();

      const annotationData = {
        thesis_notes: formData.thesis_notes
          ? `${formData.thesis_notes}${formData.invalidation_triggers ? `\n\n**Invalidation Triggers:**\n${formData.invalidation_triggers}` : ""}`
          : null,
        bet_type: formData.bet_type || null,
        confidence_level: formData.confidence_level || null,
        category: formData.category || null,
        position_type: formData.position_type || null,
        name: formData.name || null,
        currency: formData.currency || null,
        exchange: formData.exchange || null,
        manually_classified: true,
      };

      if (existing) {
        const { error } = await supabase
          .from("positions")
          .update(annotationData)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        // Create annotation row — need dummy values for required fields
        const ibPos = ibPositionsQuery.data?.find(p => p.symbol === ticker);
        const { error } = await supabase
          .from("positions")
          .insert({
            user_id: user.id,
            ticker,
            shares: ibPos?.quantity || 0,
            avg_cost: ibPos?.cost_basis_price || 0,
            current_price: ibPos?.mark_price || 0,
            market_value: ibPos?.position_value || 0,
            ...annotationData,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["position-annotations"] });
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      toast.success("Position annotations updated");
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  return {
    positions,
    isLoading: ibPositionsQuery.isLoading || annotationsQuery.isLoading,
    updateAnnotation: updateAnnotationMutation.mutateAsync,
    isUpdating: updateAnnotationMutation.isPending,
  };
}
