import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ThesisStatus = "invalidated" | "reinforced" | "stale" | "silent";

export interface ThesisStreak {
  ticker: string;
  current_status: ThesisStatus;
  streak_length: number;
  last_checked_at: string;
  last_evidence: string | null;
  last_recommended_action: string | null;
}

export interface ThesisCheckRow {
  id: string;
  ticker: string;
  status: ThesisStatus;
  confidence: "high" | "medium" | "low";
  evidence: string | null;
  recommended_action: string | null;
  thesis_snapshot: string | null;
  invalidation_trigger_snapshot: string | null;
  position_weight: number | null;
  created_at: string;
  analysis_id: string;
}

export function useThesisStreaks() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["thesis_check_streaks", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("thesis_check_streaks" as any)
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw error;
      return (data ?? []) as unknown as ThesisStreak[];
    },
    enabled: !!user,
  });
}

export function useThesisHistory(ticker: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["thesis_check_history", user?.id, ticker],
    queryFn: async () => {
      if (!ticker) return [];
      const { data, error } = await supabase
        .from("thesis_checks" as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("ticker", ticker)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as unknown as ThesisCheckRow[];
    },
    enabled: !!user && !!ticker,
  });
}
