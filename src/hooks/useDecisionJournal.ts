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
  alternative_scenarios: string | null;
  reversal_information: string | null;
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

  // Fetch all journal entries (joined with IB positions for live mark_price)
  const entriesQuery = useQuery({
    queryKey: ["journal-entries", user?.id, filters],
    queryFn: async () => {
      let query = supabase
        .from("decision_log")
        .select(`
          *,
          positions (ticker, name)
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

      const [entriesRes, ibRes] = await Promise.all([
        query,
        supabase
          .from("ib_positions")
          .select("symbol, mark_price")
          .eq("user_id", user!.id),
      ]);
      if (entriesRes.error) throw entriesRes.error;

      const markBySymbol = new Map<string, number>();
      for (const p of ibRes.data ?? []) {
        if (p.symbol && p.mark_price != null) markBySymbol.set(p.symbol, p.mark_price);
      }

      return (entriesRes.data ?? []).map((d: any) => {
        const ticker = d.positions?.ticker ?? d.ticker;
        return {
          ...d,
          position_ticker: ticker,
          position_name: d.positions?.name,
          current_price: ticker ? markBySymbol.get(ticker) ?? null : null,
          assumptions: Array.isArray(d.assumptions) ? d.assumptions : [],
        };
      }) as JournalEntry[];
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

  // Update a journal entry (thesis fields + outcome/review)
  const updateEntry = useMutation({
    mutationFn: async (params: {
      id: string;
      // Thesis fields (editable)
      action_type?: string;
      position_id?: string | null;
      ticker?: string | null;
      reasoning?: string;
      invalidation_triggers?: string;
      confidence_level?: number;
      entry_price?: number | null;
      entry_date?: string | null;
      // Review fields
      outcome_status?: string;
      outcome_notes?: string;
      lesson_ids?: string[];
      price_at_review?: number;
    }) => {
      const update: any = {};
      if (params.action_type !== undefined) update.action_type = params.action_type;
      if (params.position_id !== undefined) update.position_id = params.position_id;
      if (params.ticker !== undefined) update.ticker = params.ticker;
      if (params.reasoning !== undefined) update.reasoning = params.reasoning;
      if (params.invalidation_triggers !== undefined) update.invalidation_triggers = params.invalidation_triggers;
      if (params.confidence_level !== undefined) update.confidence_level = params.confidence_level;
      if (params.entry_price !== undefined) update.entry_price = params.entry_price;
      if (params.entry_date !== undefined) update.entry_date = params.entry_date;
      if (params.outcome_status) update.outcome_status = params.outcome_status;
      if (params.outcome_notes !== undefined) update.outcome_notes = params.outcome_notes;
      if (params.lesson_ids) update.lesson_ids = params.lesson_ids;
      if (params.price_at_review != null) update.price_at_review = params.price_at_review;
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

  // Delete a journal entry
  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("decision_log")
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["decision_logs"] });
      toast.success("Journal entry deleted");
    },
    onError: (e) => toast.error("Failed to delete: " + e.message),
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
        .eq("id", lessonId)
        .eq("user_id", user!.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["decision-lessons"] }),
  });

  // Analytics
  const entries = entriesQuery.data ?? [];
  const reviewed = entries.filter(e => e.reviewed_at);
  const right = reviewed.filter(e => e.outcome_status === "right").length;
  const wrong = reviewed.filter(e => e.outcome_status === "wrong").length;
  const verdicts = right + wrong;
  const winRate = verdicts > 0 ? (right / verdicts) * 100 : null;

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
  const withPriceChange = entries.filter(e => e.entry_price && e.entry_price !== 0 && e.current_price);
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
    deleteEntry: deleteEntry.mutate,
    isDeleting: deleteEntry.isPending,
    createLesson: createLesson.mutateAsync,
    useLesson: useLesson.mutate,
    analytics: {
      totalDecisions: entries.length,
      reviewed: reviewed.length,
      verdicts,
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
