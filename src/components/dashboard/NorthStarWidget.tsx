import { Link } from "react-router-dom";
import { Compass, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useNorthStar } from "@/hooks/useNorthStar";
import { usePositions } from "@/hooks/usePositions";
import { useMemo } from "react";

export function NorthStarWidget() {
  const { portfolio, positions: nsPositions, isLoading } = useNorthStar();
  const { positions: currentPositions } = usePositions();

  const score = useMemo(() => {
    if (nsPositions.length === 0) return 0;
    const currentMap: Record<string, number> = {};
    for (const p of currentPositions) currentMap[p.ticker] = p.weight_percent ?? 0;
    let totalGap = 0, totalWeight = 0;
    for (const ns of nsPositions) {
      const current = currentMap[ns.ticker] ?? 0;
      const ideal = ns.target_weight_ideal ?? 0;
      totalGap += Math.abs(current - ideal);
      totalWeight += ideal;
    }
    return totalWeight > 0 ? Math.max(0, Math.round(100 - (totalGap / totalWeight) * 50)) : 0;
  }, [nsPositions, currentPositions]);

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
