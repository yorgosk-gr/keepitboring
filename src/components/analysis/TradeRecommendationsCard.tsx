import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDownCircle, ArrowUpCircle, MinusCircle, TrendingUp, TrendingDown, AlertTriangle, CheckCircle } from "lucide-react";
import type { TradeRecommendation, RebalancingSummary } from "@/hooks/usePortfolioAnalysis";

interface TradeRecommendationsCardProps {
  recommendations: TradeRecommendation[];
  summary: RebalancingSummary;
}

export function TradeRecommendationsCard({
  recommendations,
  summary,
}: TradeRecommendationsCardProps) {
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"urgency" | "value">("urgency");

  const urgencyOrder = { high: 0, medium: 1, low: 2 };

  const filteredAndSorted = useMemo(() => {
    let filtered = recommendations;
    
    if (actionFilter !== "all") {
      filtered = recommendations.filter((r) => r.action === actionFilter);
    }

    return [...filtered].sort((a, b) => {
      if (sortBy === "urgency") {
        return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
      }
      return Math.abs(b.estimated_value) - Math.abs(a.estimated_value);
    });
  }, [recommendations, actionFilter, sortBy]);

  const getActionIcon = (action: "SELL" | "HOLD" | "BUY") => {
    switch (action) {
      case "SELL":
        return <ArrowDownCircle className="w-4 h-4" />;
      case "BUY":
        return <ArrowUpCircle className="w-4 h-4" />;
      case "HOLD":
        return <MinusCircle className="w-4 h-4" />;
    }
  };

  const getActionStyle = (action: "SELL" | "HOLD" | "BUY") => {
    switch (action) {
      case "SELL":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "BUY":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "HOLD":
        return "bg-muted text-muted-foreground border-muted";
    }
  };

  const getUrgencyStyle = (urgency: "low" | "medium" | "high") => {
    switch (urgency) {
      case "high":
        return "bg-destructive/10 text-destructive border-destructive/20";
      case "medium":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20";
      case "low":
        return "bg-muted text-muted-foreground border-muted";
    }
  };

  const formatShares = (current: number, recommended: number, action: string) => {
    if (action === "HOLD") {
      return `${current.toLocaleString()}`;
    }
    return `${current.toLocaleString()} → ${recommended.toLocaleString()}`;
  };

  const formatWeight = (current: number, target: number, action: string) => {
    if (action === "HOLD") {
      return `${current.toFixed(1)}%`;
    }
    return `${current.toFixed(1)}% → ${target.toFixed(1)}%`;
  };

  const formatValue = (value: number) => {
    return `$${Math.abs(value).toLocaleString()}`;
  };

  if (!recommendations || recommendations.length === 0) {
    return null;
  }

  return (
    <div className="stat-card space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h3 className="text-lg font-semibold text-foreground">
          Monthly Trade Recommendations
        </h3>
        <div className="flex items-center gap-3">
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="SELL">Sells Only</SelectItem>
              <SelectItem value="BUY">Buys Only</SelectItem>
              <SelectItem value="HOLD">Holds Only</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as "urgency" | "value")}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="urgency">By Urgency</SelectItem>
              <SelectItem value="value">By Value</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Trade Recommendations Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[80px]">Ticker</TableHead>
              <TableHead className="w-[90px]">Action</TableHead>
              <TableHead className="w-[120px] text-right">Shares</TableHead>
              <TableHead className="w-[100px] text-right">Est. Value</TableHead>
              <TableHead className="w-[120px] text-right">Weight</TableHead>
              <TableHead>Reasoning</TableHead>
              <TableHead className="w-[90px]">Urgency</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSorted.map((rec) => (
              <TableRow key={rec.ticker} className="hover:bg-muted/30">
                <TableCell className="font-mono font-medium">{rec.ticker}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={cn("gap-1", getActionStyle(rec.action))}>
                    {getActionIcon(rec.action)}
                    {rec.action}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatShares(rec.current_shares, rec.recommended_shares, rec.action)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatValue(rec.estimated_value)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {formatWeight(rec.current_weight, rec.target_weight, rec.action)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[300px]">
                  <div className="flex items-start gap-2">
                    {rec.thesis_aligned === false && (
                      <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    )}
                    {rec.thesis_aligned === true && (
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                    )}
                    <span className="line-clamp-2">{rec.reasoning}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={getUrgencyStyle(rec.urgency)}>
                    {rec.urgency}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Rebalancing Summary */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-4">
          <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
            <div className="flex items-center gap-2 text-destructive mb-1">
              <TrendingDown className="w-4 h-4" />
              <span className="text-sm font-medium">Total Sells</span>
            </div>
            <p className="text-lg font-bold text-foreground">{summary.total_sells}</p>
          </div>
          <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-center gap-2 text-emerald-600 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm font-medium">Total Buys</span>
            </div>
            <p className="text-lg font-bold text-foreground">{summary.total_buys}</p>
          </div>
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 text-primary mb-1">
              <span className="text-sm font-medium">Net Cash Impact</span>
            </div>
            <p className="text-lg font-bold text-foreground">{summary.net_cash_impact}</p>
          </div>
          <div className="p-4 rounded-lg bg-secondary border border-border col-span-full md:col-span-1">
            <span className="text-sm font-medium text-muted-foreground">Primary Goal</span>
            <p className="text-sm text-foreground mt-1">{summary.primary_goal}</p>
          </div>
        </div>
      )}
    </div>
  );
}
