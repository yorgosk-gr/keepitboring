import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { derivePositionType, deriveCategory, getReferenceName } from "@/lib/positionUtils";

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
  confidence_level: number | null;
  last_review_date: string | null;
  created_at: string;
  updated_at: string;
  manually_classified: boolean | null;
  unrealized_pnl: number | null;
  cost_basis_money: number | null;
  bet_type: string | null;
  invalidation_trigger: string | null;
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
  confidence_level: number;
  thesis_notes?: string;
  invalidation_triggers?: string;
  currency?: string;
  exchange?: string;
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
        .eq("user_id", user!.id)
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
        .select("ticker, thesis_notes, confidence_level, last_review_date, category, position_type, name, currency, exchange, manually_classified, bet_type, invalidation_trigger")
        .eq("user_id", user!.id);
      if (error) throw error;
      const map: Record<string, typeof data[number]> = {};
      for (const row of data) {
        map[row.ticker] = row;
      }
      return map;
    },
    enabled: !!user,
  });

  // Fetch ETF metadata for cross-referencing classification
  const etfMetadataQuery = useQuery({
    queryKey: ["etf_metadata", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etf_metadata")
        .select("*");
      if (error) throw error;
      const map: Record<string, typeof data[number]> = {};
      for (const item of data || []) {
        map[item.ticker] = item;
      }
      return map;
    },
  });

  // Helper: look up ETF metadata with 0/O fallback
  function lookupEtfMeta(ticker: string) {
    if (etfMeta[ticker]) return etfMeta[ticker];
    // Try swapping 0↔O for ticker mismatches (e.g. IB01 vs IBO1)
    const variant = ticker.replace(/0/g, "O");
    if (variant !== ticker && etfMeta[variant]) return etfMeta[variant];
    const variant2 = ticker.replace(/O/g, "0");
    if (variant2 !== ticker && etfMeta[variant2]) return etfMeta[variant2];
    return null;
  }

  // Merge IB positions with annotations + ETF metadata
  const etfMeta = etfMetadataQuery.data ?? {};
  const positions: Position[] = (ibPositionsQuery.data ?? []).map((ib) => {
    const ticker = ib.symbol || "";
    const ann = annotationsQuery.data?.[ticker];
    const meta = lookupEtfMeta(ticker);
    const hasEtfMetadata = !!meta;

    // Position type: manual override > etf_metadata > local reference > IB fields
    const posType = ann?.manually_classified
      ? (ann.position_type || derivePositionType(ib.asset_class, ib.sub_category, hasEtfMetadata, ticker))
      : derivePositionType(ib.asset_class, ib.sub_category, hasEtfMetadata, ticker);

    // Category: manual override > etf_metadata > local reference > IB fields
    const cat = ann?.manually_classified
      ? (ann.category || deriveCategory(ib.asset_class, meta?.category ?? null, ib.description, ticker))
      : deriveCategory(ib.asset_class, meta?.category ?? null, ib.description, ticker);

    return {
      id: ib.id,
      user_id: ib.user_id,
      ticker,
      name: ann?.name || meta?.full_name || getReferenceName(ticker) || ib.description || null,
      position_type: posType,
      category: cat,
      exchange: ann?.exchange || ib.listing_exchange || null,
      currency: ann?.currency || (ib as any).currency || null,
      shares: ib.quantity,
      avg_cost: ib.cost_basis_price,
      current_price: ib.mark_price,
      market_value: ib.position_value,
      weight_percent: ib.percent_of_nav,
      thesis_notes: ann?.thesis_notes || null,
      confidence_level: ann?.confidence_level || null,
      last_review_date: ann?.last_review_date || null,
      created_at: ib.created_at || new Date().toISOString(),
      updated_at: ib.synced_at || new Date().toISOString(),
      manually_classified: ann?.manually_classified || null,
      unrealized_pnl: ib.unrealized_pnl,
      cost_basis_money: ib.cost_basis_money,
      bet_type: ann?.bet_type || null,
      invalidation_trigger: ann?.invalidation_trigger || null,
    };
  });

  // Save/update annotations only (upsert to positions table keyed by ticker)
  const updateAnnotationMutation = useMutation({
    mutationFn: async ({ ticker, formData }: { ticker: string; formData: Partial<PositionFormData> }) => {
      if (!user) throw new Error("Not authenticated");

      const { data: existing } = await supabase
        .from("positions")
        .select("id")
        .eq("user_id", user.id)
        .eq("ticker", ticker)
        .maybeSingle();

      const annotationData: Record<string, any> = {
        manually_classified: true,
      };
      // Only set fields that are explicitly provided
      if ('thesis_notes' in formData) annotationData.thesis_notes = formData.thesis_notes || null;
      if ('confidence_level' in formData) annotationData.confidence_level = formData.confidence_level || null;
      if ('category' in formData) annotationData.category = formData.category || null;
      if ('position_type' in formData) annotationData.position_type = formData.position_type || null;
      if ('name' in formData) annotationData.name = formData.name || null;
      if ('currency' in formData) annotationData.currency = formData.currency || null;
      if ('exchange' in formData) annotationData.exchange = formData.exchange || null;
      if ('invalidation_triggers' in formData) annotationData.invalidation_trigger = formData.invalidation_triggers || null;
      if ('bet_type' in formData) annotationData.bet_type = (formData as any).bet_type || null;
      if ('last_review_date' in formData) annotationData.last_review_date = (formData as any).last_review_date || null;

      if (existing) {
        const { error } = await supabase
          .from("positions")
          .update(annotationData)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
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
