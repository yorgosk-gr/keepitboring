import { Newspaper } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TickerMention } from "@/hooks/useTickerMentions";

interface Props {
  mentions: TickerMention[];
}

function sentimentColor(sentiment: string | null): string {
  switch (sentiment) {
    case "bullish": return "text-emerald-500";
    case "bearish": return "text-destructive";
    default: return "text-muted-foreground";
  }
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function NewsletterMentionsBadge({ mentions }: Props) {
  if (mentions.length === 0) return null;

  const recent = mentions.slice(0, 5);
  const bullish = mentions.filter(m => m.sentiment === "bullish").length;
  const bearish = mentions.filter(m => m.sentiment === "bearish").length;

  const badgeColor = bullish > bearish
    ? "text-emerald-500"
    : bearish > bullish
    ? "text-destructive"
    : "text-blue-400";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-0.5 cursor-default ${badgeColor}`}>
            <Newspaper className="w-3.5 h-3.5" />
            <span className="text-xs font-medium">{mentions.length}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs p-3">
          <p className="text-xs font-semibold mb-2">
            {mentions.length} newsletter mention{mentions.length !== 1 ? "s" : ""} (90 days)
          </p>
          <div className="space-y-1.5">
            {recent.map(m => (
              <div key={m.insightId} className="text-xs">
                <div className="flex items-center gap-1.5">
                  <span className={`font-medium ${sentimentColor(m.sentiment)}`}>
                    {m.sentiment ?? "neutral"}
                  </span>
                  {m.newsletterName && (
                    <span className="text-muted-foreground">· {m.newsletterName}</span>
                  )}
                  <span className="text-muted-foreground ml-auto">{timeAgo(m.createdAt)}</span>
                </div>
                <p className="text-muted-foreground line-clamp-2 mt-0.5">
                  {m.content.substring(0, 120)}{m.content.length > 120 ? "…" : ""}
                </p>
              </div>
            ))}
            {mentions.length > 5 && (
              <p className="text-xs text-muted-foreground">+{mentions.length - 5} more</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
