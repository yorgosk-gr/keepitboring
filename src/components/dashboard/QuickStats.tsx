import { Layers, Wallet, Clock, AlertTriangle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";

interface StatItemProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  isLoading?: boolean;
  linkTo?: string;
}

function StatItem({ icon: Icon, label, value, isLoading, linkTo }: StatItemProps) {
  const content = (
    <div className={`stat-card flex items-center gap-4 ${linkTo ? "cursor-pointer hover:border-primary/50" : ""}`}>
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        {isLoading ? (
          <Skeleton className="h-6 w-16 mt-1" />
        ) : (
          <p className="text-lg font-semibold text-foreground">{value}</p>
        )}
      </div>
    </div>
  );

  if (linkTo) {
    return <Link to={linkTo}>{content}</Link>;
  }

  return content;
}

interface QuickStatsProps {
  positionsCount: number;
  cashBalance: number;
  daysSinceUpdate: number | null;
  unresolvedAlertsCount: number;
  isLoading?: boolean;
}

export function QuickStats({ 
  positionsCount, 
  cashBalance, 
  daysSinceUpdate, 
  unresolvedAlertsCount,
  isLoading 
}: QuickStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatItem 
        icon={Layers} 
        label="Total Positions" 
        value={positionsCount} 
        isLoading={isLoading}
      />
      <StatItem 
        icon={Wallet} 
        label="Cash Balance" 
        value={`$${cashBalance.toLocaleString("en-US", { minimumFractionDigits: 0 })}`}
        isLoading={isLoading}
      />
      <StatItem 
        icon={Clock} 
        label="Days Since Update" 
        value={daysSinceUpdate ?? "—"}
        isLoading={isLoading}
      />
      <StatItem 
        icon={AlertTriangle} 
        label="Unresolved Alerts" 
        value={unresolvedAlertsCount}
        isLoading={isLoading}
        linkTo="/analysis"
      />
    </div>
  );
}
