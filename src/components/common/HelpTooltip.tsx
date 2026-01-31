import { HelpCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HelpTooltipProps {
  content: string;
  bookReference?: string;
}

export function HelpTooltip({ content, bookReference }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <HelpCircle className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px]">
        <p className="text-sm">{content}</p>
        {bookReference && (
          <p className="text-xs text-muted-foreground mt-1 italic">
            Source: {bookReference}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
