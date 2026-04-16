import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, AlertCircle, Info, Newspaper, Shield, Clock, TrendingDown, X, ChevronDown, ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActionFeed, type ActionItem, type ActionSeverity, type ActionSource } from "@/hooks/useActionFeed";

const severityConfig: Record<ActionSeverity, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  critical: { icon: AlertTriangle, color: "text-destructive", bg: "bg-destructive/10" },
  warning: { icon: AlertCircle, color: "text-amber-500", bg: "bg-amber-500/10" },
  info: { icon: Info, color: "text-blue-400", bg: "bg-blue-400/10" },
};

const sourceIcon: Record<ActionSource, typeof AlertTriangle> = {
  rebalance: Shield,
  conviction_review: TrendingDown,
  thesis_missing: Info,
  newsletter_bearish: Newspaper,
  stale_data: Clock,
};

function ActionRow({ item, onDismiss }: { item: ActionItem; onDismiss?: () => void }) {
  const sev = severityConfig[item.severity];
  const SevIcon = sev.icon;
  const SourceIcon = sourceIcon[item.source];

  const content = (
    <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg ${sev.bg}`}>
      <SevIcon className={`w-4 h-4 ${sev.color} flex-shrink-0`} />
      <SourceIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{item.title}</p>
      </div>
      {item.dismissible && onDismiss && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDismiss(); }}
          className="p-1 rounded hover:bg-background/50 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );

  if (item.link) {
    return <Link to={item.link} className="block">{content}</Link>;
  }
  return content;
}

export function ActionFeedWidget() {
  const { actions, isLoading, dismiss } = useActionFeed();
  const [expanded, setExpanded] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Actions Needed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (actions.length === 0) return null;

  const critical = actions.filter(a => a.severity === "critical").length;
  const visible = expanded ? actions : actions.slice(0, 4);
  const hasMore = actions.length > 4;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            Actions Needed
            {critical > 0 && (
              <span className="flex items-center gap-1 text-xs text-destructive font-medium">
                <AlertTriangle className="w-3 h-3" />
                {critical}
              </span>
            )}
          </CardTitle>
          <span className="text-xs text-muted-foreground">{actions.length} total</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {visible.map(item => (
          <ActionRow
            key={item.id}
            item={item}
            onDismiss={item.dismissible ? () => dismiss(item) : undefined}
          />
        ))}
        {hasMore && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs text-muted-foreground gap-1"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <>Show less <ChevronUp className="w-3 h-3" /></>
            ) : (
              <>{actions.length - 4} more <ChevronDown className="w-3 h-3" /></>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
