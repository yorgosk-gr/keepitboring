import { useEffect } from "react";
import { AlertTriangle, Clock, TrendingDown, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useConvictionReview } from "@/hooks/useConvictionReview";
import { Link } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";

export function ConvictionReviewWidget() {
  const { convictionChecks, thesisDrifts, totalPending, generateReviews, dismissReview, isLoading } =
    useConvictionReview();

  useEffect(() => {
    generateReviews();
  }, []);

  if (isLoading || totalPending === 0) return null;

  const allReviews = [...convictionChecks, ...thesisDrifts];

  return (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-amber-500">
            {totalPending} position{totalPending !== 1 ? "s" : ""} need attention
          </span>
        </div>
        <Link to="/portfolio">
          <Button variant="ghost" size="sm" className="text-amber-500 h-7 text-xs gap-1">
            View all <ChevronRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>

      <div className="space-y-2">
        {allReviews.slice(0, 3).map((review) => (
          <div
            key={review.id}
            className="flex items-center justify-between py-2 border-t border-amber-500/20"
          >
            <div className="flex items-center gap-3">
              {review.review_type === "conviction_check" ? (
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <TrendingDown className="w-4 h-4 text-destructive shrink-0" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold">{review.ticker}</span>
                  <Badge
                    variant="outline"
                    className={
                      review.review_type === "conviction_check"
                        ? "text-amber-500 border-amber-500/30 text-xs"
                        : "text-destructive border-destructive/30 text-xs"
                    }
                  >
                    {review.review_type === "conviction_check" ? "Review due" : "Legacy hold"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {review.review_type === "conviction_check"
                    ? `Confidence ${review.original_confidence}/10 — last reviewed ${formatDistanceToNow(new Date(review.triggered_at))} ago`
                    : `Low conviction legacy position — consider exiting`}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => dismissReview({ id: review.id })}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
