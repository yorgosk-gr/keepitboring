import { useRecommendationTrackRecord } from "@/hooks/useRecommendationTrackRecord";

export function TrackRecordCard() {
  const { data, isLoading } = useRecommendationTrackRecord();

  if (isLoading || !data || data.totalRecommendations === 0) return null;

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Recommendation Track Record
        </h3>
        <span className="text-xs text-muted-foreground">last 20 analyses</span>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total recs" value={String(data.totalRecommendations)} />
        <Stat
          label="Followed"
          value={pct(data.followRate)}
          sub={`${data.followed}/${data.totalRecommendations}`}
        />
        <Stat
          label="Hit rate"
          value={data.withOutcome > 0 ? pct(data.hitRate) : "—"}
          sub={data.withOutcome > 0 ? `${data.correct}/${data.withOutcome}` : "no outcomes yet"}
        />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
