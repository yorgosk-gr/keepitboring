import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Star, StarHalf } from "lucide-react";

interface SourceQualityBadgeProps {
  confidenceScore: number | null | undefined;
  insightsCount?: number;
}

export function SourceQualityBadge({ confidenceScore, insightsCount }: SourceQualityBadgeProps) {
  if (!confidenceScore) return null;

  const score = confidenceScore;
  const label = score >= 0.8 ? "High quality" : score >= 0.5 ? "Medium quality" : "Low quality";
  const color = score >= 0.8 ? "text-emerald-500" : score >= 0.5 ? "text-amber-500" : "text-muted-foreground";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-center gap-1 text-xs ${color} cursor-help`}>
          {score >= 0.8 ? (
            <Star className="w-3 h-3 fill-current" />
          ) : (
            <StarHalf className="w-3 h-3 fill-current" />
          )}
          <span>{Math.round(score * 100)}%</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">
          Source confidence score based on data specificity and named sources cited.
          {insightsCount ? ` ${insightsCount} insights extracted.` : ""}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
