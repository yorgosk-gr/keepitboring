import { cn } from "@/lib/utils";
import { AlertTriangle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MarketSignals } from "@/hooks/usePortfolioAnalysis";

interface MarketSignalsCardProps {
  signals: MarketSignals;
}

export function MarketSignalsCard({ signals }: MarketSignalsCardProps) {
  const getConsensusIcon = () => {
    switch (signals.consensus_level) {
      case "bullish_consensus":
        return <TrendingUp className="w-5 h-5 text-primary" />;
      case "bearish_consensus":
        return <TrendingDown className="w-5 h-5 text-destructive" />;
      default:
        return <Activity className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getConsensusLabel = () => {
    switch (signals.consensus_level) {
      case "bullish_consensus":
        return "Bullish Consensus";
      case "bearish_consensus":
        return "Bearish Consensus";
      default:
        return "Mixed Sentiment";
    }
  };

  const hasBubbleWarnings = signals.bubble_warnings.length > 0;

  return (
    <div className="stat-card space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Market Signals</h3>

      {/* Bubble Warnings */}
      {hasBubbleWarnings && (
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <span className="font-semibold text-destructive">Bubble Warnings Detected</span>
          </div>
          <ul className="space-y-2">
            {signals.bubble_warnings.map((warning, i) => (
              <li key={i} className="text-sm text-destructive flex items-start gap-2">
                <span className="mt-0.5">•</span>
                {warning}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* No warnings state */}
      {!hasBubbleWarnings && (
        <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
          <p className="text-sm text-primary">No bubble language or euphoria signals detected</p>
        </div>
      )}

      {/* Consensus Level */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-secondary/50">
        <div className="flex items-center gap-3">
          {getConsensusIcon()}
          <div>
            <p className="font-medium">{getConsensusLabel()}</p>
            <p className="text-sm text-muted-foreground">Newsletter sentiment</p>
          </div>
        </div>
        <Badge variant={
          signals.consensus_level === "bullish_consensus" ? "default" :
          signals.consensus_level === "bearish_consensus" ? "destructive" : "secondary"
        }>
          {signals.consensus_level.replace("_", " ")}
        </Badge>
      </div>

      {/* Portfolio Exposure */}
      {signals.portfolio_exposure && (
        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <p className="text-sm font-medium text-amber-600 mb-1">Portfolio Exposure</p>
          <p className="text-sm text-foreground">{signals.portfolio_exposure}</p>
        </div>
      )}

      {/* Overall Sentiment */}
      <div className="pt-4 border-t border-border">
        <p className="text-sm text-muted-foreground mb-1">Overall Sentiment</p>
        <p className="text-foreground">{signals.overall_sentiment}</p>
      </div>
    </div>
  );
}
