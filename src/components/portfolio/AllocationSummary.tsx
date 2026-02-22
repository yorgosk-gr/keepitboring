import { Progress } from "@/components/ui/progress";

interface AllocationSummaryProps {
  equityValue: number;
  bondsValue: number;
  commoditiesValue: number;
  cashValue: number;
  totalValue: number;
  isLoading?: boolean;
}

function formatUSD(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function AllocationSummary({
  equityValue,
  bondsValue,
  commoditiesValue,
  cashValue,
  totalValue,
  isLoading,
}: AllocationSummaryProps) {
  if (isLoading) {
    return (
      <div className="stat-card">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-secondary rounded w-1/4" />
          <div className="h-2 bg-secondary rounded" />
          <div className="h-2 bg-secondary rounded" />
        </div>
      </div>
    );
  }

  const pct = (v: number) => (totalValue > 0 ? (v / totalValue) * 100 : 0);

  const rows = [
    { label: "Equity", value: equityValue, percent: pct(equityValue) },
    { label: "Bonds", value: bondsValue, percent: pct(bondsValue) },
    { label: "Commodities", value: commoditiesValue, percent: pct(commoditiesValue) },
    { label: "Cash", value: cashValue, percent: pct(cashValue) },
  ];

  return (
    <div className="stat-card">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">Allocation</h3>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-3">
            <span className="text-sm font-medium w-24">{row.label}</span>
            <Progress value={row.percent} className="flex-1 h-2" />
            <span className="text-sm font-mono w-12 text-right">{row.percent.toFixed(1)}%</span>
            <span className="text-sm text-muted-foreground font-mono w-24 text-right">
              {formatUSD(row.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
