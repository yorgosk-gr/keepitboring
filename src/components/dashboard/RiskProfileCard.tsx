import { useState, useMemo } from "react";
import { Shield, Target, RefreshCw, TrendingUp } from "lucide-react";
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

const PROFILE_TARGETS: Record<RiskProfileType, { broad: number; theme: number; stocks: number }> = {
  cautious:   { broad: 65, theme: 10, stocks: 5 },
  balanced:   { broad: 55, theme: 15, stocks: 15 },
  growth:     { broad: 50, theme: 20, stocks: 20 },
  aggressive: { broad: 55, theme: 25, stocks: 15 },
};

const CASH_GUIDANCE: Record<RiskProfileType, { min: number; ideal: number; max: number }> = {
  cautious:   { min: 0.15, ideal: 0.20, max: 0.30 },
  balanced:   { min: 0.10, ideal: 0.15, max: 0.20 },
  growth:     { min: 0.05, ideal: 0.10, max: 0.15 },
  aggressive: { min: 0.03, ideal: 0.05, max: 0.10 },
};

export function RiskProfileCard({ positions, etfMetadata, totalValue, cashBalance, isLoading: positionsLoading }: RiskProfileCardProps) {
  const { activeProfile, isLoading: profileLoading, hasProfile } = useRiskProfile();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);

  // totalValue already includes cashBalance (positions + cash), so use it directly
  const totalWithCash = totalValue;

  const buckets = useMemo(() => {
    let broad = 0, theme = 0, stocks = 0;

    for (const p of positions) {
      const weight = totalWithCash > 0 ? ((p.market_value ?? 0) / totalWithCash) * 100 : 0;
      if (p.position_type === "stock") {
        stocks += weight;
      } else if (p.position_type === "etf") {
        const meta = etfMetadata[p.ticker];
        const isBroad = meta?.is_broad_market ?? true;
        if (!isBroad) {
          theme += weight;
        } else {
          broad += weight;
        }
      } else {
        broad += weight;
      }
    }

    const cash = totalWithCash > 0 ? (cashBalance / totalWithCash) * 100 : 0;
    return { broad, theme, stocks, cash };
  }, [positions, totalWithCash, cashBalance, etfMetadata]);

  const isLoading = positionsLoading || profileLoading;

  if (isLoading) {
    return (
      <div className="stat-card space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

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
              Set up your risk profile to get personalized allocation targets.
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
  const targets = PROFILE_TARGETS[profileType];
  const ProfileIcon = config.icon;

  const categories = [
    { key: "broad", label: "Broad Market", current: buckets.broad, target: targets.broad },
    { key: "theme", label: "Theme / Country", current: buckets.theme, target: targets.theme },
    { key: "stocks", label: "Individual Stocks", current: buckets.stocks, target: targets.stocks },
  ];

  const cashGuidance = CASH_GUIDANCE[profileType];
  const cashIdealPct = cashGuidance.ideal * 100;
  categories.push({ key: "cash", label: "Cash", current: buckets.cash, target: cashIdealPct });
  const cashPct = buckets.cash / 100;
  const cashAmount = cashBalance;
  const cashLabel = `$${(cashAmount / 1000).toFixed(0)}K`;
  const cashPctLabel = `${buckets.cash.toFixed(1)}%`;

  let cashStatus: "low" | "healthy" | "elevated";
  let cashMessage: string;

  if (cashPct < cashGuidance.min) {
    cashStatus = "low";
    cashMessage = `Cash reserve is low (${cashLabel}). A ${config.label} portfolio benefits from keeping at least ${(cashGuidance.min * 100).toFixed(0)}% as dry powder for opportunities.`;
  } else if (cashPct > cashGuidance.max) {
    cashStatus = "elevated";
    cashMessage = `Cash reserve is elevated (${cashLabel}, ${cashPctLabel}). Consider deploying excess into your target allocations — idle cash is a drag on long-term returns.`;
  } else if (cashPct > cashGuidance.max - 0.02) {
    // Near the top of range
    cashStatus = "healthy";
    cashMessage = `Cash is at the high end of your range (${cashLabel}, ${cashPctLabel}). Consider gradual deployment into broad market positions.`;
  } else {
    cashStatus = "healthy";
    cashMessage = `Cash reserve is healthy (${cashLabel}, ${cashPctLabel}). Well positioned to act on opportunities.`;
  }
  return (
    <>
      <div className="stat-card">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-semibold text-foreground">Risk Profile</h3>
            <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full",
              profileType === "cautious" ? "bg-blue-400/15 text-blue-400" :
              profileType === "balanced" ? "bg-primary/15 text-primary" :
              profileType === "growth" ? "bg-amber-400/15 text-amber-400" : "bg-destructive/15 text-destructive"
            )}>
              {config.label}
            </span>
          </div>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setShowUpdate(true)}>
            <RefreshCw className="w-3.5 h-3.5" />
            Recalibrate
          </Button>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[1fr_80px_80px_40px] gap-2 px-1 mb-2 text-sm font-medium text-muted-foreground uppercase tracking-wider">
          <span>Category</span>
          <span className="text-right">Current</span>
          <span className="text-right">Ideal</span>
          <span />
        </div>

        {/* Allocation rows */}
        <div className="space-y-1">
          {categories.map((cat) => {
            const diff = cat.current - cat.target;
            const isOff = Math.abs(diff) > 5;
            const isOver = diff > 5;

            return (
              <div key={cat.key} className="grid grid-cols-[1fr_80px_80px_40px] gap-2 items-center px-1 py-2 rounded-md hover:bg-secondary/30 transition-colors">
                <span className="text-sm text-foreground">{cat.label}</span>
                <span className="text-right text-sm font-mono font-semibold text-foreground">
                  {cat.current.toFixed(0)}%
                </span>
                <span className="text-right text-sm font-mono text-muted-foreground">
                  {cat.target}%
                </span>
                <div className="flex justify-end">
                  {isOff ? (
                    <span className={cn(
                      "text-sm font-mono font-medium px-1.5 py-0.5 rounded",
                      isOver ? "bg-destructive/15 text-destructive" : "bg-blue-400/15 text-blue-400"
                    )}>
                      {diff > 0 ? "+" : ""}{diff.toFixed(0)}
                    </span>
                  ) : (
                    <span className="text-sm text-primary">✓</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cash guidance */}
        <div className={cn(
          "mt-4 px-3 py-2.5 rounded-lg text-sm border",
          cashStatus === "low" ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
          cashStatus === "elevated" ? "bg-blue-400/10 border-blue-400/20 text-blue-400" :
          "bg-primary/5 border-primary/20 text-primary"
        )}>
          <span>{cashStatus === "healthy" ? "✓" : "💡"} {cashMessage}</span>
        </div>
      </div>

      <RiskProfileOnboarding open={showOnboarding} onClose={() => setShowOnboarding(false)} />
      <RiskProfileUpdate open={showUpdate} onClose={() => setShowUpdate(false)} />
    </>
  );
}
