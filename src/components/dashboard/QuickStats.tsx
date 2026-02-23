import { Layers, Wallet, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface StatItemProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
  isLoading?: boolean;
}

function StatItem({ icon: Icon, label, value, isLoading }: StatItemProps) {
  return (
    <div className="stat-card flex items-center gap-4">
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
}

interface QuickStatsProps {
  positionsCount: number;
  cashBalance: number;
  daysSinceUpdate: number | null;
  isLoading?: boolean;
}

export function QuickStats({ 
  positionsCount, 
  cashBalance, 
  daysSinceUpdate, 
  isLoading 
}: QuickStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
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
    </div>
  );
}
