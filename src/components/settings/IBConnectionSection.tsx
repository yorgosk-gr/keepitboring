import { RefreshCw, Link2, CheckCircle, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIBSync } from "@/hooks/useIBSync";
import { formatDistanceToNow } from "date-fns";

export function IBConnectionSection() {
  const {
    sync,
    isSyncing,
    isConnected,
    isLoadingAccount,
    lastSynced,
    lastSyncResult,
    error,
  } = useIBSync();

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
        <p className="text-sm text-muted-foreground">
          To connect your IB account, add your Flex Query credentials to the database. 
          Contact support for setup assistance.
        </p>
      )}
    </div>
  );
}
