import { History, Plus, ArrowUpRight, ArrowDownRight, RefreshCw, Scissors, PlusCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import type { DecisionLog, Position } from "@/hooks/useDashboardData";

interface RecentActivityProps {
  decisionLogs: DecisionLog[];
  positions: Position[];
  isLoading?: boolean;
}

function getActionIcon(actionType: string | null) {
  switch (actionType) {
    case "buy":
      return <ArrowUpRight className="w-4 h-4 text-primary" />;
    case "sell":
      return <ArrowDownRight className="w-4 h-4 text-destructive" />;
    case "hold":
      return <RefreshCw className="w-4 h-4 text-muted-foreground" />;
    case "trim":
      return <Scissors className="w-4 h-4 text-warning" />;
    case "add":
      return <PlusCircle className="w-4 h-4 text-primary" />;
    case "rebalance":
      return <RotateCcw className="w-4 h-4 text-chart-3" />;
    default:
      return <History className="w-4 h-4 text-muted-foreground" />;
  }
}

function getActionLabel(actionType: string | null) {
  switch (actionType) {
    case "buy": return "Bought";
    case "sell": return "Sold";
    case "hold": return "Hold";
    case "trim": return "Trimmed";
    case "add": return "Added";
    case "rebalance": return "Rebalanced";
    default: return "Action";
  }
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function RecentActivity({ decisionLogs, positions, isLoading }: RecentActivityProps) {
  if (isLoading) {
    return (
      <div className="stat-card">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-muted-foreground" />
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // Map position IDs to tickers
  const positionMap = new Map(positions.map(p => [p.id, p]));

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">Recent Activity</h3>
        </div>
      </div>

      {decisionLogs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <History className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No recent activity</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Record your investment decisions
          </p>
          <Link to="/portfolio">
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Log Decision
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {decisionLogs.map((log) => {
            const position = log.position_id ? positionMap.get(log.position_id) : null;
            
            return (
              <div
                key={log.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-secondary/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  {getActionIcon(log.action_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">
                    <span className="font-medium">{getActionLabel(log.action_type)}</span>
                    {position && (
                      <span className="text-primary ml-1">{position.ticker}</span>
                    )}
                  </p>
                  {log.reasoning && (
                    <p className="text-xs text-muted-foreground truncate">
                      {log.reasoning}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {formatDate(log.created_at)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
