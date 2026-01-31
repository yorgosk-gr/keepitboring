import { useState } from "react";
import { Star, TrendingUp, TrendingDown, Minus, AlertTriangle, Lightbulb } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useInsights, type Insight } from "@/hooks/useNewsletters";
import { usePositions } from "@/hooks/usePositions";

interface InsightsModalProps {
  open: boolean;
  onClose: () => void;
  newsletterId: string | null;
  newsletterName: string;
}

const getSentimentIcon = (sentiment: string | null) => {
  switch (sentiment) {
    case "bullish":
      return <TrendingUp className="w-4 h-4 text-emerald-500" />;
    case "bearish":
      return <TrendingDown className="w-4 h-4 text-red-500" />;
    default:
      return <Minus className="w-4 h-4 text-muted-foreground" />;
  }
};

const getSentimentBadge = (sentiment: string | null) => {
  switch (sentiment) {
    case "bullish":
      return (
        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
          Bullish
        </Badge>
      );
    case "bearish":
      return (
        <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
          Bearish
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="bg-muted text-muted-foreground">
          Neutral
        </Badge>
      );
  }
};

function InsightCard({
  insight,
  portfolioTickers,
  onToggleStar,
}: {
  insight: Insight;
  portfolioTickers: string[];
  onToggleStar: (params: { id: string; isStarred: boolean }) => void;
}) {
  const tickersInPortfolio = (insight.tickers_mentioned || []).filter((t) =>
    portfolioTickers.includes(t.toUpperCase())
  );

  return (
    <div
      className={cn(
        "p-4 rounded-lg border border-border bg-secondary/30",
        tickersInPortfolio.length > 0 && "border-primary/30 bg-primary/5"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            {getSentimentIcon(insight.sentiment)}
            {(insight.tickers_mentioned || []).map((ticker) => (
              <Badge
                key={ticker}
                variant="outline"
                className={cn(
                  "font-mono",
                  portfolioTickers.includes(ticker.toUpperCase())
                    ? "bg-primary/20 text-primary border-primary/30"
                    : ""
                )}
              >
                {ticker}
                {portfolioTickers.includes(ticker.toUpperCase()) && " ✓"}
              </Badge>
            ))}
            {getSentimentBadge(insight.sentiment)}
          </div>
          <p className="text-sm text-foreground">{insight.content}</p>
          {(insight.confidence_words || []).length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Confidence:</span>
              {insight.confidence_words!.map((word, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  "{word}"
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "shrink-0",
            insight.is_starred ? "text-amber-500" : "text-muted-foreground"
          )}
          onClick={() => onToggleStar({ id: insight.id, isStarred: !insight.is_starred })}
        >
          <Star className={cn("w-4 h-4", insight.is_starred && "fill-current")} />
        </Button>
      </div>
    </div>
  );
}

export function InsightsModal({
  open,
  onClose,
  newsletterId,
  newsletterName,
}: InsightsModalProps) {
  const { insights, isLoading, toggleStar } = useInsights(newsletterId);
  const { positions } = usePositions();
  const portfolioTickers = positions.map((p) => p.ticker.toUpperCase());

  // Group insights by type
  const stockMentions = insights.filter((i) => i.insight_type === "stock_mention");
  const macroViews = insights.filter((i) => i.insight_type?.startsWith("macro_"));
  const sectorViews = insights.filter((i) => i.insight_type?.startsWith("sector_"));
  const bubbleSignals = insights.filter((i) => i.insight_type === "bubble_signal");
  const keyTakeaways = insights.filter((i) => i.insight_type === "key_takeaway");

  const renderInsightList = (items: Insight[], emptyMessage: string) => {
    if (items.length === 0) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          {emptyMessage}
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {items.map((insight) => (
          <InsightCard
            key={insight.id}
            insight={insight}
            portfolioTickers={portfolioTickers}
            onToggleStar={toggleStar}
          />
        ))}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-card border-border max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Insights: {newsletterName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="stocks" className="w-full">
            <TabsList className="w-full grid grid-cols-5">
              <TabsTrigger value="stocks" className="gap-1">
                Stocks
                {stockMentions.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                    {stockMentions.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="macro">Macro</TabsTrigger>
              <TabsTrigger value="sectors">Sectors</TabsTrigger>
              <TabsTrigger value="bubbles" className="gap-1">
                ⚠️ Bubbles
                {bubbleSignals.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-5 px-1.5 bg-red-500/20 text-red-500">
                    {bubbleSignals.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="takeaways">Takeaways</TabsTrigger>
            </TabsList>

            <ScrollArea className="h-[50vh] mt-4">
              <TabsContent value="stocks" className="mt-0">
                {renderInsightList(stockMentions, "No stock mentions found")}
              </TabsContent>
              <TabsContent value="macro" className="mt-0">
                {renderInsightList(macroViews, "No macro views found")}
              </TabsContent>
              <TabsContent value="sectors" className="mt-0">
                {renderInsightList(sectorViews, "No sector views found")}
              </TabsContent>
              <TabsContent value="bubbles" className="mt-0">
                {bubbleSignals.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                      <Lightbulb className="w-6 h-6 text-emerald-500" />
                    </div>
                    <p className="text-muted-foreground">
                      No bubble signals detected - language appears grounded
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span className="text-sm font-medium text-red-500">
                          Warning: Bubble language detected
                        </span>
                      </div>
                    </div>
                    {bubbleSignals.map((insight) => (
                      <InsightCard
                        key={insight.id}
                        insight={insight}
                        portfolioTickers={portfolioTickers}
                        onToggleStar={toggleStar}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="takeaways" className="mt-0">
                {renderInsightList(keyTakeaways, "No key takeaways found")}
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
