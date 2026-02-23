import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, XCircle, PieChart, Globe, Layers, Package } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AllocationCheck, AllocationBreakdownItem } from "@/hooks/usePortfolioAnalysis";

interface AllocationDisplayProps {
  allocation: AllocationCheck;
}

function StatusIcon({ status }: { status: "ok" | "warning" | "critical" | undefined }) {
  switch (status ?? "ok") {
    case "ok":
      return <CheckCircle2 className="w-4 h-4 text-primary" />;
    case "warning":
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case "critical":
      return <XCircle className="w-4 h-4 text-destructive" />;
  }
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

interface AllocationRow {
  label: string;
  current: number;
  idealRange: string;
  status: "ok" | "warning" | "critical" | undefined;
}

export function AllocationDisplay({ allocation }: AllocationDisplayProps) {
  const rows: AllocationRow[] = [
    {
      label: "Equities",
      current: allocation?.equities_percent ?? 0,
      idealRange: "40–70%",
      status: allocation?.equities_status,
    },
    {
      label: "Bonds",
      current: allocation?.bonds_percent ?? 0,
      idealRange: "10–30%",
      status: allocation?.bonds_status,
    },
    {
      label: "Commodities",
      current: allocation?.commodities_percent ?? 0,
      idealRange: "5–10%",
      status: allocation?.commodities_status,
    },
    {
      label: "Cash",
      current: allocation?.cash_percent ?? 0,
      idealRange: "≤10%",
      status: (allocation?.cash_percent ?? 0) > 10 ? "critical" : "ok",
    },
  ];

  return (
    <div className="stat-card space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Allocation Check</h3>

      {/* Main allocation table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary/50 hover:bg-secondary/50">
              <TableHead className="w-8"></TableHead>
              <TableHead>Asset Class</TableHead>
              <TableHead className="text-right">Current</TableHead>
              <TableHead className="text-right">Ideal Range</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label} className="border-border">
                <TableCell className="pr-0">
                  <StatusIcon status={row.status} />
                </TableCell>
                <TableCell className="font-medium text-foreground">{row.label}</TableCell>
                <TableCell className={cn(
                  "text-right font-mono font-semibold",
                  row.status === "critical" ? "text-destructive" :
                  row.status === "warning" ? "text-yellow-500" :
                  "text-foreground"
                )}>
                  {row.current.toFixed(1)}%
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {row.idealRange}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Stock/ETF Split */}
      {allocation?.stocks_vs_etf_split && (
        <div className="flex items-center gap-2 text-sm px-1">
          <PieChart className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground">Within equities:</span>
          <span className="font-medium text-foreground">{allocation.stocks_vs_etf_split}</span>
          <span className="text-xs text-muted-foreground">(target: 15-25% stocks / 75-85% ETFs)</span>
        </div>
      )}

      {/* Commodities Breakdown */}
      <BreakdownSection
        title="Commodities Breakdown"
        icon={<Package className="w-4 h-4" />}
        items={allocation?.commodities_breakdown ?? []}
        labelKey="label"
      />

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

      {/* Issues - condensed */}
      {allocation?.issues && allocation.issues.length > 0 && (
        <div className="pt-3 border-t border-border">
          <p className="text-sm font-medium text-muted-foreground mb-2">Key Issues:</p>
          <ul className="space-y-1">
            {allocation.issues.map((issue, i) => (
              <li key={i} className="text-sm text-foreground flex items-start gap-2">
                <span className="mt-1 text-muted-foreground">•</span>
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
