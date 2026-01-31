import { cn } from "@/lib/utils";

interface HealthScoreGaugeProps {
  score: number;
}

export function HealthScoreGauge({ score }: HealthScoreGaugeProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-primary";
    if (score >= 60) return "text-yellow-500";
    if (score >= 40) return "text-orange-500";
    return "text-destructive";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    if (score >= 40) return "Fair";
    return "Needs Attention";
  };

  const getBackgroundGradient = (score: number) => {
    if (score >= 80) return "from-primary/20 to-primary/5";
    if (score >= 60) return "from-yellow-500/20 to-yellow-500/5";
    if (score >= 40) return "from-orange-500/20 to-orange-500/5";
    return "from-destructive/20 to-destructive/5";
  };

  // Calculate rotation for the gauge needle (0 = -90deg, 100 = 90deg)
  const rotation = -90 + (score / 100) * 180;

  return (
    <div className={cn(
      "relative flex flex-col items-center justify-center p-8 rounded-xl bg-gradient-to-b",
      getBackgroundGradient(score)
    )}>
      {/* Gauge background */}
      <div className="relative w-48 h-24 overflow-hidden">
        {/* Gauge arc background */}
        <div className="absolute inset-0 flex items-end justify-center">
          <div className="w-48 h-24 rounded-t-full border-8 border-b-0 border-secondary" />
        </div>
        
        {/* Colored arc based on score */}
        <div className="absolute inset-0 flex items-end justify-center">
          <div 
            className="w-48 h-24 rounded-t-full border-8 border-b-0 origin-bottom"
            style={{
              borderColor: score >= 80 ? 'hsl(var(--primary))' : 
                          score >= 60 ? '#eab308' : 
                          score >= 40 ? '#f97316' : 'hsl(var(--destructive))',
              clipPath: `polygon(0 100%, 0 0, ${Math.min(score, 100)}% 0, ${Math.min(score, 100)}% 100%)`,
            }}
          />
        </div>

        {/* Center needle */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-20 origin-bottom"
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        >
          <div className="w-1 h-16 bg-foreground rounded-full" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-foreground" />
        </div>
      </div>

      {/* Score display */}
      <div className="mt-4 text-center">
        <span className={cn("text-5xl font-bold", getScoreColor(score))}>
          {score}
        </span>
        <span className="text-2xl text-muted-foreground">/100</span>
      </div>

      <p className={cn("text-lg font-medium mt-2", getScoreColor(score))}>
        {getScoreLabel(score)}
      </p>
    </div>
  );
}
