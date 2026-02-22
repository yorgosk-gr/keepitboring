import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PositionToVerify {
  ticker: string;
  name?: string | null;
  isin?: string | null;
  shares?: number | null;
  current_price?: number | null;
  market_value?: number | null;
}

export interface VerifiedPosition {
  original_ticker: string;
  verified_ticker: string;
  name: string;
  asset_type: "stock" | "etf";
  category: "equity" | "bond" | "commodity" | "gold" | "country" | "theme";
  exchange: string;
  currency: string;
  current_price: number | null;
  verification_status: "confirmed" | "corrected" | "uncertain";
  notes: string;
}

interface VerificationProgress {
  current: number;
  total: number;
  status: "idle" | "verifying" | "complete" | "error";
}

const BATCH_SIZE = 5;

export function useTickerVerification() {
  const [isVerifying, setIsVerifying] = useState(false);
  const [progress, setProgress] = useState<VerificationProgress>({
    current: 0,
    total: 0,
    status: "idle",
  });

  const verifyPositions = useCallback(async (
    positions: PositionToVerify[]
  ): Promise<VerifiedPosition[]> => {
    if (positions.length === 0) return [];

    setIsVerifying(true);
    setProgress({ current: 0, total: positions.length, status: "verifying" });

    const allVerified: VerifiedPosition[] = [];
    const batches: PositionToVerify[][] = [];

    // Split into batches
    for (let i = 0; i < positions.length; i += BATCH_SIZE) {
      batches.push(positions.slice(i, i + BATCH_SIZE));
    }

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const startIndex = i * BATCH_SIZE;

        setProgress({
          current: startIndex + 1,
          total: positions.length,
          status: "verifying",
        });

        // Retry loop for rate limiting
        let retries = 0;
        const MAX_RETRIES = 3;
        let success = false;

        while (retries <= MAX_RETRIES && !success) {
          const { data, error } = await supabase.functions.invoke("verify-ticker", {
            body: { positions: batch },
          });

          if (error) {
            const isRateLimit = error.message?.includes("429") || 
              (typeof error === "object" && "status" in error && (error as any).status === 429);
            
            if (isRateLimit && retries < MAX_RETRIES) {
              retries++;
              const backoff = Math.min(15000 * retries, 60000); // 15s, 30s, 45s
              console.warn(`Rate limited on batch ${i + 1}, retrying in ${backoff / 1000}s (attempt ${retries}/${MAX_RETRIES})`);
              await new Promise(resolve => setTimeout(resolve, backoff));
              continue;
            }

            console.error("Verification error:", error);
            // Add unverified fallbacks for this batch
            for (const pos of batch) {
              allVerified.push({
                original_ticker: pos.ticker,
                verified_ticker: pos.ticker,
                name: pos.name || "Unknown",
                asset_type: "stock",
                category: "equity",
                exchange: "Unknown",
                currency: "USD",
                current_price: pos.current_price || null,
                verification_status: "uncertain",
                notes: "Verification failed: " + error.message,
              });
            }
            success = true; // exit retry loop
            continue;
          }

          if (data?.verified_positions) {
            allVerified.push(...data.verified_positions);
          }
          success = true;
        }

        // Longer delay between batches to respect Anthropic rate limits (30k tokens/min)
        if (i < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 12000));
        }
      }

      setProgress({ current: positions.length, total: positions.length, status: "complete" });
      toast.success(`Verified ${allVerified.length} positions`);
      return allVerified;

    } catch (error) {
      console.error("Verification failed:", error);
      setProgress({ current: 0, total: positions.length, status: "error" });
      toast.error("Verification failed. You can still import without verification.");
      
      // Return uncertain status for all positions on complete failure
      return positions.map(pos => ({
        original_ticker: pos.ticker,
        verified_ticker: pos.ticker,
        name: pos.name || "Unknown",
        asset_type: "stock" as const,
        category: "equity" as const,
        exchange: "Unknown",
        currency: "USD",
        current_price: pos.current_price || null,
        verification_status: "uncertain" as const,
        notes: "Verification service unavailable",
      }));

    } finally {
      setIsVerifying(false);
    }
  }, []);

  const verifySinglePosition = useCallback(async (
    position: PositionToVerify
  ): Promise<VerifiedPosition | null> => {
    setIsVerifying(true);
    setProgress({ current: 1, total: 1, status: "verifying" });

    try {
      const { data, error } = await supabase.functions.invoke("verify-ticker", {
        body: { positions: [position] },
      });

      if (error) {
        throw error;
      }

      setProgress({ current: 1, total: 1, status: "complete" });
      
      if (data?.verified_positions?.[0]) {
        toast.success(`Verified ${position.ticker}`);
        return data.verified_positions[0];
      }

      return null;

    } catch (error) {
      console.error("Verification failed:", error);
      setProgress({ current: 0, total: 1, status: "error" });
      toast.error("Verification failed");
      return null;

    } finally {
      setIsVerifying(false);
    }
  }, []);

  return {
    verifyPositions,
    verifySinglePosition,
    isVerifying,
    progress,
  };
}
