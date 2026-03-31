import {
  TrendingUp, TrendingDown, Target, Clock, Award, AlertTriangle, Tag,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Lesson } from "@/hooks/useDecisionJournal";

interface AnalyticsData {
  totalDecisions: number;
  reviewed: number;
  pending: number;
  winRate: number | null;
  right: number;
  wrong: number;
  avgHoldingDays: number | null;
  bestDecision: any | null;
  worstDecision: any | null;
}

interface Props {
  analytics: AnalyticsData;
  topLessons: Lesson[];
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  subtext?: string;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold text-foreground">{value}</p>
            {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const categoryColors: Record<string, string> = {
  bias: "bg-red-500/10 text-red-500",
  timing: "bg-amber-500/10 text-amber-500",
  sizing: "bg-blue-500/10 text-blue-500",
  thesis: "bg-emerald-500/10 text-emerald-500",
  process: "bg-purple-500/10 text-purple-500",
  other: "bg-muted text-muted-foreground",
};

export function JournalAnalytics({ analytics, topLessons }: Props) {
  const {
    totalDecisions, reviewed, pending, winRate, right, wrong,
    avgHoldingDays, bestDecision, worstDecision,
  } = analytics;

  return (
    <div className="space-y-4">
      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        <StatCard
          icon={Target}
          label="Win Rate"
          value={winRate !== null ? `${winRate.toFixed(0)}%` : "—"}
          subtext={reviewed > 0 ? `${right}W / ${wrong}L of ${reviewed} reviewed` : "No reviews yet"}
          color="bg-emerald-500/10 text-emerald-500"
        />
        <StatCard
          icon={Clock}
          label="Avg Holding"
          value={avgHoldingDays !== null ? `${Math.round(avgHoldingDays)}d` : "—"}
          subtext="days from entry to review"
          color="bg-blue-500/10 text-blue-500"
        />
        <StatCard
          icon={TrendingUp}
          label="Total Decisions"
          value={String(totalDecisions)}
          subtext={`${pending} pending review`}
          color="bg-primary/10 text-primary"
        />
        {bestDecision && (
          <StatCard
            icon={Award}
            label="Best Decision"
            value={bestDecision.ticker ?? bestDecision.position_ticker ?? "—"}
            subtext={bestDecision.entry_price && bestDecision.current_price
              ? `+${(((bestDecision.current_price - bestDecision.entry_price) / bestDecision.entry_price) * 100).toFixed(1)}%`
              : undefined}
            color="bg-emerald-500/10 text-emerald-500"
          />
        )}
        {worstDecision && (
          <StatCard
            icon={AlertTriangle}
            label="Worst Decision"
            value={worstDecision.ticker ?? worstDecision.position_ticker ?? "—"}
            subtext={worstDecision.entry_price && worstDecision.current_price
              ? `${(((worstDecision.current_price - worstDecision.entry_price) / worstDecision.entry_price) * 100).toFixed(1)}%`
              : undefined}
            color="bg-red-500/10 text-red-500"
          />
        )}
      </div>

      {/* Top Lessons */}
      {topLessons.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-primary" />
              <p className="text-sm font-medium text-foreground">My Patterns</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {topLessons.map(lesson => (
                <Badge
                  key={lesson.id}
                  variant="outline"
                  className={categoryColors[lesson.category] ?? categoryColors.other}
                >
                  {lesson.label}
                  <span className="ml-1.5 opacity-60">x{lesson.times_used}</span>
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
