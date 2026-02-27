import { Link } from "react-router-dom";
import { Compass, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useNorthStar } from "@/hooks/useNorthStar";
import { useIBCurrentWeights, deriveStatus } from "@/hooks/useIBCurrentWeights";
import { useMemo } from "react";

export function NorthStarWidget() {
  const { portfolio, positions: nsPositions, isLoading } = useNorthStar();
  const { weights: ibWeights } = useIBCurrentWeights();

  const score = useMemo(() => {
    if (nsPositions.length === 0) return 0;

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
    return total > 0 ? Math.round(((alignedNonExit + alignedExit) / total) * 100) : 0;
  }, [nsPositions, ibWeights]);

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
              <p className="text-xs text-muted-foreground mt-1">{score}% aligned with target portfolio</p>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
