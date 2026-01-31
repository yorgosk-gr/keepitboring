import { Database, FileText, Lightbulb, Archive, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useInsightStats, type InsightsWindow } from "@/hooks/useInsightStats";
import { HelpTooltip } from "@/components/common/HelpTooltip";

interface StorageDashboardSectionProps {
  insightsWindow: InsightsWindow;
}

export function StorageDashboardSection({ insightsWindow }: StorageDashboardSectionProps) {
  const { data: stats, isLoading } = useInsightStats(insightsWindow);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const getHealthBadge = () => {
    if (!stats) return null;

    switch (stats.healthStatus) {
      case "green":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
            Clean & Focused
          </Badge>
        );
      case "amber":
        return (
          <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">
            Working Well
          </Badge>
        );
      case "red":
        return (
          <Badge className="bg-destructive/10 text-destructive border-destructive/20">
            May Be Less Focused
          </Badge>
        );
    }
  };

  const windowLabel = {
    "7": "7 days",
    "30": "30 days",
    "90": "90 days",
    all: "all time",
  }[insightsWindow];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Storage Dashboard</CardTitle>
            <HelpTooltip content="Overview of your newsletters and insights. Green = under 30 active insights, Amber = 30-50, Red = 50+ (analysis may be less focused)" />
          </div>
          {getHealthBadge()}
        </div>
        <CardDescription>
          Newsletter and insights storage overview
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Newsletters</p>
              <p className="text-xl font-semibold">{stats?.totalNewsletters ?? 0}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Insights</p>
              <p className="text-xl font-semibold">{stats?.totalInsights ?? 0}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Active Insights ({windowLabel})
              </p>
              <p className="text-xl font-semibold">{stats?.activeInsights ?? 0}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
              <Archive className="w-5 h-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Archived Newsletters</p>
              <p className="text-xl font-semibold">{stats?.archivedNewsletters ?? 0}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Database className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Last Analysis Used</p>
              <p className="text-xl font-semibold">
                {stats?.insightsInLastAnalysis ?? 0}
                <span className="text-sm font-normal text-muted-foreground"> / 50 max</span>
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
