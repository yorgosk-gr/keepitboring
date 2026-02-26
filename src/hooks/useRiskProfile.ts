import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export type RiskProfileType = "cautious" | "balanced" | "growth" | "aggressive";

export interface RiskProfile {
  id: string;
  user_id: string;
  profile: RiskProfileType;
  score: number | null;
  dimension_scores: Record<string, number> | null;
  source: "onboarding" | "update";
  is_active: boolean;
  applied_at: string;
  created_at: string;
}

export interface BehavioralSignal {
  id: string;
  symbol: string;
  action: string;
  aligned: boolean;
  profile_at_time: string;
  signal_date: string;
  notes: string;
  market_event_id: string;
}

export function useRiskProfile() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: activeProfile, isLoading } = useQuery({
    queryKey: ["risk-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("risk_profiles")
        .select("*")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      return data as RiskProfile | null;
    },
    enabled: !!user,
  });

  const { data: behavioralSignals = [] } = useQuery({
    queryKey: ["behavioral-signals", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("behavioral_signals")
        .select("*")
        .eq("user_id", user.id)
        .order("signal_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as BehavioralSignal[];
    },
    enabled: !!user,
  });

  const { data: marketEvents = [] } = useQuery({
    queryKey: ["market-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_events")
        .select("*")
        .order("event_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveProfile = useMutation({
    mutationFn: async ({
      profile,
      score,
      dimensionScores,
      source,
    }: {
      profile: RiskProfileType;
      score: number;
      dimensionScores: Record<string, number>;
      source: "onboarding" | "update";
    }) => {
      if (!user) throw new Error("Not authenticated");

      // Deactivate previous profiles
      await supabase
        .from("risk_profiles")
        .update({ is_active: false })
        .eq("user_id", user.id)
        .eq("is_active", true);

      // Insert new profile
      const { data, error } = await supabase
        .from("risk_profiles")
        .insert({
          user_id: user.id,
          profile,
          score,
          dimension_scores: dimensionScores,
          source,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["risk-profile"] });
      toast.success("Risk profile updated");
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to save risk profile");
    },
  });

  return {
    activeProfile,
    isLoading,
    hasProfile: !!activeProfile,
    behavioralSignals,
    marketEvents,
    saveProfile,
  };
}
