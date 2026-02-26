import { useState, useMemo } from "react";
import { Shield, Target, RefreshCw, AlertTriangle, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useRiskProfile, type RiskProfileType } from "@/hooks/useRiskProfile";
import { RiskProfileOnboarding } from "@/components/onboarding/RiskProfileOnboarding";
import { RiskProfileUpdate } from "@/components/settings/RiskProfileUpdate";
import type { Position } from "@/hooks/useDashboardData";
import type { ETFMetadataItem } from "@/hooks/useAllETFMetadata";

interface RiskProfileCardProps {
  positions: Position[];
  etfMetadata: Record<string, ETFMetadataItem>;
  totalValue: number;
  cashBalance: number;
  isLoading?: boolean;
}

const PROFILE_CONFIG: Record<RiskProfileType, { label: string; color: string; icon: typeof Shield }> = {
  cautious: { label: "Cautious", color: "text-blue-400", icon: Shield },
  balanced: { label: "Balanced", color: "text-primary", icon: Shield },
  growth: { label: "Growth", color: "text-amber-400", icon: TrendingUp },
  aggressive: { label: "Aggressive", color: "text-destructive", icon: Target },
};

export function RiskProfileCard({ positions, etfMetadata, totalValue, cashBalance, isLoading: positionsLoading }: RiskProfileCardProps) {
  const { activeProfile, isLoading: profileLoading, hasProfile } = useRiskProfile();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);

  // Calculate allocation buckets from positions
  const buckets = useMemo(() => {
    const broad = { current: 0, target: 70 };
    const thematic = { current: 0, target: 20 };
    const individual = { current: 0, target: 10 };

    for (const p of positions) {
      const weight = totalValue > 0 ? ((p.market_value ?? 0) / totalValue) * 100 : 0;

      if (p.position_type === "stock") {
        individual.current += weight;
      } else if (p.position_type === "etf") {
        // Use ETF metadata is_broad_market flag
        const meta = etfMetadata[p.ticker];
        const isBroad = meta?.is_broad_market ?? true;
        if (!isBroad) {
          thematic.current += weight;
        } else {
          broad.current += weight;
        }
      } else {
        broad.current += weight;
      }
    }

    // Add cash to broad
    if (totalValue > 0) {
      broad.current += (cashBalance / totalValue) * 100;
    }

    return { broad, thematic, individual };
  }, [positions, totalValue, cashBalance]);

  const isLoading = positionsLoading || profileLoading;

  if (isLoading) {
    return (
      <div className="stat-card space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  // Show onboarding prompt if no profile exists
  if (!hasProfile && !showOnboarding) {
    return (
      <>
        <div className="stat-card space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Risk Profile</h3>
          </div>
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 text-center space-y-3">
            <p className="text-sm text-muted-foreground">
              Set up your risk profile to get personalized allocation targets and behavioral insights.
            </p>
            <Button onClick={() => setShowOnboarding(true)} className="gap-2">
              <Shield className="w-4 h-4" />
              Take Assessment
            </Button>
          </div>
        </div>
        <RiskProfileOnboarding open={showOnboarding} onClose={() => setShowOnboarding(false)} />
      </>
    );
  }

  const profileType = (activeProfile?.profile as RiskProfileType) ?? "balanced";
  const config = PROFILE_CONFIG[profileType];
  const ProfileIcon = config.icon;

  return (
    <>
      <div className="stat-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Risk Profile</h3>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setShowUpdate(true)}>
            <RefreshCw className="w-3.5 h-3.5" />
            Recalibrate
          </Button>
        </div>

        {/* Current Profile Badge */}
        <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-secondary/50">
          <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", 
            profileType === "cautious" ? "bg-blue-400/10" :
            profileType === "balanced" ? "bg-primary/10" :
            profileType === "growth" ? "bg-amber-400/10" : "bg-destructive/10"
          )}>
            <ProfileIcon className={cn("w-5 h-5", config.color)} />
          </div>
          <div>
            <p className={cn("font-semibold", config.color)}>{config.label}</p>
            <p className="text-xs text-muted-foreground">
              {activeProfile?.source === "onboarding" ? "Set during onboarding" : "Last recalibrated"}
              {activeProfile?.applied_at && ` · ${new Date(activeProfile.applied_at).toLocaleDateString()}`}
            </p>
          </div>
        </div>

        {/* Allocation Buckets */}
        <div className="space-y-3">
          <AllocationBucket label="Broad Market" current={buckets.broad.current} target={buckets.broad.target} color="primary" />
          <AllocationBucket label="Industry / Theme" current={buckets.thematic.current} target={buckets.thematic.target} color="amber-500" />
          <AllocationBucket label="Individual Stocks" current={buckets.individual.current} target={buckets.individual.target} color="chart-5" />
        </div>
      </div>

      <RiskProfileOnboarding open={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <RiskProfileUpdate open={showUpdate} onClose={() => setShowUpdate(false)} />
    </>
  );
}

function AllocationBucket({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const diff = current - target;
  const isOver = diff > 5;
  const isUnder = diff < -5;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-foreground">{current.toFixed(0)}%</span>
          <span className="text-xs text-muted-foreground">/ {target}%</span>
          {(isOver || isUnder) && (
            <AlertTriangle className={cn("w-3.5 h-3.5", isOver ? "text-amber-500" : "text-blue-400")} />
          )}
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isOver ? "bg-amber-500" : isUnder ? "bg-blue-400" : "bg-primary"
          )}
          style={{ width: `${Math.min(current, 100)}%` }}
        />
      </div>
    </div>
  );
}
