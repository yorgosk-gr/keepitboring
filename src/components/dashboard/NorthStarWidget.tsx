import { Link } from "react-router-dom";
import { Compass, ArrowRight, TrendingUp, TrendingDown, CheckCircle2, Target } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNorthStar } from "@/hooks/useNorthStar";
import { useIBCurrentWeights, deriveStatus } from "@/hooks/useIBCurrentWeights";
import { useMemo } from "react";

export function NorthStarWidget() {
  const { portfolio, positions: nsPositions, isLoading } = useNorthStar();
  const { weights: ibWeights, totalValue } = useIBCurrentWeights();

  const { score, topMoves, exitPositions, aligned, total } = useMemo(() => {
    if (nsPositions.length === 0) return { score: 0, topMoves: [], exitPositions: [], aligned: 0, total: 0 };

    const enriched = nsPositions.map((pos) => {
      const currentWeight = ibWeights[pos.ticker] ?? 0;
      const derived = deriveStatus(currentWeight, pos.target_weight_min, pos.target_weight_max, pos.status);
      const gap = (pos.target_weight_ideal ?? 0) - currentWeight;
      const gapUSD = (gap / 100) * totalValue;
      return { ...pos, currentWeight, derivedStatus: derived, gap, gapUSD };
    });

    const nonExit = enriched.filter(p => p.status !== "exit");
    const exits = enriched.filter(p => p.status === "exit" && p.currentWeight > 0);
    const alignedNonExit = nonExit.filter(p => p.derivedStatus === "hold").length;
    const alignedExits = enriched.filter(p => p.status === "exit" && p.currentWeight === 0).length;
    const totalCount = nonExit.length + enriched.filter(p => p.status === "exit").length;
    const s = totalCount > 0 ? Math.round(((alignedNonExit + alignedExits) / totalCount) * 100) : 0;

    // Top moves: build positions furthest from target
    const buildMoves = enriched
      .filter(p => p.status === "build" && p.gap > 0.5)
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
      .slice(0, 2)
      .map(p => ({ ticker: p.ticker, action: "build" as const, gap: p.gap, gapUSD: p.gapUSD }));

    // Reduce moves
    const reduceMoves = enriched
      .filter(p => p.status === "reduce" && p.gap < -0.5)
      .sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap))
      .slice(0, 1)
      .map(p => ({ ticker: p.ticker, action: "reduce" as const, gap: p.gap, gapUSD: p.gapUSD }));

    return {
      score: s,
      topMoves: [...buildMoves, ...reduceMoves],
      exitPositions: exits.slice(0, 2),
      aligned: alignedNonExit + alignedExits,
      total: totalCount,
    };
  }, [nsPositions, ibWeights, totalValue]);

  if (isLoading || !portfolio) return null;

  const scoreColor = score >= 80 ? "text-emerald-500" : score >= 60 ? "text-amber-500" : "text-destructive";
  const progressColor = score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-destructive";

  return (
    <div className="stat-card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Compass className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">North Star Alignment</h3>
            <p className="text-xs text-muted-foreground">{aligned} of {total} positions on target</p>
          </div>
        </div>
        <Link to="/north-star">
          <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground h-7">
            Full view <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>

      {/* Score bar */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Portfolio alignment</span>
          <span className={`text-2xl font-bold tabular-nums ${scoreColor}`}>{score}%</span>
        </div>
        <div className="h-2.5 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Top moves */}
      {(topMoves.length > 0 || exitPositions.length > 0) && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Top moves to close gap</p>
          <div className="grid gap-1.5">
            {topMoves.map(move => (
              <div key={move.ticker} className="flex items-center justify-between py-1.5 px-2.5 rounded-md bg-secondary/50">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-mono text-sm font-semibold">{move.ticker}</span>
                  <Badge variant="outline" className="text-xs px-1.5 py-0 text-emerald-500 border-emerald-500/30">
                    Build
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  +{move.gap.toFixed(1)}% · ${Math.round(Math.abs(move.gapUSD) / 1000)}k
                </span>
              </div>
            ))}
            {exitPositions.map(pos => (
              <div key={pos.ticker} className="flex items-center justify-between py-1.5 px-2.5 rounded-md bg-secondary/50">
                <div className="flex items-center gap-2">
                  <TrendingDown className="w-3.5 h-3.5 text-destructive" />
                  <span className="font-mono text-sm font-semibold">{pos.ticker}</span>
                  <Badge variant="outline" className="text-xs px-1.5 py-0 text-destructive border-destructive/30">
                    Exit
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {pos.currentWeight.toFixed(1)}% remaining
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All aligned state */}
      {score >= 90 && topMoves.length === 0 && exitPositions.length === 0 && (
        <div className="flex items-center gap-2 text-emerald-500 text-sm">
          <CheckCircle2 className="w-4 h-4" />
          <span>Portfolio is well-aligned with your target</span>
        </div>
      )}

      {/* No north star set */}
      {total === 0 && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Target className="w-4 h-4" />
          <Link to="/north-star" className="hover:text-primary transition-colors">
            Define your target portfolio →
          </Link>
        </div>
      )}
    </div>
  );
}
