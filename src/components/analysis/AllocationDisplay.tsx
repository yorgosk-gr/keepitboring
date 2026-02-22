import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, XCircle, PieChart, Globe, Layers, Package } from "lucide-react";
import type { AllocationCheck, AllocationBreakdownItem } from "@/hooks/usePortfolioAnalysis";

interface AllocationDisplayProps {
  allocation: AllocationCheck;
}

function BreakdownSection({ title, icon, items, labelKey }: {
  title: string;
  icon: React.ReactNode;
  items: AllocationBreakdownItem[];
  labelKey: "region" | "style" | "label";
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className="pt-3 border-t border-border space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
        {icon}
        {title}
      </div>
      {items.map((item, i) => {
        const label = item[labelKey] ?? "Other";
        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{label}</span>
              <span>{item.percent.toFixed(1)}%</span>
            </div>
            <div className="relative h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-primary/70 transition-all"
                style={{ width: `${Math.min(item.percent * 2, 100)}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {item.positions.map((p) => (
                <span key={p} className="text-xs bg-secondary px-1.5 py-0.5 rounded text-muted-foreground">{p}</span>
              ))}
            </div>
            {item.recommendation && (
              <p className="text-xs text-muted-foreground italic">{item.recommendation}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function AllocationDisplay({ allocation }: AllocationDisplayProps) {
  const getStatus = (status: "ok" | "warning" | "critical" | undefined): "ok" | "warning" | "critical" => {
    return status ?? "ok";
  };

  const getStatusIcon = (status: "ok" | "warning" | "critical" | undefined) => {
    const safeStatus = getStatus(status);
    switch (safeStatus) {
      case "ok":
        return <CheckCircle2 className="w-5 h-5 text-primary" />;
      case "warning":
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case "critical":
        return <XCircle className="w-5 h-5 text-destructive" />;
    }
  };

  const getStatusColor = (status: "ok" | "warning" | "critical" | undefined) => {
    const safeStatus = getStatus(status);
    switch (safeStatus) {
      case "ok":
        return "bg-primary";
      case "warning":
        return "bg-yellow-500";
      case "critical":
        return "bg-destructive";
    }
  };

  const equitiesPercent = allocation?.equities_percent ?? 0;
  const bondsPercent = allocation?.bonds_percent ?? 0;
  const commoditiesPercent = allocation?.commodities_percent ?? 0;
  const cashPercent = allocation?.cash_percent ?? 0;

  return (
    <div className="stat-card space-y-5">
      <h3 className="text-lg font-semibold text-foreground">Allocation Check</h3>

      {/* Equities */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(allocation?.equities_status)}
            <span className="font-medium">Equities</span>
          </div>
          <span className="text-sm">
            {equitiesPercent.toFixed(1)}% 
            <span className="text-muted-foreground"> / Target: ≤70%</span>
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <div 
            className={cn("h-full transition-all", getStatusColor(allocation?.equities_status))}
            style={{ width: `${Math.min(equitiesPercent, 100)}%` }}
          />
          <div className="absolute top-0 bottom-0 left-[70%] w-px bg-foreground/40" />
        </div>
      </div>

      {/* Bonds */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(allocation?.bonds_status)}
            <span className="font-medium">Bonds</span>
          </div>
          <span className="text-sm">
            {bondsPercent.toFixed(1)}% 
            <span className="text-muted-foreground"> / Target: ≤20%</span>
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <div 
            className={cn("h-full transition-all", getStatusColor(allocation?.bonds_status))}
            style={{ width: `${Math.min(bondsPercent * 5, 100)}%` }}
          />
          <div className="absolute top-0 bottom-0 left-full w-px bg-foreground/40" />
        </div>
      </div>

      {/* Commodities */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getStatusIcon(allocation?.commodities_status)}
            <span className="font-medium">Commodities / Gold / Crypto</span>
          </div>
          <span className="text-sm">
            {commoditiesPercent.toFixed(1)}% 
            <span className="text-muted-foreground"> / Target: ≤10%</span>
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <div 
            className={cn("h-full transition-all", getStatusColor(allocation?.commodities_status))}
            style={{ width: `${Math.min(commoditiesPercent * 10, 100)}%` }}
          />
        </div>
      </div>

      {/* Commodities Breakdown */}
      <BreakdownSection
        title="Commodities Breakdown"
        icon={<Package className="w-4 h-4" />}
        items={allocation?.commodities_breakdown ?? []}
        labelKey="label"
      />

      {/* Cash */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
            <span className="font-medium">Cash</span>
          </div>
          <span className="text-sm">
            {cashPercent.toFixed(1)}%
          </span>
        </div>
        <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
          <div 
            className="h-full transition-all bg-muted-foreground/50"
            style={{ width: `${Math.min(cashPercent, 100)}%` }}
          />
        </div>
      </div>

      {/* Stock/ETF Split */}
      {allocation.stocks_vs_etf_split && (
        <div className="pt-3 border-t border-border">
          <div className="flex items-center gap-2 text-sm">
            <PieChart className="w-4 h-4 text-muted-foreground" />
            <span className="text-muted-foreground">Within equities:</span>
            <span className="font-medium">{allocation.stocks_vs_etf_split}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 ml-6">
            Target: 15-25% stocks / 75-85% ETFs
          </p>
        </div>
      )}

      {/* Equity by Geography */}
      <BreakdownSection
        title="Equity by Geography"
        icon={<Globe className="w-4 h-4" />}
        items={allocation?.equity_by_geography ?? []}
        labelKey="region"
      />

      {/* Equity by Style / Sector */}
      <BreakdownSection
        title="Equity by Style / Sector"
        icon={<Layers className="w-4 h-4" />}
        items={allocation?.equity_by_style ?? []}
        labelKey="style"
      />

      {/* Issues */}
      {allocation.issues && allocation.issues.length > 0 && (
        <div className="pt-3 border-t border-border">
          <p className="text-sm font-medium text-muted-foreground mb-2">Issues:</p>
          <ul className="space-y-1">
            {allocation.issues.map((issue, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="mt-1">•</span>
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
