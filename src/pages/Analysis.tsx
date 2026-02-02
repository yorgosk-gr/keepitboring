import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DecisionLogView } from "@/components/decisions/DecisionLogView";
import { AnalysisResultsView } from "@/components/analysis/AnalysisResultsView";
import { BarChart3, BookOpen, Play, Loader2, History, AlertCircle } from "lucide-react";
import { usePortfolioAnalysis } from "@/hooks/usePortfolioAnalysis";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export default function Analysis() {
  const {
    currentAnalysis,
    setCurrentAnalysis,
    history,
    isLoadingHistory,
    runAnalysis,
    isAnalyzing,
    markActionCompleted,
    dismissAction,
    hasData,
  } = usePortfolioAnalysis();

  const [showHistory, setShowHistory] = useState(false);

  const handleRunAnalysis = () => {
    runAnalysis();
  };

  const loadFromHistory = (historyItem: typeof history[0]) => {
    // Handle old schema (stocks_percent, etfs_percent) vs new schema (equities_percent, bonds_percent, etc.)
    const rawAllocation = historyItem.allocation_check as any;
    let normalizedAllocation;
    
    if (rawAllocation) {
      // Check if this is old schema (has stocks_percent) or new schema (has equities_percent)
      if (rawAllocation.equities_percent !== undefined) {
        // New schema - use as-is
        normalizedAllocation = rawAllocation;
      } else {
        // Old schema - convert to new format
        const stocksPercent = rawAllocation.stocks_percent ?? 0;
        const etfsPercent = rawAllocation.etfs_percent ?? 0;
        normalizedAllocation = {
          equities_percent: stocksPercent + etfsPercent,
          equities_status: rawAllocation.stocks_status ?? rawAllocation.etfs_status ?? "ok",
          bonds_percent: 0,
          bonds_status: "ok" as const,
          commodities_percent: 0,
          commodities_status: "ok" as const,
          cash_percent: 100 - stocksPercent - etfsPercent,
          stocks_vs_etf_split: `${stocksPercent.toFixed(0)}% stocks / ${etfsPercent.toFixed(0)}% ETFs`,
          issues: rawAllocation.issues ?? [],
        };
      }
    } else {
      // No allocation data at all
      normalizedAllocation = {
        equities_percent: 0,
        equities_status: "ok" as const,
        bonds_percent: 0,
        bonds_status: "ok" as const,
        commodities_percent: 0,
        commodities_status: "ok" as const,
        cash_percent: 100,
        stocks_vs_etf_split: "",
        issues: [],
      };
    }

    setCurrentAnalysis({
      id: historyItem.id,
      created_at: historyItem.created_at,
      allocation_check: normalizedAllocation,
      position_alerts: historyItem.position_alerts ?? [],
      thesis_checks: historyItem.thesis_checks ?? [],
      market_signals: historyItem.market_signals ?? {
        bubble_warnings: [],
        consensus_level: "mixed",
        overall_sentiment: "N/A",
      },
      recommended_actions: historyItem.recommended_actions ?? [],
      trade_recommendations: (historyItem as any).trade_recommendations ?? [],
      rebalancing_summary: (historyItem as any).rebalancing_summary ?? {
        total_sells: "€0",
        total_buys: "€0",
        net_cash_impact: "€0",
        primary_goal: "N/A",
      },
      portfolio_health_score: historyItem.health_score ?? 0,
      key_risks: historyItem.key_risks ?? [],
      summary: historyItem.summary ?? "",
    });
    setShowHistory(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analysis</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Portfolio analytics, risk metrics, and decision tracking
        </p>
      </div>

      <Tabs defaultValue="analytics" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            AI Analysis
          </TabsTrigger>
          <TabsTrigger value="decisions" className="gap-2">
            <BookOpen className="w-4 h-4" />
            Decision Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="mt-6">
          {/* Run Analysis Section */}
          {!currentAnalysis && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <BarChart3 className="w-10 h-10 text-primary" />
              </div>
              
              <h2 className="text-2xl font-bold text-foreground mb-2">
                AI Portfolio Analysis
              </h2>
              <p className="text-muted-foreground max-w-lg mb-8">
                Run a comprehensive analysis of your portfolio using your investment philosophy.
                The AI will check allocations, position sizes, thesis quality, and market signals.
              </p>

              {!hasData && (
                <div className="flex items-center gap-2 p-4 mb-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400">
                  <AlertCircle className="w-5 h-5" />
                  <span className="text-sm">Add some positions first to run analysis</span>
                </div>
              )}

              <Button 
                size="lg" 
                onClick={handleRunAnalysis}
                disabled={isAnalyzing || !hasData}
                className="gap-2 px-8"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Play className="w-5 h-5" />
                    Run Full Analysis
                  </>
                )}
              </Button>

              {/* History Section */}
              {history.length > 0 && (
                <div className="mt-12 w-full max-w-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <History className="w-5 h-5" />
                      Previous Analyses
                    </h3>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setShowHistory(!showHistory)}
                    >
                      {showHistory ? "Hide" : "Show All"}
                    </Button>
                  </div>
                  
                  <div className={cn(
                    "space-y-2",
                    !showHistory && "max-h-[200px] overflow-hidden"
                  )}>
                    {history.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => loadFromHistory(item)}
                        className="w-full p-4 rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors text-left flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {format(new Date(item.created_at), "PPP")}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(item.created_at), "p")}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-2xl font-bold text-primary">
                              {item.health_score}
                            </p>
                            <p className="text-xs text-muted-foreground">Health Score</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Analysis Results */}
          {currentAnalysis && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <Button 
                  variant="outline" 
                  onClick={() => setCurrentAnalysis(null)}
                >
                  ← Back
                </Button>
                <Button 
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing}
                  className="gap-2"
                >
                  {isAnalyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Run New Analysis
                    </>
                  )}
                </Button>
              </div>

              <AnalysisResultsView
                analysis={currentAnalysis}
                onMarkCompleted={markActionCompleted}
                onDismiss={dismissAction}
              />
            </div>
          )}
        </TabsContent>

        <TabsContent value="decisions" className="mt-6">
          <DecisionLogView />
        </TabsContent>
      </Tabs>
    </div>
  );
}
