import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface JournalEntry {
  id: string;
  user_id: string;
  position_id: string | null;
  ticker: string | null;
  action_type: string | null;
  reasoning: string | null;
  information_set: string | null;
  confidence_level: number | null;
  probability_estimate: string | null;
  invalidation_triggers: string | null;
  entry_price: number | null;
  entry_date: string | null;
  expected_timeframe: string | null;
  assumptions: Assumption[] | null;
  outcome_status: string | null;
  outcome_notes: string | null;
  surprise_notes: string | null;
  different_notes: string | null;
  lesson_ids: string[] | null;
  locked_at: string | null;
  reviewed_at: string | null;
  review_prompted_at: string | null;
  price_at_review: number | null;
  outcome_30d: number | null;
  outcome_90d: number | null;
  outcome_180d: number | null;
  was_correct: boolean | null;
  created_at: string;
  // Joined
  position_ticker?: string;
  position_name?: string;
  current_price?: number;
}

export interface Assumption {
  text: string;
  invalidated: boolean;
}

export interface Lesson {
  id: string;
  user_id: string;
  label: string;
  category: string;
  description: string | null;
  times_used: number;
  first_used_at: string;
  created_at: string;
}

export function useDecisionJournal(filters?: {
  action_type?: string;
  outcome_status?: string;
  ticker?: string;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all journal entries
  const entriesQuery = useQuery({
    queryKey: ["journal-entries", user?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from("decision_log")
        .select(`
          *,
          positions (ticker, name, current_price)
        `)
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (filters?.action_type && filters.action_type !== "all") {
        query = query.eq("action_type", filters.action_type);
      }
      if (filters?.outcome_status && filters.outcome_status !== "all") {
        query = query.eq("outcome_status", filters.outcome_status);
      }
      if (filters?.ticker) {
        query = query.ilike("ticker", `%${filters.ticker}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data ?? []).map((d: any) => ({
        ...d,
        position_ticker: d.positions?.ticker ?? d.ticker,
        position_name: d.positions?.name,
        current_price: d.positions?.current_price,
        assumptions: Array.isArray(d.assumptions) ? d.assumptions : [],
      })) as JournalEntry[];
    },
    enabled: !!user,
  });

  // Fetch lessons
  const lessonsQuery = useQuery({
    queryKey: ["decision-lessons", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decision_lessons" as any)
        .select("*")
        .eq("user_id", user!.id)
        .order("times_used", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Lesson[];
    },
    enabled: !!user,
  });

  // Update outcome/review for a journal entry
  const updateEntry = useMutation({
    mutationFn: async (params: {
      id: string;
      outcome_status?: string;
      outcome_notes?: string;
      surprise_notes?: string;
      different_notes?: string;
      lesson_ids?: string[];
      assumptions?: Assumption[];
      price_at_review?: number;
    }) => {
      const update: any = {};
      if (params.outcome_status) update.outcome_status = params.outcome_status;
      if (params.outcome_notes !== undefined) update.outcome_notes = params.outcome_notes;
      if (params.surprise_notes !== undefined) update.surprise_notes = params.surprise_notes;
      if (params.different_notes !== undefined) update.different_notes = params.different_notes;
      if (params.lesson_ids) update.lesson_ids = params.lesson_ids;
      if (params.assumptions) update.assumptions = params.assumptions;
      if (params.price_at_review) update.price_at_review = params.price_at_review;
      if (params.outcome_status && params.outcome_status !== "pending" && params.outcome_status !== "reviewing") {
        update.reviewed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("decision_log")
        .update(update)
        .eq("id", params.id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["decision_logs"] });
      toast.success("Journal entry updated");
    },
    onError: (e) => toast.error("Failed to update: " + e.message),
  });

  // Create a lesson
  const createLesson = useMutation({
    mutationFn: async (params: { label: string; category: string; description?: string }) => {
      const { data, error } = await supabase
        .from("decision_lessons" as any)
        .insert({
          user_id: user!.id,
          label: params.label,
          category: params.category,
          description: params.description,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Lesson;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision-lessons"] });
      toast.success("Lesson saved");
    },
    onError: (e) => toast.error("Failed to save lesson: " + e.message),
  });

  // Increment lesson usage count
  const useLesson = useMutation({
    mutationFn: async (lessonId: string) => {
      const lesson = lessonsQuery.data?.find(l => l.id === lessonId);
      if (!lesson) return;
      await supabase
        .from("decision_lessons" as any)
        .update({ times_used: lesson.times_used + 1 } as any)
        .eq("id", lessonId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["decision-lessons"] }),
  });

  // Analytics
  const entries = entriesQuery.data ?? [];
  const reviewed = entries.filter(e => e.reviewed_at);
  const right = reviewed.filter(e => e.outcome_status === "right").length;
  const wrong = reviewed.filter(e => e.outcome_status === "wrong").length;
  const winRate = reviewed.length > 0 ? (right / reviewed.length) * 100 : null;

  // Average holding period
  const holdingPeriods = reviewed
    .filter(e => e.entry_date && e.reviewed_at)
    .map(e => (new Date(e.reviewed_at!).getTime() - new Date(e.entry_date!).getTime()) / 86_400_000);
  const avgHoldingDays = holdingPeriods.length > 0
    ? holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length
    : null;

  // Most common lessons
  const lessons = lessonsQuery.data ?? [];
  const topLessons = [...lessons].sort((a, b) => b.times_used - a.times_used).slice(0, 5);

  // Best/worst by price change
  const withPriceChange = entries.filter(e => e.entry_price && e.current_price);
  const sorted = [...withPriceChange].sort((a, b) => {
    const aReturn = ((a.current_price! - a.entry_price!) / a.entry_price!) * 100;
    const bReturn = ((b.current_price! - b.entry_price!) / b.entry_price!) * 100;
    return bReturn - aReturn;
  });
  const bestDecision = sorted[0] ?? null;
  const worstDecision = sorted[sorted.length - 1] ?? null;

  return {
    entries,
    lessons,
    topLessons,
    isLoading: entriesQuery.isLoading,
    isLessonsLoading: lessonsQuery.isLoading,
    updateEntry: updateEntry.mutate,
    isUpdating: updateEntry.isPending,
    createLesson: createLesson.mutateAsync,
    useLesson: useLesson.mutate,
    analytics: {
      totalDecisions: entries.length,
      reviewed: reviewed.length,
      pending: entries.filter(e => !e.reviewed_at && e.outcome_status === "pending").length,
      winRate,
      right,
      wrong,
      avgHoldingDays,
      bestDecision,
      worstDecision,
    },
  };
}
