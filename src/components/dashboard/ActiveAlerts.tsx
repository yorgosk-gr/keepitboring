import { Bell, AlertCircle } from "lucide-react";

export function ActiveAlerts() {
  const alerts: { id: string; message: string; type: "warning" | "error" }[] = [];

  return (
    <div className="stat-card">
      <div className="flex items-center gap-2 mb-4">
        <Bell className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-medium text-muted-foreground">Active Alerts</h3>
      </div>
      
      {alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center mb-3">
            <AlertCircle className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No active alerts</p>
          <p className="text-xs text-muted-foreground mt-1">
            Your portfolio is on track
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border ${
                alert.type === "error"
                  ? "bg-destructive/10 border-destructive/20"
                  : "bg-warning/10 border-warning/20"
              }`}
            >
              <p className="text-sm text-foreground">{alert.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
