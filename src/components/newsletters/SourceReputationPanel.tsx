import { useEffect } from "react";
import { Star, TrendingUp, RefreshCw, Loader2, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSourceReputation } from "@/hooks/useSourceReputation";
import { formatDistanceToNow } from "date-fns";

const tierConfig = {
  elite: { label: "Elite", className: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
  reliable: { label: "Reliable", className: "bg-primary/15 text-primary border-primary/30" },
  average: { label: "Average", className: "bg-amber-500/15 text-amber-500 border-amber-500/30" },
  noise: { label: "Noise", className: "bg-muted text-muted-foreground border-border" },
};

export function SourceReputationPanel() {
  const { sources, isLoading, rebuildReputation, isRebuilding } = useSourceReputation();

  useEffect(() => {
    if (!isLoading && sources.length === 0) {
      rebuildReputation();
    }
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="text-sm">Loading source data...</span>
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Process some newsletters to build source reputation scores.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Source Quality Rankings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Based on data specificity, named sources cited, and conviction quality
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => rebuildReputation()}
          disabled={isRebuilding}
        >
          {isRebuilding
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <RefreshCw className="w-3.5 h-3.5" />
          }
          Recalculate
        </Button>
      </div>

      <div className="space-y-2">
        {sources.map((source) => {
          const tier = tierConfig[source.quality_tier];
          return (
            <div
              key={source.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{source.source_name}</span>
                  <Badge variant="outline" className={`text-xs px-1.5 py-0 ${tier.className}`}>
                    {tier.label}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <Progress value={source.quality_pct} className="h-1.5 flex-1" />
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {source.quality_pct}%
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">
                    {source.total_insights} insights
                  </span>
                  {source.high_conviction_insights > 0 && (
                    <span className="text-xs text-primary">
                      {source.high_conviction_insights} high-conviction
                    </span>
                  )}
                  {source.data_backed_insights > 0 && (
                    <span className="text-xs text-emerald-500">
                      {source.data_backed_insights} data-backed
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatDistanceToNow(new Date(source.last_seen_at), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        Scores update automatically when you process new newsletters. Elite sources cite specific data, price targets, and named analysts. Noise sources make vague directional claims without evidence.
      </p>
    </div>
  );
}
