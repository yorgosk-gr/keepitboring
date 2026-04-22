import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DecisionLogView } from "@/components/decisions/DecisionLogView";
import { BarChart3, BookOpen, Play, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePortfolioAnalysis, type AnalysisResult, type TradeRecommendation, type RecommendedAction } from "@/hooks/usePortfolioAnalysis";
import { usePositions, type Position } from "@/hooks/usePositions";
import { useIdealAllocation, type IdealETF } from "@/hooks/useIdealAllocation";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useInsightsSummary } from "@/hooks/useInsightsSummary";
import { ThesisHealthSection } from "@/components/analysis/ThesisHealthSection";
import { LogDecisionModal } from "@/components/decisions/LogDecisionModal";
import { RecommendedActionsCard } from "@/components/analysis/RecommendedActionsCard";
import { format, formatDistanceToNow } from "date-fns";

export default function Analysis() {
  const {
    currentAnalysis,
    setCurrentAnalysis,
    history,
    isLoadingHistory,
    runAnalysis,
    isAnalyzing,
    hasData,
    markActionCompleted,
    dismissAction,
  } = usePortfolioAnalysis();
  const { positions } = usePositions();
  const { result: idealAllocation, generate: generateIdealAllocation, isGenerating: isGeneratingIdeal } = useIdealAllocation();
  const { totalValue: portfolioTotalValue } = useDashboardData();
  const { summary: latestBrief } = useInsightsSummary();
  const [logDecisionRec, setLogDecisionRec] = useState<RecommendedAction | null>(null);

  // Brief freshness
  const briefAge = latestBrief?.generated_at
    ? formatDistanceToNow(new Date(latestBrief.generated_at), { addSuffix: true })
    : null;
  const briefDaysOld = latestBrief?.generated_at
    ? Math.floor((Date.now() - new Date(latestBrief.generated_at).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Auto-load latest analysis on mount
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    const loadLatest = async () => {
    if (!hasLoadedRef.current && history.length > 0 && !isLoadingHistory) {
      hasLoadedRef.current = true;
      const latest = history[0];
      const raw = latest as any;
      const rawAllocation = latest.allocation_check as any;
      let normalizedAllocation;

      if (rawAllocation) {
        if (rawAllocation.equities_percent !== undefined) {
          normalizedAllocation = rawAllocation;
        } else {
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
        normalizedAllocation = {
          equities_percent: 0, equities_status: "ok" as const,
          bonds_percent: 0, bonds_status: "ok" as const,
          commodities_percent: 0, commodities_status: "ok" as const,
          cash_percent: 100, stocks_vs_etf_split: "", issues: [],
        };
      }

      const rawResponse = latest.raw_response;
      setCurrentAnalysis({
        id: latest.id,
        created_at: latest.created_at,
        allocation_check: normalizedAllocation,
        position_alerts: latest.position_alerts ?? [],
        
        market_signals: latest.market_signals ?? {
          bubble_warnings: [], consensus_level: "mixed", overall_sentiment: "N/A",
        },
        recommended_actions: (latest.recommended_actions ?? []),
        trade_recommendations: rawResponse?.trade_recommendations ?? [],
        rebalancing_summary: rawResponse?.rebalancing_summary ?? {
          total_sells: "$0", total_buys: "$0", net_cash_impact: "$0", primary_goal: "N/A",
        },
        bond_recommendations: rawResponse?.bond_recommendations,
        industry_recommendations: rawResponse?.industry_recommendations,
        portfolio_health_score: latest.health_score ?? 0,
        summary: latest.summary ?? "",
        health_score_breakdown: rawResponse?.health_score_breakdown ?? undefined,
        thesis_checks: Array.isArray(rawResponse?.thesis_checks) ? rawResponse.thesis_checks : [],
        ideal_allocation: rawResponse?.ideal_allocation ?? null,
        analysis_meta: rawResponse?.analysis_meta ?? undefined,
      } as any);

      // Restore persisted action states (completed/dismissed)
      const { data: actionStates } = await supabase
        .from("recommended_action_states" as any)
        .select("action_index, completed, dismissed, dismiss_reason")
        .eq("analysis_id", latest.id);

      if (actionStates && actionStates.length > 0) {
        setCurrentAnalysis((prev) => {
          if (!prev) return prev;
          const actions = [...prev.recommended_actions];
          for (const state of actionStates as any[]) {
            if (actions[state.action_index]) {
              actions[state.action_index] = {
                ...actions[state.action_index],
                completed: state.completed ?? false,
                dismissed: state.dismissed ?? false,
                dismiss_reason: state.dismiss_reason ?? undefined,
              };
            }
          }
          return { ...prev, recommended_actions: actions };
        });
      }
    }
    };
    loadLatest();
  }, [history, isLoadingHistory]);

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
          {/* Run / Re-run button */}
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-1">
              {currentAnalysis?.created_at && (
                <p className="text-sm text-muted-foreground">
                  Last analysis: {format(new Date(currentAnalysis.created_at), "PPpp")}
                </p>
              )}
              {briefAge && (
                <div className="flex items-center gap-2">
                  <p className="text-xs">
                    <span className="text-muted-foreground">Intelligence brief: </span>
                    <span className={
                      briefDaysOld !== null && briefDaysOld >= 5 ? "text-destructive font-medium" :
                      briefDaysOld !== null && briefDaysOld >= 2 ? "text-amber-500 font-medium" :
                      "text-emerald-500"
                    }>
                      {briefAge}
                      {briefDaysOld !== null && briefDaysOld >= 5 && " — stale"}
                      {briefDaysOld !== null && briefDaysOld >= 2 && briefDaysOld < 5 && " — consider refreshing"}
                    </span>
                  </p>
                  {briefDaysOld !== null && briefDaysOld >= 2 && (
                    <a
                      href="/newsletters"
                      className="text-xs text-primary underline underline-offset-2 hover:text-primary/80"
                    >
                      Regen brief →
                    </a>
                  )}
                </div>
              )}
              {!latestBrief && (
                <p className="text-xs text-destructive">No intelligence brief — generate one from the Newsletters page</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!hasData && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs">Add positions first</span>
                </div>
              )}
              <Button
                onClick={() => runAnalysis()}
                disabled={isAnalyzing || !hasData}
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
                    {currentAnalysis ? "Run New Analysis" : "Run Full Analysis"}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* No analysis yet */}
          {!currentAnalysis && !isLoadingHistory && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <BarChart3 className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">AI Portfolio Analysis</h2>
              <p className="text-muted-foreground max-w-lg">
                Run a comprehensive analysis of your portfolio using your investment philosophy.
                The AI will check allocations, position sizes, thesis quality, and market signals.
              </p>
            </div>
          )}

          {/* Analysis as readable text */}
          {currentAnalysis && (
            <AnalysisTextView
              analysis={currentAnalysis}
              positions={positions}
              onLogDecision={(trade) => {
                setLogDecisionRec({
                  priority: 1,
                  action: `${trade.action} ${trade.ticker}`,
                  reasoning: trade.reasoning,
                  confidence: trade.urgency === "high" ? "high" : trade.urgency === "medium" ? "medium" : "low",
                  trades_involved: [trade.ticker],
                });
              }}
              onMarkCompleted={markActionCompleted}
              onDismiss={dismissAction}
              onLogDecisionAction={(recommendation) => setLogDecisionRec(recommendation ?? null)}
            />
          )}

          {/* Ideal Portfolio Allocation — comes from analysis or standalone generate */}
          {(currentAnalysis?.ideal_allocation || idealAllocation) && (
            <section className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Ideal Portfolio Allocation</h2>
                  <p className="text-sm text-muted-foreground">
                    AI-recommended allocation using Ireland-domiciled UCITS ETFs
                  </p>
                </div>
                {!currentAnalysis?.ideal_allocation && (
                  <Button
                    onClick={() => generateIdealAllocation()}
                    disabled={isGeneratingIdeal}
                    variant="outline"
                    className="gap-2"
                  >
                    {isGeneratingIdeal ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Regenerate
                      </>
                    )}
                  </Button>
                )}
              </div>
              <IdealAllocationView data={(currentAnalysis?.ideal_allocation || idealAllocation)!} portfolioTotalValue={portfolioTotalValue} />
            </section>
          )}
          {/* If no ideal allocation yet (no analysis run, no standalone), show generate button */}
          {!currentAnalysis?.ideal_allocation && !idealAllocation && (
            <section className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-foreground">Ideal Portfolio Allocation</h2>
                  <p className="text-sm text-muted-foreground">
                    Run an analysis to generate this, or generate standalone
                  </p>
                </div>
                <Button
                  onClick={() => generateIdealAllocation()}
                  disabled={isGeneratingIdeal}
                  variant="outline"
                  className="gap-2"
                >
                  {isGeneratingIdeal ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            </section>
          )}
        </TabsContent>

        <TabsContent value="decisions" className="mt-6">
          <DecisionLogView />
        </TabsContent>
      </Tabs>

      {/* Log Decision Modal — triggered from trade recommendations */}
      <LogDecisionModal
        open={logDecisionRec !== null}
        onClose={() => setLogDecisionRec(null)}
        recommendation={logDecisionRec}
      />
    </div>
  );
}

