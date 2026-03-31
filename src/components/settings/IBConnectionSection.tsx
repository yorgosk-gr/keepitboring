import { RefreshCw, Link2, CheckCircle, AlertCircle, Clock, Plug, Save, BarChart3 } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIBSync } from "@/hooks/useIBSync";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export function IBConnectionSection() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const {
    sync,
    isSyncing,
    isConnected,
    isLoadingAccount,
    ibAccount,
    lastSynced,
    lastSyncResult,
    error,
  } = useIBSync();
  const [isConnecting, setIsConnecting] = useState(false);
  const [perfQueryId, setPerfQueryId] = useState("");
  const [isSavingPerfId, setIsSavingPerfId] = useState(false);

  useEffect(() => {
    if (ibAccount?.performance_query_id) {
      setPerfQueryId(ibAccount.performance_query_id);
    }
  }, [ibAccount?.performance_query_id]);

  const handleSavePerfQueryId = async () => {
    if (!user || !perfQueryId.trim()) return;
    setIsSavingPerfId(true);
    try {
      const { error: updateError } = await supabase
        .from("ib_accounts")
        .update({ performance_query_id: perfQueryId.trim() })
        .eq("user_id", user.id);
      if (updateError) throw updateError;
      toast.success("Performance query ID saved");
      await queryClient.invalidateQueries({ queryKey: ["ib-account"] });
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setIsSavingPerfId(false);
    }
  };

  const handleConnect = async () => {
    if (!user) return;
    setIsConnecting(true);
    try {
      const { error: insertError } = await supabase.from("ib_accounts").insert({
        user_id: user.id,
        ib_account_id: "U4594648",
        flex_token: "205881144990191816757120",
        flex_query_id: "1416087",
        performance_query_id: "1417057",
      });
      if (insertError) throw insertError;
      toast.success("IB account connected!");
      await queryClient.invalidateQueries({ queryKey: ["ib-account"] });
      // Wait briefly for query to refetch, then trigger sync
      setTimeout(() => sync(), 500);
    } catch (err: any) {
      toast.error(err.message || "Failed to connect IB account");
    } finally {
      setIsConnecting(false);
    }
  };

  if (isLoadingAccount) {
    return (
      <div className="stat-card space-y-4">
        <div className="h-6 w-48 bg-muted rounded animate-pulse" />
        <div className="h-4 w-full bg-muted rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="stat-card space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Link2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Interactive Brokers</h3>
            <p className="text-xs text-muted-foreground">
              Sync trades, positions & cash transactions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected ? (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <CheckCircle className="w-3.5 h-3.5" />
              Connected
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="w-3.5 h-3.5" />
              Not connected
            </span>
          )}
        </div>
      </div>

      {isConnected && (
        <>
          {lastSynced && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              Last synced {formatDistanceToNow(new Date(lastSynced), { addSuffix: true })}
            </div>
          )}

          {lastSyncResult && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-lg font-bold text-foreground">{lastSyncResult.trades}</p>
                <p className="text-xs text-muted-foreground">Trades</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-lg font-bold text-foreground">{lastSyncResult.positions}</p>
                <p className="text-xs text-muted-foreground">Positions</p>
              </div>
              <div className="p-3 rounded-lg bg-secondary/50 text-center">
                <p className="text-lg font-bold text-foreground">{lastSyncResult.cash_transactions}</p>
                <p className="text-xs text-muted-foreground">Cash Txns</p>
              </div>
            </div>
          )}

          {/* Performance Query ID */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-muted-foreground" />
              <label className="text-xs font-medium text-muted-foreground">
                Performance FlexQuery ID
              </label>
            </div>
            <div className="flex gap-2">
              <Input
                value={perfQueryId}
                onChange={(e) => setPerfQueryId(e.target.value)}
                placeholder="e.g. 1416088"
                className="text-sm h-9"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 shrink-0"
                onClick={handleSavePerfQueryId}
                disabled={isSavingPerfId || !perfQueryId.trim() || perfQueryId.trim() === ibAccount?.performance_query_id}
              >
                <Save className="w-3.5 h-3.5" />
                Save
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              FlexQuery with EquitySummaryByReportDateInBase & ChangeInNAV sections for NAV/TWR history
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            onClick={sync}
            disabled={isSyncing}
            className="w-full gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Syncing..." : "Sync Portfolio"}
          </Button>
        </>
      )}

      {!isConnected && (
        <Button
          onClick={handleConnect}
          disabled={isConnecting || isSyncing}
          className="w-full gap-2"
        >
          {isConnecting || isSyncing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Plug className="w-4 h-4" />
          )}
          {isConnecting ? "Connecting..." : isSyncing ? "Syncing..." : "Connect IB Account"}
        </Button>
      )}
    </div>
  );
}
