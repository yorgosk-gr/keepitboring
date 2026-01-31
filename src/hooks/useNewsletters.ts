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
  file_path: string | null;
  raw_text: string | null;
  created_at: string;
  is_archived: boolean;
  insights_count?: number;
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
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get insights count for each newsletter
      const newsletterIds = newsletters.map((n) => n.id);
      if (newsletterIds.length === 0) return newsletters as Newsletter[];

      const { data: insightsCounts } = await supabase
        .from("insights")
        .select("newsletter_id")
        .in("newsletter_id", newsletterIds);

      const countsMap: Record<string, number> = {};
      insightsCounts?.forEach((i) => {
        countsMap[i.newsletter_id] = (countsMap[i.newsletter_id] || 0) + 1;
      });

      return newsletters.map((n) => ({
        ...n,
        insights_count: countsMap[n.id] || 0,
      })) as Newsletter[];
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
        filePath = `${user.id}/${Date.now()}-${file.name}`;
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      toast.success("Newsletter saved successfully");
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
        .eq("id", id);

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
      if (!newsletter.raw_text) {
        throw new Error("No text content to process");
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-newsletter`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            newsletterId: newsletter.id,
            rawText: newsletter.raw_text,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Processing failed");
      }
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
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

      // Delete insights first (foreign key)
      await supabase.from("insights").delete().eq("newsletter_id", newsletter.id);

      // Delete newsletter
      const { error } = await supabase
        .from("newsletters")
        .delete()
        .eq("id", newsletter.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      toast.success("Newsletter deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    },
  });

  return {
    newsletters: newslettersQuery.data ?? [],
    isLoading: newslettersQuery.isLoading,
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
