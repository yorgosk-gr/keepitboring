import { Info } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Badge } from "@/components/ui/badge";

interface ETFMetadata {
  ticker: string;
  full_name: string | null;
  issuer: string | null;
  tracks: string | null;
  category: string | null;
  geography: string | null;
  is_broad_market: boolean | null;
  expense_ratio: number | null;
}

interface ETFInfoTooltipProps {
  metadata: ETFMetadata | null;
}

export function ETFInfoTooltip({ metadata }: ETFInfoTooltipProps) {
  if (!metadata) {
    return null;
  }

  return (
    <HoverCard openDelay={200}>
      <HoverCardTrigger asChild>
        <button className="ml-1 text-muted-foreground hover:text-foreground transition-colors">
          <Info className="w-3.5 h-3.5" />
        </button>
      </HoverCardTrigger>
      <HoverCardContent 
        side="right" 
        className="w-72 bg-card border-border"
        align="start"
      >
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {metadata.full_name || metadata.ticker}
            </p>
            {metadata.issuer && (
              <p className="text-xs text-muted-foreground">
                by {metadata.issuer}
              </p>
            )}
          </div>

          {metadata.tracks && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Tracks</p>
              <p className="text-sm text-foreground">{metadata.tracks}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {metadata.category && (
              <Badge variant="secondary" className="capitalize">
                {metadata.category}
              </Badge>
            )}
            {metadata.geography && (
              <Badge variant="outline" className="capitalize">
                {metadata.geography.replace("_", " ")}
              </Badge>
            )}
          </div>

          <div className="flex items-center justify-between text-xs">
            <div>
              <span className="text-muted-foreground">Broad Market:</span>{" "}
              <span className={metadata.is_broad_market ? "text-primary" : "text-muted-foreground"}>
                {metadata.is_broad_market ? "Yes" : "No"}
              </span>
            </div>
            {metadata.expense_ratio != null && (
              <div>
                <span className="text-muted-foreground">TER:</span>{" "}
                <span className="text-foreground">{metadata.expense_ratio}%</span>
              </div>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
