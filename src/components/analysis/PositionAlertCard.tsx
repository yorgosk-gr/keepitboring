import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, XCircle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { PositionAlert } from "@/hooks/usePortfolioAnalysis";

interface PositionAlertCardProps {
  alert: PositionAlert;
}

export function PositionAlertCard({ alert }: PositionAlertCardProps) {
  const getSeverityStyles = (severity: "warning" | "critical") => {
    return severity === "critical" 
      ? "border-destructive/50 bg-destructive/5" 
      : "border-yellow-500/50 bg-yellow-500/5";
  };

  const getSeverityIcon = (severity: "warning" | "critical") => {
    return severity === "critical" 
      ? <XCircle className="w-5 h-5 text-destructive" />
      : <AlertTriangle className="w-5 h-5 text-yellow-500" />;
  };

  const getAlertTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      size: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      quality: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      rationale: "bg-orange-500/10 text-orange-500 border-orange-500/20",
      sentiment: "bg-pink-500/10 text-pink-500 border-pink-500/20",
    };
    return styles[type] || "bg-secondary text-secondary-foreground";
  };

  const getSentimentIcon = (sentiment: string | null | undefined) => {
    const lower = (sentiment ?? "").toLowerCase();
    if (lower.includes("bullish")) return <TrendingUp className="w-4 h-4 text-primary" />;
    if (lower.includes("bearish")) return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className={cn(
      "p-4 rounded-lg border-2",
      getSeverityStyles(alert.severity)
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {getSeverityIcon(alert.severity)}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg">{alert.ticker}</span>
              <Badge variant="outline" className={getAlertTypeBadge(alert.alert_type)}>
                {alert.alert_type}
              </Badge>
            </div>
            <p className="text-sm text-foreground">{alert.issue}</p>
          </div>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
        <div className="flex items-center gap-2 text-sm">
          {getSentimentIcon(alert.recent_sentiment)}
          <span className="text-muted-foreground">Sentiment:</span>
          <span>{alert.recent_sentiment}</span>
        </div>
        
        <div className="text-sm">
          <span className="text-muted-foreground">Recommendation:</span>
          <p className="mt-1 text-primary font-medium">{alert.recommendation}</p>
        </div>
      </div>
    </div>
  );
}
