import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Newsletter {
  id: string;
  user_id: string;
  source_name: string;
  upload_date: string;
  processed: boolean;
  processing_error?: string | null;
  file_path: string | null;
  raw_text: string | null;
  created_at: string;
  is_archived: boolean;
  insights_count?: number;
  source_confidence?: number | null;
  author?: string | null;
  publication_date?: string | null;
}

export interface Insight {
  id: string;
  newsletter_id: string;
  insight_type: string | null;
  content: string | null;
  sentiment: string | null;
  tickers_mentioned: string[] | null;
  confidence_words: string[] | null;
  is_starred: boolean;
  created_at: string;
}

export function useNewsletters() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const newslettersQuery = useQuery({
    queryKey: ["newsletters", user?.id],
    queryFn: async () => {
      const { data: newsletters, error } = await supabase
        .from("newsletters")
        .select("id, user_id, source_name, upload_date, processed, processing_error, file_path, created_at, is_archived, author, publication_date")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (newsletters.length === 0) return newsletters as Newsletter[];

      // Single query: get newsletter_id + metadata for counts AND confidence in one pass
      const newsletterIds = newsletters.map((n) => n.id);
      const { data: insightRows } = await supabase
        .from("insights")
        .select("newsletter_id, metadata")
        .in("newsletter_id", newsletterIds);

      const countsMap: Record<string, number> = {};
      const confidenceMap: Record<string, number[]> = {};

      for (const row of insightRows ?? []) {
        // Count
        countsMap[row.newsletter_id] = (countsMap[row.newsletter_id] ?? 0) + 1;
        // Confidence
        const meta = row.metadata as any;
        if (meta?.source_confidence) {
          if (!confidenceMap[row.newsletter_id]) confidenceMap[row.newsletter_id] = [];
          confidenceMap[row.newsletter_id].push(meta.source_confidence);
        }
      }

      return newsletters.map((n) => {
        const scores = confidenceMap[n.id];
        const avgConfidence = scores && scores.length > 0
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : null;
        return {
          ...n,
          insights_count: countsMap[n.id] ?? 0,
          source_confidence: avgConfidence,
        };
      }) as Newsletter[];
    },
    enabled: !!user,
  });

  const uploadNewsletterMutation = useMutation({
    mutationFn: async ({
      file,
      rawText,
      sourceName,
    }: {
      file?: File;
      rawText: string;
      sourceName: string;
    }) => {
      if (!user) throw new Error("Not authenticated");

      let filePath: string | null = null;

      // Upload file to storage only if a file is provided
      if (file) {
        // Sanitize filename for storage (preserve original name in database)
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        filePath = `${user.id}/${Date.now()}-${safeName}`;
        const { error: uploadError } = await supabase.storage
          .from("uploads")
          .upload(filePath, file);

        if (uploadError) throw uploadError;
      }

      // Create newsletter record
      const { data, error } = await supabase
        .from("newsletters")
        .insert({
          user_id: user.id,
          source_name: sourceName,
          file_path: filePath,
          raw_text: rawText,
          processed: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      toast.success("Newsletter saved — processing...");

      // Auto-process the newsletter immediately after upload
      try {
        await processNewsletterMutation.mutateAsync(data as Newsletter);
      } catch (e) {
        // Processing failure is already toasted by processNewsletterMutation.onError
        console.warn("Auto-process failed:", e);
      }
    },
    onError: (error) => {
      toast.error("Failed to save newsletter: " + error.message);
    },
  });

  const updateSourceNameMutation = useMutation({
    mutationFn: async ({ id, sourceName }: { id: string; sourceName: string }) => {
      const { error } = await supabase
        .from("newsletters")
        .update({ source_name: sourceName })
        .eq("id", id)
        .eq("user_id", user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    },
  });

  const processNewsletterMutation = useMutation({
    mutationFn: async (newsletter: Newsletter) => {
      // Fetch full newsletter including raw_text (not loaded in list query)
      let rawText = newsletter.raw_text;
      if (!rawText) {
        const { data: full, error } = await supabase
          .from("newsletters")
          .select("raw_text")
          .eq("id", newsletter.id)
          .eq("user_id", user!.id)
          .single();
        if (error) throw error;
        rawText = full?.raw_text ?? null;
      }
      if (!rawText) {
        throw new Error("No text content to process");
      }
      newsletter = { ...newsletter, raw_text: rawText };

      // Get session token for authenticated request
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error("You must be logged in to process newsletters");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-newsletter`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            newsletterId: newsletter.id,
            rawText: rawText!,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = result.retry_after_seconds ?? 30;
          throw new Error(`Rate limit reached. Please wait ${retryAfter} seconds and try again.`);
        }
        if (response.status === 409 && result.already_processing) {
          throw new Error("This newsletter is already being processed. Please wait for it to finish.");
        }
        throw new Error(result.error || "Processing failed");
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      queryClient.invalidateQueries({ queryKey: ["all_insights"] });
      toast.success(`Extracted ${result.insights_count} insights!`);
    },
    onError: (error) => {
      toast.error("Failed to process: " + error.message);
    },
  });

  const deleteNewsletterMutation = useMutation({
    mutationFn: async (newsletter: Newsletter) => {
      // Delete file from storage if exists
      if (newsletter.file_path) {
        await supabase.storage.from("uploads").remove([newsletter.file_path]);
      }

      // Verify ownership before deleting insights (insights table has no user_id column,
      // so we rely on the newsletter_id foreign key + this ownership check)
      const { data: owned } = await supabase
        .from("newsletters")
        .select("id")
        .eq("id", newsletter.id)
        .eq("user_id", user!.id)
        .maybeSingle();

      if (!owned) throw new Error("Newsletter not found or not owned by you");

      // Delete insights first (foreign key)
      await supabase.from("insights").delete().eq("newsletter_id", newsletter.id);

      // Delete newsletter
      const { error } = await supabase
        .from("newsletters")
        .delete()
        .eq("id", newsletter.id)
        .eq("user_id", user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      queryClient.invalidateQueries({ queryKey: ["all_insights"] });
      toast.success("Newsletter deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    },
  });

  return {
    newsletters: newslettersQuery.data ?? [],
    isLoading: newslettersQuery.isLoading,
    refetch: newslettersQuery.refetch,
    isRefetching: newslettersQuery.isRefetching,
    uploadNewsletter: uploadNewsletterMutation.mutateAsync,
    isUploading: uploadNewsletterMutation.isPending,
    updateSourceName: updateSourceNameMutation.mutate,
    processNewsletter: processNewsletterMutation.mutateAsync,
    isProcessing: processNewsletterMutation.isPending,
    deleteNewsletter: deleteNewsletterMutation.mutateAsync,
    isDeleting: deleteNewsletterMutation.isPending,
  };
}

export function useInsights(newsletterId: string | null) {
  const queryClient = useQueryClient();

  const insightsQuery = useQuery({
    queryKey: ["insights", newsletterId],
    queryFn: async () => {
      if (!newsletterId) return [];

      const { data, error } = await supabase
        .from("insights")
        .select("*")
        .eq("newsletter_id", newsletterId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data as Insight[];
    },
    enabled: !!newsletterId,
  });

  const toggleStarMutation = useMutation({
    mutationFn: async ({ id, isStarred }: { id: string; isStarred: boolean }) => {
      const { error } = await supabase
        .from("insights")
        .update({ is_starred: isStarred })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["insights"] });
    },
  });

  return {
    insights: insightsQuery.data ?? [],
    isLoading: insightsQuery.isLoading,
    toggleStar: toggleStarMutation.mutate,
  };
}
