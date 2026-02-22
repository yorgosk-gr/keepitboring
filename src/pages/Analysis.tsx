import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { DecisionLogView } from "@/components/decisions/DecisionLogView";
import { BarChart3, BookOpen, Play, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { usePortfolioAnalysis, type AnalysisResult } from "@/hooks/usePortfolioAnalysis";
import { usePositions, type Position } from "@/hooks/usePositions";
import { useIdealAllocation, type IdealETF } from "@/hooks/useIdealAllocation";
import { format } from "date-fns";

export default function Analysis() {
  const {
    currentAnalysis,
    setCurrentAnalysis,
    history,
    isLoadingHistory,
    runAnalysis,
    isAnalyzing,
    hasData,
  } = usePortfolioAnalysis();
  const { positions } = usePositions();
  const { result: idealAllocation, generate: generateIdealAllocation, isGenerating: isGeneratingIdeal } = useIdealAllocation();

  // Auto-load latest analysis on mount
  useEffect(() => {
    if (!currentAnalysis && history.length > 0 && !isLoadingHistory) {
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

      setCurrentAnalysis({
        id: latest.id,
        created_at: latest.created_at,
        allocation_check: normalizedAllocation,
        position_alerts: latest.position_alerts ?? [],
        thesis_checks: latest.thesis_checks ?? [],
        market_signals: latest.market_signals ?? {
          bubble_warnings: [], consensus_level: "mixed", overall_sentiment: "N/A",
        },
        recommended_actions: latest.recommended_actions ?? [],
        trade_recommendations: (raw).trade_recommendations ?? [],
        rebalancing_summary: (raw).rebalancing_summary ?? {
          total_sells: "$0", total_buys: "$0", net_cash_impact: "$0", primary_goal: "N/A",
        },
        portfolio_health_score: latest.health_score ?? 0,
        key_risks: latest.key_risks ?? [],
        summary: latest.summary ?? "",
      });
    }
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
            <div>
              {currentAnalysis?.created_at && (
                <p className="text-sm text-muted-foreground">
                  Last analysis: {format(new Date(currentAnalysis.created_at), "PPpp")}
                </p>
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
            <AnalysisTextView analysis={currentAnalysis} positions={positions} />
          )}

          {/* Ideal Portfolio Allocation */}
          <section className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Ideal Portfolio Allocation</h2>
                <p className="text-sm text-muted-foreground">
                  AI-recommended $100k allocation using Ireland-domiciled UCITS ETFs
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
                    Generate Allocation
                  </>
                )}
              </Button>
            </div>

            {idealAllocation && <IdealAllocationView data={idealAllocation} />}
          </section>
        </TabsContent>

        <TabsContent value="decisions" className="mt-6">
          <DecisionLogView />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AnalysisTextView({ analysis, positions = [] }: { analysis: AnalysisResult; positions?: Position[] }) {
  const alloc = analysis.allocation_check;
  const criticalAlerts = analysis.position_alerts.filter((a) => a.severity === "critical" && a.alert_type !== "thesis");
  const warningAlerts = analysis.position_alerts.filter((a) => a.severity === "warning" && a.alert_type !== "thesis");

  return (
    <article className="max-w-3xl space-y-8 text-foreground">
      {/* Health Score */}
      <section>
        <h2 className="text-xl font-bold mb-2">
          Portfolio Health Score: {analysis.portfolio_health_score}/100
        </h2>
        <p className="text-muted-foreground">{analysis.summary}</p>
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

      {/* Key Risks */}
      {analysis.key_risks.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 border-b border-border pb-2">Key Risks</h2>
          <ul className="space-y-2">
            {analysis.key_risks.map((risk, i) => (
              <li key={i} className="text-sm text-muted-foreground">
                <span className="text-destructive font-medium">{i + 1}.</span> {risk}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Position Alerts */}
      {(criticalAlerts.length > 0 || warningAlerts.length > 0) && (
        <section>
          <h2 className="text-lg font-semibold mb-3 border-b border-border pb-2">
            Position Alerts ({criticalAlerts.length + warningAlerts.length})
          </h2>
          {criticalAlerts.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-destructive mb-2">Critical</h3>
              {criticalAlerts.map((alert, i) => (
                <div key={i} className="mb-3 text-sm">
                  <p>
                    <span className="font-mono font-bold">{alert.ticker}</span>
                    <span className="text-muted-foreground"> — {alert.issue}</span>
                  </p>
                  {alert.recommendation && (
                    <p className="text-muted-foreground ml-4">→ {alert.recommendation}</p>
                  )}
                </div>
              ))}
            </div>
          )}
          {warningAlerts.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-amber-500 mb-2">Warnings</h3>
              {warningAlerts.map((alert, i) => (
                <div key={i} className="mb-3 text-sm">
                  <p>
                    <span className="font-mono font-bold">{alert.ticker}</span>
                    <span className="text-muted-foreground"> — {alert.issue}</span>
                  </p>
                  {alert.recommendation && (
                    <p className="text-muted-foreground ml-4">→ {alert.recommendation}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Market Signals (concise) */}
      <section>
        <h2 className="text-lg font-semibold mb-3 border-b border-border pb-2">Market Signals</h2>
        <div className="text-sm space-y-1">
          <p>
            <span className="text-muted-foreground">Overall sentiment:</span>{" "}
            {analysis.market_signals.overall_sentiment}
          </p>
          <p>
            <span className="text-muted-foreground">Consensus:</span>{" "}
            {analysis.market_signals.consensus_level.replace("_", " ")}
          </p>
          {analysis.market_signals.bubble_warnings.length > 0 && (
            <div className="mt-2">
              <p className="text-amber-500 font-medium">Key warnings:</p>
              <ul className="ml-4">
                {analysis.market_signals.bubble_warnings.slice(0, 5).map((w, i) => (
                  <li key={i} className="text-muted-foreground">• {w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      {/* Trade Recommendations */}
      {analysis.trade_recommendations && analysis.trade_recommendations.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 border-b border-border pb-2">Trade Recommendations</h2>
          {analysis.rebalancing_summary && (
            <div className="text-sm text-muted-foreground mb-3 space-y-0.5">
              <p>Total sells: {analysis.rebalancing_summary.total_sells} · Total buys: {analysis.rebalancing_summary.total_buys}</p>
              <p>Net cash impact: {analysis.rebalancing_summary.net_cash_impact}</p>
              <p>Primary goal: {analysis.rebalancing_summary.primary_goal}</p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border">
                  <th className="pb-2 font-medium">Ticker</th>
                  <th className="pb-2 font-medium">Action</th>
                  <th className="pb-2 font-medium text-right">Shares</th>
                  <th className="pb-2 font-medium text-right">Weight</th>
                  <th className="pb-2 font-medium">Reasoning</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {analysis.trade_recommendations.map((tr, i) => (
                  <tr key={i}>
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
                      {tr.current_weight.toFixed(1)}% → {tr.target_weight.toFixed(1)}%
                    </td>
                    <td className="py-2 text-muted-foreground text-xs max-w-[300px]">{tr.reasoning}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Industry Recommendations */}
      {(analysis as any).industry_recommendations && (analysis as any).industry_recommendations.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 border-b border-border pb-2">Recommended Industries</h2>
          <div className="space-y-3">
            {(analysis as any).industry_recommendations.map((rec: any, i: number) => (
              <div key={i} className="text-sm">
                <p className="font-medium">
                  {rec.stance === "overweight" ? (
                    <span className="text-emerald-500">▲ Overweight</span>
                  ) : rec.stance === "underweight" ? (
                    <span className="text-destructive">▼ Underweight</span>
                  ) : (
                    <span className="text-muted-foreground">● Neutral</span>
                  )}
                  {" "}{rec.industry}
                </p>
                <p className="text-muted-foreground ml-5">{rec.reasoning}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommended Actions */}
      {analysis.recommended_actions.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-3 border-b border-border pb-2">Recommended Actions</h2>
          <ol className="space-y-3">
            {analysis.recommended_actions.map((action, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium">
                  <span className="text-primary">{i + 1}.</span> {action.action}
                  <span className="text-muted-foreground font-normal ml-2">
                    ({action.confidence} confidence)
                  </span>
                </p>
                <p className="text-muted-foreground ml-5">{action.reasoning}</p>
              </li>
            ))}
          </ol>
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

function IdealAllocationView({ data }: { data: { etfs: IdealETF[]; strategy_summary: string; tax_note: string } }) {
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
            <tr className="border-t border-border font-medium">
              <td className="py-2" colSpan={3}>Total</td>
              <td className="py-2 text-right font-mono">
                ${data.etfs.reduce((s, e) => s + e.amount_usd, 0).toLocaleString()}
              </td>
              <td className="py-2 text-right">
                {data.etfs.reduce((s, e) => s + e.percent, 0).toFixed(1)}%
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
