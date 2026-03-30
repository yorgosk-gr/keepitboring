import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DEFAULT_BOOK_PRINCIPLES, type BookPrinciple } from "@/data/bookPrinciples";
import { useRef } from "react";

export interface BookPrincipleRow {
  id: string;
  user_id: string;
  author: string;
  book: string;
  category: string;
  condition: string;
  principle: string;
  action_implication: string;
  tags: string[];
  is_active: boolean;
  created_at: string;
}

export function useBookPrinciples() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const hasSeededRef = useRef(false);

  // Fetch all principles for this user
  const principlesQuery = useQuery({
    queryKey: ["book_principles", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("book_principles")
        .select("*")
        .eq("user_id", user!.id)
        .order("author", { ascending: true });

      if (error) throw error;
      return (data ?? []) as BookPrincipleRow[];
    },
    enabled: !!user,
  });

  // Seed default principles (only inserts missing ones by condition+author key)
  const seedMutation = useMutation({
    mutationFn: async () => {
      if (!user || hasSeededRef.current) return;
      hasSeededRef.current = true;

      const { data: existing, error: fetchError } = await supabase
        .from("book_principles")
        .select("author, condition")
        .eq("user_id", user.id);

      if (fetchError) throw fetchError;

      // Build a set of existing author+condition keys to detect what's already seeded
      const existingKeys = new Set(
        (existing ?? []).map((r: any) => `${r.author}|||${r.condition}`)
      );

      const missing = DEFAULT_BOOK_PRINCIPLES.filter(
        (p) => !existingKeys.has(`${p.author}|||${p.condition}`)
      );

      if (missing.length === 0) return;

      const rows = missing.map((p) => ({
        user_id: user.id,
        author: p.author,
        book: p.book,
        category: p.category,
        condition: p.condition,
        principle: p.principle,
        action_implication: p.action_implication,
        tags: p.tags,
      }));

      // Insert in batches of 50 to avoid payload limits
      const batchSize = 50;
      for (let i = 0; i < rows.length; i += batchSize) {
        const batch = rows.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from("book_principles")
          .insert(batch);
        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book_principles"] });
    },
  });

  // Toggle active/inactive
  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("book_principles")
        .update({ is_active })
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book_principles"] });
    },
  });

  // Delete a principle
  const deletePrinciple = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("book_principles")
        .delete()
        .eq("id", id)
        .eq("user_id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book_principles"] });
    },
  });

  // Add a custom principle
  const addPrinciple = useMutation({
    mutationFn: async (principle: Omit<BookPrinciple, "tags"> & { tags?: string[] }) => {
      const { error } = await supabase
        .from("book_principles")
        .insert({
          user_id: user!.id,
          author: principle.author,
          book: principle.book,
          category: principle.category,
          condition: principle.condition,
          principle: principle.principle,
          action_implication: principle.action_implication,
          tags: principle.tags ?? [],
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["book_principles"] });
    },
  });

  // Get principles relevant to specific conditions/tags for AI injection
  const getRelevantPrinciples = (
    tags: string[],
    categories?: string[],
    limit = 20
  ): BookPrincipleRow[] => {
    const all = principlesQuery.data ?? [];
    const active = all.filter((p) => p.is_active);

    if (tags.length === 0 && (!categories || categories.length === 0)) {
      return active.slice(0, limit);
    }

    // Score each principle by relevance
    const scored = active.map((p) => {
      let score = 0;
      const pTags = p.tags ?? [];
      for (const t of tags) {
        if (pTags.includes(t)) score += 2;
      }
      if (categories) {
        for (const c of categories) {
          if (p.category === c) score += 3;
        }
      }
      return { principle: p, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.principle);
  };

  // Group principles by author/book for display
  const principlesByAuthor = (principlesQuery.data ?? []).reduce(
    (acc, p) => {
      const key = p.author;
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
      return acc;
    },
    {} as Record<string, BookPrincipleRow[]>
  );

  // Group by category for analysis
  const principlesByCategory = (principlesQuery.data ?? []).reduce(
    (acc, p) => {
      if (!acc[p.category]) acc[p.category] = [];
      acc[p.category].push(p);
      return acc;
    },
    {} as Record<string, BookPrincipleRow[]>
  );

  return {
    principles: principlesQuery.data ?? [],
    isLoading: principlesQuery.isLoading,
    principlesByAuthor,
    principlesByCategory,
    seedDefaultPrinciples: seedMutation.mutate,
    isSeeding: seedMutation.isPending,
    toggleActive: toggleActive.mutate,
    deletePrinciple: deletePrinciple.mutate,
    addPrinciple: addPrinciple.mutate,
    getRelevantPrinciples,
  };
}
