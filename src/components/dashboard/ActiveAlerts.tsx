import { Bell, AlertCircle, X, ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import type { Alert } from "@/hooks/useDashboardData";

interface ActiveAlertsProps {
  alerts: Alert[];
  isLoading?: boolean;
  onDismiss: (alertId: string) => void;
  isDismissing?: boolean;
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getSeverityIcon(severity: string | null) {
  switch (severity) {
    case "critical":
      return <span className="text-lg">🔴</span>;
    case "warning":
      return <span className="text-lg">🟡</span>;
    case "info":
    default:
      return <span className="text-lg">🔵</span>;
  }
}

function getAlertLink(alert: Alert): string {
  if (alert.position_id) return "/portfolio";
  if (alert.rule_id) return "/philosophy";
  return "/analysis";
}

export function ActiveAlerts({ alerts, isLoading, onDismiss, isDismissing }: ActiveAlertsProps) {
  if (isLoading) {
    return (
      <div className="stat-card">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-muted-foreground" />
          <h3 className="text-sm font-medium text-muted-foreground">Active Alerts</h3>
          {alerts.length > 0 && (
            <span className="px-2 py-0.5 text-xs font-medium bg-destructive/20 text-destructive rounded-full">
              {alerts.length}
            </span>
          )}
        </div>
      </div>
      
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No active alerts</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Your portfolio is on track
          </p>
          <Link to="/philosophy">
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              Create Alert Rule
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border ${
                alert.severity === "critical"
                  ? "bg-destructive/10 border-destructive/20"
                  : alert.severity === "warning"
                  ? "bg-warning/10 border-warning/20"
                  : "bg-primary/10 border-primary/20"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getSeverityIcon(alert.severity)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatTimeAgo(alert.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Link to={getAlertLink(alert)}>
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-7 w-7 hover:bg-destructive/20 hover:text-destructive"
                    onClick={() => onDismiss(alert.id)}
                    disabled={isDismissing}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
