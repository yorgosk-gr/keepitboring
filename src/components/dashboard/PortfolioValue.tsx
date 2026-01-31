import { TrendingDown } from "lucide-react";

export function PortfolioValue() {
  const portfolioValue = 509806;
  const dailyChange = -2151;
  const dailyChangePercent = -0.42;

  return (
    <div className="stat-card">
      <p className="text-sm text-muted-foreground mb-1">Total Portfolio Value</p>
      <p className="text-4xl font-bold text-foreground tracking-tight">
        €{portfolioValue.toLocaleString("de-DE")}
      </p>
      <div className="flex items-center gap-2 mt-2">
        <TrendingDown className="w-4 h-4 text-destructive" />
        <span className="text-destructive font-medium">
          €{Math.abs(dailyChange).toLocaleString("de-DE")} ({dailyChangePercent}%)
        </span>
        <span className="text-muted-foreground text-sm">Today</span>
      </div>
    </div>
  );
}
