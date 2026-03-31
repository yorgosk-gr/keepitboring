import { Link } from "react-router-dom";
import { AlertTriangle, AlertCircle, Info, Newspaper, Target, Shield, Clock, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useActionFeed, type ActionItem, type ActionSeverity, type ActionSource } from "@/hooks/useActionFeed";

const severityConfig: Record<ActionSeverity, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
  warning: { icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-500/10" },
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-400/10" },
};

const sourceIcon: Record<ActionSource, typeof AlertTriangle> = {
  conviction_review: TrendingDown,
  rule_violation: Shield,
  north_star: Target,
  newsletter_mention: Newspaper,
  stale_data: Clock,
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function ActionRow({ item }: { item: ActionItem }) {
  const sev = severityConfig[item.severity];
  const SevIcon = sev.icon;
  const SourceIcon = sourceIcon[item.source];

  const content = (
    <div className={`flex items-start gap-3 p-3 rounded-lg ${sev.bg} hover:opacity-90 transition-opacity`}>
      <div className="flex-shrink-0 mt-0.5">
        <SevIcon className={`w-4 h-4 ${sev.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <SourceIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
          {item.triggeredAt && (
            <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
              {timeAgo(item.triggeredAt)}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.description}</p>
      </div>
    </div>
  );

  if (item.link) {
    return <Link to={item.link} className="block">{content}</Link>;
  }
  return content;
}

export function ActionFeedWidget() {
  const { actions, isLoading } = useActionFeed();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Actions Needed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (actions.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Actions Needed</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            All clear — no actions needed right now
          </p>
        </CardContent>
      </Card>
    );
  }

  const critical = actions.filter(a => a.severity === "critical").length;
  const warning = actions.filter(a => a.severity === "warning").length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Actions Needed</CardTitle>
          <div className="flex items-center gap-2 text-xs">
            {critical > 0 && (
              <span className="flex items-center gap-1 text-destructive font-medium">
                <AlertTriangle className="w-3 h-3" />
                {critical}
              </span>
            )}
            {warning > 0 && (
              <span className="flex items-center gap-1 text-amber-500 font-medium">
                <AlertCircle className="w-3 h-3" />
                {warning}
              </span>
            )}
            <span className="text-muted-foreground">{actions.length} total</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.slice(0, 8).map(item => (
          <ActionRow key={item.id} item={item} />
        ))}
        {actions.length > 8 && (
          <p className="text-xs text-muted-foreground text-center pt-1">
            +{actions.length - 8} more actions
          </p>
        )}
      </CardContent>
    </Card>
  );
}
