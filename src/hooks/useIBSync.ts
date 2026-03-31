import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface SyncResult {
  trades: number;
  positions: number;
  cash_transactions: number;
}

interface CorrelationResult {
  signals: number;
  aligned: number;
  alignment_rate: number;
  has_mismatch: boolean;
  current_profile: string;
}

export function useIBSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [correlationResult, setCorrelationResult] = useState<CorrelationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check if IB account is connected
  const { data: ibAccount, isLoading: isLoadingAccount } = useQuery({
    queryKey: ["ib-account", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("ib_accounts")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const sync = useCallback(async () => {
    if (!user) return;
    setIsSyncing(true);
    setError(null);

    try {
      // Step 1: Sync IB data
      const { data: syncData, error: syncError } = await supabase.functions.invoke("sync-ib-data");
      if (syncError) throw new Error(syncError.message);
      if (syncData?.error) throw new Error(syncData.error);

      setLastSyncResult(syncData.synced);
      toast.success(`Synced ${syncData.synced.trades} trades, ${syncData.synced.positions} positions`);

      // Step 2: Correlate signals
      const { data: corrData, error: corrError } = await supabase.functions.invoke("correlate-signals");
      if (corrError) throw new Error(corrError.message);
      if (corrData?.error) throw new Error(corrData.error);

      setCorrelationResult(corrData);

      if (corrData.has_mismatch) {
        toast.warning("Behavioral mismatch detected — consider recalibrating your risk profile");
      }

      // Step 3: Sync performance data
      try {
        const { data: perfData, error: perfError } = await supabase.functions.invoke("sync-ib-performance");
        if (perfError) {
          toast.error(`Performance sync: ${perfError.message}`);
        } else if (perfData?.error) {
          toast.error(`Performance sync: ${perfData.error}`);
        } else {
          toast.success(`Synced ${perfData.synced.nav_records} NAV records, ${perfData.synced.twr_records} TWR records`);
        }
        queryClient.invalidateQueries({ queryKey: ["nav-history"] });
        queryClient.invalidateQueries({ queryKey: ["twr-history"] });
      } catch (perfErr: any) {
        toast.error(`Performance sync failed: ${perfErr.message}`);
      }

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["ib-account"] });
      queryClient.invalidateQueries({ queryKey: ["risk-profile"] });
      queryClient.invalidateQueries({ queryKey: ["behavioral-signals"] });
    } catch (err: any) {
      const msg = err.message || "Sync failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSyncing(false);
    }
  }, [user, queryClient]);

  return {
    sync,
    isSyncing,
    isConnected: !!ibAccount,
    isLoadingAccount,
    ibAccount,
    lastSynced: ibAccount?.last_synced_at ?? null,
    lastSyncResult,
    correlationResult,
    error,
  };
}
