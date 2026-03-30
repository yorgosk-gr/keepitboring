import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Activity,
  BookOpen,
  Newspaper,
  Clock,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

// ── Health Score Widget ──────────────────────────────────────────
function HealthScoreWidget() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["latest-health-score", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("analysis_history")
        .select("health_score, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (isLoading) return <WidgetSkeleton />;
  if (!data) {
    return (
      <Link to="/analysis" className="block">
        <WidgetCard>
          <Activity className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Health Score</p>
            <p className="text-sm text-muted-foreground">No analysis yet</p>
          </div>
        </WidgetCard>
      </Link>
    );
  }

  const score = data.health_score ?? 0;
  const color = score >= 75 ? "text-primary" : score >= 50 ? "text-amber-500" : "text-destructive";
  const age = formatDistanceToNow(new Date(data.created_at), { addSuffix: true });

  return (
    <Link to="/analysis" className="block">
      <WidgetCard>
        <Activity className={`w-5 h-5 ${color}`} />
        <div>
          <p className="text-xs text-muted-foreground">Health Score</p>
          <p className={`text-lg font-bold tabular-nums ${color}`}>{score}/100</p>
          <p className="text-[10px] text-muted-foreground">{age}</p>
        </div>
      </WidgetCard>
    </Link>
  );
}

// ── Philosophy Violations Widget ─────────────────────────────────
function PhilosophyViolationsWidget() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["active-alerts-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("resolved", false);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  if (isLoading) return <WidgetSkeleton />;

  const count = data ?? 0;
  const color = count === 0 ? "text-primary" : count <= 2 ? "text-amber-500" : "text-destructive";

  return (
    <Link to="/philosophy" className="block">
      <WidgetCard>
        {count === 0 ? (
          <CheckCircle2 className="w-5 h-5 text-primary" />
        ) : (
          <AlertTriangle className={`w-5 h-5 ${color}`} />
        )}
        <div>
          <p className="text-xs text-muted-foreground">Rule Violations</p>
          {count === 0 ? (
            <p className="text-sm font-medium text-primary">All clear</p>
          ) : (
            <p className={`text-lg font-bold tabular-nums ${color}`}>{count}</p>
          )}
        </div>
      </WidgetCard>
    </Link>
  );
}

// ── Newsletter Intelligence Widget ──────────────────────────────
function NewsletterIntelWidget() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["newsletter-dashboard-status", user?.id],
    queryFn: async () => {
      // Get latest intelligence brief
      const { data: brief, error: briefErr } = await supabase
        .from("intelligence_briefs")
        .select("generated_at, newsletters_analyzed")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (briefErr) throw briefErr;

      // Count unprocessed newsletters
      const { count: unprocessed, error: nlErr } = await supabase
        .from("newsletters")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_processed", false)
        .eq("is_archived", false);
      if (nlErr) throw nlErr;

      return {
        briefDate: brief?.generated_at ?? null,
        newslettersAnalyzed: brief?.newsletters_analyzed ?? 0,
        unprocessed: unprocessed ?? 0,
      };
    },
    enabled: !!user,
  });

  if (isLoading) return <WidgetSkeleton />;

  const briefDate = data?.briefDate;
  const unprocessed = data?.unprocessed ?? 0;

  if (!briefDate && unprocessed === 0) {
    return (
      <Link to="/newsletters" className="block">
        <WidgetCard>
          <Newspaper className="w-5 h-5 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">Intelligence</p>
            <p className="text-sm text-muted-foreground">No briefs yet</p>
          </div>
        </WidgetCard>
      </Link>
    );
  }

  const briefAge = briefDate
    ? Math.floor((Date.now() - new Date(briefDate).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const briefColor =
    briefAge === null ? "text-muted-foreground" :
    briefAge <= 3 ? "text-primary" :
    briefAge <= 7 ? "text-amber-500" : "text-destructive";

  return (
    <Link to="/newsletters" className="block">
      <WidgetCard>
        <Newspaper className={`w-5 h-5 ${briefColor}`} />
        <div>
          <p className="text-xs text-muted-foreground">Intelligence</p>
          {briefAge !== null && (
            <p className={`text-sm font-medium ${briefColor}`}>
              {briefAge === 0 ? "Today" : `${briefAge}d ago`}
            </p>
          )}
          {unprocessed > 0 && (
            <p className="text-[10px] text-amber-500">{unprocessed} unprocessed</p>
          )}
        </div>
      </WidgetCard>
    </Link>
  );
}

// ── Last Synced Widget ──────────────────────────────────────────
function LastSyncedWidget({ daysSinceUpdate }: { daysSinceUpdate: number | null }) {
  const color =
    daysSinceUpdate === null ? "text-muted-foreground" :
    daysSinceUpdate <= 1 ? "text-primary" :
    daysSinceUpdate <= 3 ? "text-foreground" :
    daysSinceUpdate <= 7 ? "text-amber-500" : "text-destructive";

  return (
    <Link to="/portfolio" className="block">
      <WidgetCard>
        <RefreshCw className={`w-5 h-5 ${color}`} />
        <div>
          <p className="text-xs text-muted-foreground">Last Synced</p>
          {daysSinceUpdate === null ? (
            <p className="text-sm text-muted-foreground">Never</p>
          ) : daysSinceUpdate === 0 ? (
            <p className="text-sm font-medium text-primary">Today</p>
          ) : (
            <p className={`text-sm font-medium ${color}`}>{daysSinceUpdate}d ago</p>
          )}
        </div>
      </WidgetCard>
    </Link>
  );
}

// ── Book Wisdom Widget ──────────────────────────────────────────
function BookWisdomWidget() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["book-principles-count", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("book_principles")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id)
        .eq("is_active", true);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });

  if (isLoading) return <WidgetSkeleton />;

  return (
    <Link to="/philosophy" className="block">
      <WidgetCard>
        <BookOpen className="w-5 h-5 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground">Book Wisdom</p>
          <p className="text-sm font-medium text-foreground">{data} principles</p>
        </div>
      </WidgetCard>
    </Link>
  );
}

// ── Shared Helpers ──────────────────────────────────────────────
function WidgetCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-secondary/30 transition-colors h-full">
      {children}
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
      <Skeleton className="w-5 h-5 rounded" />
      <div className="space-y-1.5">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}

// ── Main Export ──────────────────────────────────────────────────
export function DashboardStatusRow({ daysSinceUpdate }: { daysSinceUpdate: number | null }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <HealthScoreWidget />
      <PhilosophyViolationsWidget />
      <NewsletterIntelWidget />
      <LastSyncedWidget daysSinceUpdate={daysSinceUpdate} />
      <BookWisdomWidget />
    </div>
  );
}
