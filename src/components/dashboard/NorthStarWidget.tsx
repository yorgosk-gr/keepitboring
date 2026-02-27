import { Link } from "react-router-dom";
import { Compass, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useNorthStar } from "@/hooks/useNorthStar";
import { useIBCurrentWeights, deriveStatus } from "@/hooks/useIBCurrentWeights";
import { useMemo } from "react";

export function NorthStarWidget() {
  const { portfolio, positions: nsPositions, isLoading } = useNorthStar();
  const { weights: ibWeights, totalValue } = useIBCurrentWeights();

  const { score, topBuy, topExit } = useMemo(() => {
    if (nsPositions.length === 0) return { score: 0, topBuy: null, topExit: null };

    const enriched = nsPositions.map((pos) => {
      const currentWeight = ibWeights[pos.ticker] ?? 0;
      const derived = deriveStatus(currentWeight, pos.target_weight_min, pos.target_weight_max, pos.status);
      return { ...pos, currentWeight, derivedStatus: derived };
    });

    const nonExit = enriched.filter((p) => p.status !== "exit");
    const exitPositions = enriched.filter((p) => p.status === "exit");

    const alignedNonExit = nonExit.filter((p) => p.derivedStatus === "hold").length;
    const alignedExit = exitPositions.filter((p) => p.currentWeight === 0).length;

    const total = nonExit.length + exitPositions.length;
    const s = total > 0 ? Math.round(((alignedNonExit + alignedExit) / total) * 100) : 0;

    // Top build action
    const buildPositions = enriched
      .filter((p) => p.derivedStatus === "build" && p.currentWeight < (p.target_weight_ideal ?? 0))
      .sort((a, b) => ((b.target_weight_ideal ?? 0) - b.currentWeight) - ((a.target_weight_ideal ?? 0) - a.currentWeight));

    let topBuyItem: { ticker: string; usd: number } | null = null;
    if (buildPositions.length > 0) {
      const p = buildPositions[0];
      const usd = (((p.target_weight_ideal ?? 0) - p.currentWeight) / 100) * totalValue;
      topBuyItem = { ticker: p.ticker, usd };
    }

    // Top exit action
    const exitWithWeight = exitPositions.filter((p) => p.currentWeight > 0);
    let topExitItem: { ticker: string } | null = null;
    if (exitWithWeight.length > 0) {
      topExitItem = { ticker: exitWithWeight[0].ticker };
    }

    return { score: s, topBuy: topBuyItem, topExit: topExitItem };
  }, [nsPositions, ibWeights, totalValue]);

  if (isLoading || !portfolio) return null;

  return (
    <Link to="/north-star">
      <Card className="hover:border-primary/40 transition-colors cursor-pointer">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Compass className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-foreground">North Star</span>
                <span className="text-lg font-bold text-primary">{score}%</span>
              </div>
              <Progress value={score} className="h-1.5" />
              <div className="mt-1.5 space-y-0.5">
                {topBuy && (
                  <p className="text-xs text-emerald-500 truncate">
                    Buy {topBuy.ticker} (+${Math.round(topBuy.usd / 1000)}k)
                  </p>
                )}
                {topExit && (
                  <p className="text-xs text-amber-500 truncate">
                    Exit {topExit.ticker}
                  </p>
                )}
                {!topBuy && !topExit && (
                  <p className="text-xs text-muted-foreground">{score}% aligned with target</p>
                )}
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
