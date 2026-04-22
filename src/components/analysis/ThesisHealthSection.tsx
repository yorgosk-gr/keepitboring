import { useThesisStreaks, type ThesisStatus } from "@/hooks/useThesisChecks";
import { AlertTriangle, CheckCircle2, Clock, HelpCircle, Flame } from "lucide-react";
import { format } from "date-fns";

interface ThesisCheck {
  ticker: string;
  status: ThesisStatus;
  confidence?: "high" | "medium" | "low";
  evidence?: string;
  recommended_action?: string;
}

const STATUS_META: Record<ThesisStatus, {
  label: string;
  icon: typeof AlertTriangle;
  bar: string;
  text: string;
  bg: string;
}> = {
  invalidated: { label: "Invalidated", icon: AlertTriangle, bar: "bg-destructive", text: "text-destructive", bg: "bg-destructive/5 border-destructive/30" },
  reinforced:  { label: "Reinforced",  icon: CheckCircle2,  bar: "bg-emerald-500", text: "text-emerald-500", bg: "bg-emerald-500/5 border-emerald-500/30" },
  stale:       { label: "Stale",       icon: Clock,         bar: "bg-amber-500",   text: "text-amber-500",   bg: "bg-amber-500/5 border-amber-500/30" },
  silent:      { label: "No thesis",   icon: HelpCircle,    bar: "bg-muted-foreground", text: "text-muted-foreground", bg: "bg-muted/30 border-border" },
};

const STATUS_PRIORITY: Record<ThesisStatus, number> = {
  invalidated: 0,
  stale: 1,
  silent: 2,
  reinforced: 3,
};

export function ThesisHealthSection({ checks }: { checks: ThesisCheck[] }) {
  const { data: streaks = [] } = useThesisStreaks();
  const streakByTicker = new Map(streaks.map((s) => [s.ticker, s]));

  if (!checks || checks.length === 0) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-3 border-b border-border pb-2">Thesis Health</h2>
        <p className="text-sm text-muted-foreground">
          No thesis checks in this run. Add theses to your positions (Portfolio → Edit) so they can be evaluated against newsletter insights.
        </p>
      </section>
    );
  }

  const sorted = [...checks].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 99;
    const pb = STATUS_PRIORITY[b.status] ?? 99;
    if (pa !== pb) return pa - pb;
    // Within same status, longer streak surfaces first
    const sa = streakByTicker.get(a.ticker)?.streak_length ?? 0;
    const sb = streakByTicker.get(b.ticker)?.streak_length ?? 0;
    return sb - sa;
  });

  const counts = sorted.reduce<Record<ThesisStatus, number>>(
    (acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }),
    { invalidated: 0, reinforced: 0, stale: 0, silent: 0 }
  );

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3 border-b border-border pb-2">
        <h2 className="text-lg font-semibold">Thesis Health</h2>
        <div className="text-xs text-muted-foreground space-x-3">
          {counts.invalidated > 0 && <span className="text-destructive font-medium">{counts.invalidated} invalidated</span>}
          {counts.stale > 0 && <span className="text-amber-500">{counts.stale} stale</span>}
          {counts.silent > 0 && <span>{counts.silent} no thesis</span>}
          {counts.reinforced > 0 && <span className="text-emerald-500">{counts.reinforced} reinforced</span>}
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map((c, i) => {
          const meta = STATUS_META[c.status] ?? STATUS_META.silent;
          const Icon = meta.icon;
          const streak = streakByTicker.get(c.ticker);
          const streakLen = streak?.current_status === c.status ? (streak.streak_length ?? 1) : 1;

          return (
            <div key={`${c.ticker}-${i}`} className={`border rounded-md p-3 ${meta.bg} flex gap-3`}>
              <div className={`w-1 self-stretch rounded-full ${meta.bar}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Icon className={`h-4 w-4 ${meta.text}`} />
                  <span className="font-semibold text-sm">{c.ticker}</span>
                  <span className={`text-xs font-medium ${meta.text}`}>{meta.label}</span>
                  {streakLen >= 2 && c.status === "invalidated" && (
                    <span className="inline-flex items-center gap-1 text-xs text-destructive font-semibold">
                      <Flame className="h-3 w-3" />
                      {streakLen} runs
                    </span>
                  )}
                  {streakLen >= 2 && c.status !== "invalidated" && (
                    <span className="text-xs text-muted-foreground">{streakLen} runs</span>
                  )}
                  {c.confidence && (
                    <span className="text-xs text-muted-foreground">· {c.confidence} conf</span>
                  )}
                  {c.recommended_action && (
                    <span className="ml-auto text-xs font-mono px-1.5 py-0.5 rounded bg-background border border-border">
                      {c.recommended_action}
                    </span>
                  )}
                </div>
                {c.evidence && <p className="text-xs text-muted-foreground leading-relaxed">{c.evidence}</p>}
                {streak?.last_checked_at && streakLen > 1 && (
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                    Since {format(new Date(streak.last_checked_at), "MMM d")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