function AnalysisTextView({ analysis, positions = [], onLogDecision, onMarkCompleted, onDismiss, onLogDecisionAction }: { analysis: AnalysisResult; positions?: Position[]; onLogDecision?: (trade: TradeRecommendation) => void; onMarkCompleted?: (index: number) => void; onDismiss?: (index: number, reason: string) => void; onLogDecisionAction?: (recommendation?: RecommendedAction) => void }) {
  const alloc = analysis.allocation_check;
  return (
    <article className="max-w-3xl space-y-8 text-foreground">
      {/* Health Score */}
      <section>
        <h2 className="text-xl font-bold mb-2">
          Portfolio Health Score: {analysis.portfolio_health_score}/100
        </h2>
        <p className="text-muted-foreground">{analysis.summary}</p>
        {(analysis as any).health_score_breakdown && (analysis as any).health_score_breakdown.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-semibold text-foreground mb-2">Score Breakdown (Hard Rules)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-1 font-medium">Rule</th>
                    <th className="pb-1 font-medium text-right">Current</th>
                    <th className="pb-1 font-medium text-right">Target</th>
                    <th className="pb-1 font-medium text-right">Status</th>
                    <th className="pb-1 font-medium text-right">Deducted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(analysis as any).health_score_breakdown.map((item: any, i: number) => (
                    <tr key={i} className={item.status === "breach" ? "text-destructive" : "text-muted-foreground"}>
                      <td className="py-1">{item.rule}</td>
                      <td className="py-1 text-right font-mono">{item.current}%</td>
                      <td className="py-1 text-right font-mono">{item.target}</td>
                      <td className="py-1 text-right">
                        {item.status === "breach" ? (
                          <span className="text-destructive font-medium">breach</span>
                        ) : (
                          <span className="text-emerald-500">ok</span>
                        )}
                      </td>
                      <td className="py-1 text-right font-mono">
                        {item.points_deducted > 0 ? `-${item.points_deducted}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Allocation */}
      <section>
        <h2 className="text-lg font-semibold mb-3 border-b border-border pb-2">Allocation Check</h2>
        <div className="space-y-1 text-sm">
          <AllocationLine label="Equities" value={alloc.equities_percent} status={alloc.equities_status} />
          <AllocationLine label="Bonds" value={alloc.bonds_percent} status={alloc.bonds_status} />
          <AllocationLine label="Commodities" value={alloc.commodities_percent} status={alloc.commodities_status} />
          <AllocationLine label="Cash" value={alloc.cash_percent} />
          {alloc.stocks_vs_etf_split && (
            <p className="text-muted-foreground pt-1">Stocks vs ETF split: {alloc.stocks_vs_etf_split}</p>
          )}
          {alloc.issues && alloc.issues.length > 0 && (
            <ul className="mt-2 space-y-1">
              {alloc.issues.map((issue, i) => (
                <li key={i} className="text-destructive text-sm">• {issue}</li>
              ))}
            </ul>
          )}
        </div>
      </section>


      {/* Thesis Health */}
      <ThesisHealthSection checks={(analysis as any).thesis_checks ?? []} />

      {/* Trade Recommendations */}
      {analysis.trade_recommendations && analysis.trade_recommendations.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 border-b border-border pb-2">Trade Recommendations</h2>
          {analysis.rebalancing_summary && (
            <div className="text-sm text-muted-foreground mb-3 space-y-0.5">
              {(analysis.rebalancing_summary as any).execution_sequence_summary && (
                <p className="text-foreground font-medium mb-1">
                  Execution order: {(analysis.rebalancing_summary as any).execution_sequence_summary}
                </p>
              )}
              <p>Total sells: {analysis.rebalancing_summary.total_sells} · Total buys: {analysis.rebalancing_summary.total_buys}</p>
              <p>Net cash impact: {analysis.rebalancing_summary.net_cash_impact}</p>
              <p>Primary goal: {analysis.rebalancing_summary.primary_goal}</p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-2 font-medium w-8">Exec</th>
                  <th className="pb-2 font-medium">Ticker</th>
                  <th className="pb-2 font-medium">Action</th>
                  <th className="pb-2 font-medium text-right">Shares</th>
                  <th className="pb-2 font-medium text-right">Weight</th>
                  <th className="pb-2 font-medium">Reasoning</th>
                  <th className="pb-2 font-medium w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[...analysis.trade_recommendations]
                  .sort((a, b) => {
                    const sa = (a as any).execution_step ?? Infinity;
                    const sb = (b as any).execution_step ?? Infinity;
                    return sa - sb;
                  })
                  .map((tr, i) => (
                  <tr key={i}>
                    <td className="py-2">
                      {(tr as any).execution_step != null ? (
                        <span
                          title={(tr as any).execution_note ?? ""}
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-medium cursor-default"
                        >
                          {(tr as any).execution_step}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="py-2 font-mono font-bold">{tr.ticker}</td>
                    <td className="py-2">
                      <span className={
                        tr.action === "SELL" ? "text-destructive font-medium" :
                        tr.action === "BUY" ? "text-emerald-500 font-medium" :
                        "text-muted-foreground"
                      }>
                        {tr.action}
                      </span>
                    </td>
                    <td className="py-2 text-right font-mono">
                      {tr.shares_to_trade !== 0 ? (tr.shares_to_trade > 0 ? `+${tr.shares_to_trade}` : tr.shares_to_trade) : "—"}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">
                      {tr.action === "HOLD"
                        ? `${tr.current_weight.toFixed(1)}%`
                        : `${tr.current_weight.toFixed(1)}% → ${tr.target_weight.toFixed(1)}%`}
                    </td>
                    <td className="py-2 text-muted-foreground text-xs max-w-[300px]">{tr.reasoning}</td>
                    <td className="py-2">
                      {tr.action !== "HOLD" && onLogDecision && (
                        <button
                          onClick={() => onLogDecision(tr)}
                          className="text-xs text-primary hover:text-primary/80 font-medium whitespace-nowrap"
                        >
                          Log
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Recommended Actions */}
      {analysis.recommended_actions.length > 0 && onMarkCompleted && onDismiss && (
        <section>
          <RecommendedActionsCard
            actions={analysis.recommended_actions}
            onMarkCompleted={onMarkCompleted}
            onDismiss={onDismiss}
            onLogDecision={onLogDecisionAction ?? (() => {})}
          />
        </section>
      )}
    </article>
  );
}

function AllocationLine({
  label,
  value,
  status,
}: {
  label: string;
  value: number;
  status?: string;
}) {
  return (
    <p>
      <span className="inline-block w-28 text-muted-foreground">{label}:</span>
      <span className={
        status === "critical" ? "text-destructive font-medium" :
        status === "warning" ? "text-amber-500 font-medium" :
        "text-foreground"
      }>
        {value.toFixed(1)}%
      </span>
      {status && status !== "ok" && (
        <span className="text-xs text-muted-foreground ml-2">({status})</span>
      )}
    </p>
  );
}

function IdealAllocationView({ data, portfolioTotalValue }: { data: { etfs: IdealETF[]; strategy_summary: string; tax_note: string }; portfolioTotalValue: number }) {
  const etfTotalAmount = data.etfs.reduce((s, e) => s + e.amount_usd, 0);
  const etfTotalPercent = data.etfs.reduce((s, e) => s + e.percent, 0);
  const reservedAmount = Math.max(0, portfolioTotalValue - etfTotalAmount);
  const reservedPercent = Math.max(0, 100 - etfTotalPercent);
  const assetClassColors: Record<string, string> = {
    Equity: "text-emerald-500",
    Bond: "text-blue-500",
    Bonds: "text-blue-500",
    Commodity: "text-amber-500",
    Commodities: "text-amber-500",
  };

  return (
    <div className="space-y-4">
      {/* Strategy Summary */}
      <div className="p-4 rounded-lg bg-secondary/50 border border-border">
        <p className="text-sm text-foreground">{data.strategy_summary}</p>
        <p className="text-xs text-muted-foreground mt-2 italic">{data.tax_note}</p>
      </div>

      {/* ETF Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border">
              <th className="pb-2 font-medium">Ticker</th>
              <th className="pb-2 font-medium">Name</th>
              <th className="pb-2 font-medium">Class</th>
              <th className="pb-2 font-medium text-right">Amount</th>
              <th className="pb-2 font-medium text-right">Weight</th>
              <th className="pb-2 font-medium text-right">TER</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.etfs.map((etf, i) => (
              <tr key={i}>
                <td className="py-2 font-mono font-bold">{etf.ticker}</td>
                <td className="py-2 text-muted-foreground text-xs max-w-[200px]">{etf.name}</td>
                <td className="py-2">
                  <span className={assetClassColors[etf.asset_class] || "text-foreground"}>
                    {etf.sub_category || etf.asset_class}
                  </span>
                </td>
                <td className="py-2 text-right font-mono">
                  ${etf.amount_usd.toLocaleString()}
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {etf.percent.toFixed(1)}%
                </td>
                <td className="py-2 text-right text-muted-foreground">
                  {etf.expense_ratio.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {reservedPercent > 0.5 && (
              <tr className="text-muted-foreground italic">
                <td className="py-2" colSpan={3}>Reserved (individual stocks + cash)</td>
                <td className="py-2 text-right font-mono">
                  ${reservedAmount.toLocaleString()}
                </td>
                <td className="py-2 text-right">
                  {reservedPercent.toFixed(1)}%
                </td>
                <td className="py-2 text-right">—</td>
              </tr>
            )}
            <tr className="border-t border-border font-medium">
              <td className="py-2" colSpan={3}>Total</td>
              <td className="py-2 text-right font-mono">
                ${(etfTotalAmount + (reservedPercent > 0.5 ? reservedAmount : 0)).toLocaleString()}
              </td>
              <td className="py-2 text-right">
                {(etfTotalPercent + (reservedPercent > 0.5 ? reservedPercent : 0)).toFixed(1)}%
              </td>
              <td className="py-2 text-right text-muted-foreground">
                {(data.etfs.reduce((s, e) => s + e.expense_ratio * e.percent, 0) / 100).toFixed(3)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Explanations */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">ETF Rationale</h3>
        {data.etfs.map((etf, i) => (
          <div key={i} className="text-sm">
            <span className="font-mono font-bold">{etf.ticker}</span>
            <span className="text-muted-foreground"> — {etf.explanation}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
