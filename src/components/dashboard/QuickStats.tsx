import { Layers, Wallet, Clock } from "lucide-react";

interface StatItemProps {
  icon: React.ElementType;
  label: string;
  value: string | number;
}

function StatItem({ icon: Icon, label, value }: StatItemProps) {
  return (
    <div className="stat-card flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-lg font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}

export function QuickStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatItem icon={Layers} label="Total Positions" value={24} />
      <StatItem icon={Wallet} label="Cash Balance" value="€12,450" />
      <StatItem icon={Clock} label="Days Since Update" value={0} />
    </div>
  );
}
