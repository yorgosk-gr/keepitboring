import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export interface ETFClassification {
  ticker: string;
  full_name: string;
  issuer: string;
  tracks: string;
  category: "equity" | "bond" | "commodity";
  sub_category: string;
  geography: string;
  is_broad_market: boolean;
  asset_class_details: string;
  expense_ratio: number | null;
  classification_reasoning: string;
}

interface ClassificationResult {
  success: boolean;
  classifications: ETFClassification[];
  fromCache: number;
  classified: number;
}

interface ETFToClassify {
  ticker: string;
  name?: string;
}

export function useETFClassification() {
  const [isClassifying, setIsClassifying] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ETFClassification[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const classifyETFs = useCallback(async (
    etfs: ETFToClassify[],
    options?: { forceReclassify?: boolean; batchSize?: number }
  ): Promise<ETFClassification[]> => {
    const { forceReclassify = false, batchSize = 5 } = options || {};
    
    if (etfs.length === 0) {
      return [];
    }

    setIsClassifying(true);
    setResults([]);
    setProgress({ current: 0, total: etfs.length });

    const allClassifications: ETFClassification[] = [];
    const batches: ETFToClassify[][] = [];

    // Split into batches
    for (let i = 0; i < etfs.length; i += batchSize) {
      batches.push(etfs.slice(i, i + batchSize));
    }

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        setProgress({ 
          current: i * batchSize + 1, 
          total: etfs.length 
        });

        const { data, error } = await supabase.functions.invoke("classify-etf", {
          body: { etfs: batch, forceReclassify },
        });

        if (error) {
          console.error("Classification batch error:", error);
          toast({
            title: "Classification Error",
            description: `Failed to classify batch ${i + 1}: ${error.message}`,
            variant: "destructive",
          });
          continue;
        }

        if (data?.classifications) {
          allClassifications.push(...data.classifications);
          setResults(prev => [...prev, ...data.classifications]);
        }

        // Small delay between batches to avoid rate limits
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      setProgress({ current: etfs.length, total: etfs.length });

      // Categorize results for summary
      const summary = allClassifications.reduce((acc, c) => {
        acc[c.category] = (acc[c.category] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const summaryText = Object.entries(summary)
        .map(([cat, count]) => `${count} ${cat}`)
        .join(", ");

      if (allClassifications.length > 0) {
        toast({
          title: "ETFs Classified",
          description: `Classified ${allClassifications.length} ETFs: ${summaryText}`,
        });
      }

      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["etf_metadata"] });

      return allClassifications;

    } catch (error) {
      console.error("Classification error:", error);
      toast({
        title: "Classification Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive",
      });
      return allClassifications;
    } finally {
      setIsClassifying(false);
    }
  }, [toast, queryClient]);

  const updatePositionCategories = useCallback(async (
    classifications: ETFClassification[],
    userId: string
  ): Promise<void> => {
    for (const classification of classifications) {
      const { error } = await supabase
        .from("positions")
        .update({ category: classification.category })
        .eq("ticker", classification.ticker)
        .eq("user_id", userId)
        .eq("position_type", "etf")
        .eq("manually_classified", false);

      if (error) {
        console.error(`Failed to update category for ${classification.ticker}:`, error);
      }
    }

    queryClient.invalidateQueries({ queryKey: ["positions"] });
  }, [queryClient]);

  return {
    classifyETFs,
    updatePositionCategories,
    isClassifying,
    progress,
    results,
  };
}
