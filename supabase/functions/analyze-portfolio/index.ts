import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Deterministic Rule Evaluation ────────────────────────────────
type RuleStatus = "underweight" | "overweight" | "within_range" | "not_applicable";

interface RuleEvaluationEntry {
  rule_id: string;
  name: string;
  category: string;
  metric: string;
  current: number | null;
  min: number | null;
  max: number | null;
  status: RuleStatus;
  message: string;
}

interface RuleEvaluationMetrics {
  equities_percent: number;
  bonds_percent: number;
  commodities_percent: number;
  cash_percent: number;
  stocks_percent: number;
  etfs_percent: number;
  etfs_of_equities_percent: number;
  stocks_of_equities_percent: number;
  antifragile_percent: number;
}

interface HealthScoreBreakdownItem {
  rule: string;
  metric: string;
  current: number;
  target: string;
  status: "breach" | "ok";
  points_deducted: number;
}

interface RuleEvaluation {
  entries: RuleEvaluationEntry[];
  main_allocation_issues: string[];
  soft_issues: string[];
  metrics: RuleEvaluationMetrics;
  health_score_breakdown: HealthScoreBreakdownItem[];
}

function computeRuleEvaluation(
  positions: any[],
  rules: any[],
  etfClassifications: any[],
  cashBalance: number,
  totalPortfolioValue: number,
  riskProfile?: { profile: string; score?: number; dimension_scores?: any } | null
): RuleEvaluation {
  const safePositions = positions ?? [];
  const safeRules = (rules ?? []).filter((r: any) => r.is_active !== false);
  const totalVal = totalPortfolioValue || 1;

  // Build classification lookup: ticker -> category
  const classMap: Record<string, string> = {};
  for (const c of (etfClassifications ?? [])) {
    if (c.ticker && c.category) {
      // Normalise to singular lowercase: "Equities" -> "equity", "Bonds" -> "bond", "Commodities" -> "commodity"
      const raw = c.category.toLowerCase().trim();
      const normalised = raw === "fixed income" ? "bond"
        : raw.replace(/ies$/, "y").replace(/s$/, "");
      classMap[c.ticker] = normalised;
    }
  }

  // Compute asset class sums
  let equityValue = 0;
  let bondValue = 0;
  let commodityGoldValue = 0;
  let goldValue = 0;

  for (const p of safePositions) {
    const mv = p.market_value ?? 0;
    const posType = (p.position_type || "").toLowerCase();
    const rawCat = (classMap[p.ticker] || p.category || "").toLowerCase().trim();
    const cat = rawCat === "fixed income" ? "bond"
      : rawCat.replace(/ies$/, "y").replace(/s$/, "");

    if (posType === "cash" || cat === "cash") {
      // Defense-in-depth: cash tracked via cashBalance param, not position values
    } else if (cat === "bond") {
      bondValue += mv;
    } else if (cat === "commodity" || cat === "gold") {
      commodityGoldValue += mv;
      if (cat === "gold" || (p.name || "").toLowerCase().includes("gold")) {
        goldValue += mv;
      }
    } else if (posType === "stock") {
      equityValue += mv;
    } else {
      // Unclassified or equity ETFs default to equity
      equityValue += mv;
    }
  }

  // stocksValue: individual stocks only (excludes bond/commodity/gold ETFs that may carry posType "stock")
  const stocksValue = safePositions
    .filter((p: any) => {
      if ((p.position_type || "").toLowerCase() !== "stock") return false;
      const rawCat = (classMap[p.ticker] || p.category || "").toLowerCase().trim();
      const pCat = rawCat === "fixed income" ? "bond" : rawCat.replace(/ies$/, "y").replace(/s$/, "");
      return pCat !== "bond" && pCat !== "commodity" && pCat !== "gold" && pCat !== "cash";
    })
    .reduce((s: number, p: any) => s + (p.market_value ?? 0), 0);

  const equityPercent = (equityValue / totalVal) * 100;
  const bondPercent = (bondValue / totalVal) * 100;
  const commodityGoldPercent = (commodityGoldValue / totalVal) * 100;
  const cashPercent = (cashBalance / totalVal) * 100;
  const goldPercent = (goldValue / totalVal) * 100;
  const stocksPercent = (stocksValue / totalVal) * 100;
  const etfsPercent = Math.max(0, equityPercent - stocksPercent);

  // Anti-fragile = gold + short-term bonds (approximate as 30% of bonds) + cash
  const shortTermBondPercent = bondPercent * 0.3;
  const antifragilePercent = goldPercent + shortTermBondPercent + cashPercent;

  // Derived metrics: ETF/Stock as % of equities (not total portfolio)
  const etfsOfEquitiesPercent = equityPercent > 0 ? ((equityValue - stocksValue) / equityValue) * 100 : 0;
  const stocksOfEquitiesPercent = equityPercent > 0 ? (stocksValue / equityValue) * 100 : 0;

  // Metric resolver
  const metricValues: Record<string, number> = {
    stocks_percent: stocksPercent,
    etfs_percent: etfsPercent,
    equity_percent: equityPercent,
    bonds_percent: bondPercent,
    commodities_gold_percent: commodityGoldPercent,
    gold_percent: goldPercent,
    cash_percent: cashPercent,
    antifragile_percent: antifragilePercent,
    etfs_of_equities_percent: etfsOfEquitiesPercent,
    stocks_of_equities_percent: stocksOfEquitiesPercent,
  };

  // Name-to-metric mapping for rules that use name instead of metric field
  const nameToMetric: Record<string, string> = {
    "Stock Allocation": "stocks_of_equities_percent",
    "ETF Allocation": "etfs_of_equities_percent",
    "Equity Allocation": "equity_percent",
    "Bond Allocation": "bonds_percent",
    "Commodity + Gold Allocation": "commodities_gold_percent",
    "Anti-Fragile Minimum": "antifragile_percent",
    "Cash Limit": "cash_percent",
  };

  const entries: RuleEvaluationEntry[] = [];
  const issues: string[] = [];
  const softIssues: string[] = [];

  // Override Cash Limit rule thresholds with risk-profile-based cash guidance
  const riskCashRanges: Record<string, { min: number; max: number }> = {
    cautious: { min: 10, max: 20 },
    balanced: { min: 10, max: 20 },
    growth: { min: 3, max: 10 },
    aggressive: { min: 1, max: 5 },
  };
  const profileKey = (riskProfile?.profile ?? "").toLowerCase();
  const cashOverride = riskCashRanges[profileKey] ?? null;

  for (const rule of safeRules) {
    // Match allocation rules by rule_type OR category
    const isAllocationRule = rule.rule_type === "allocation" || rule.category === "allocation";
    if (!isAllocationRule) continue;
    if (rule.threshold_min == null && rule.threshold_max == null) continue;

    // Resolve metric from rule.metric field, falling back to name-based lookup
    const metric = rule.metric || nameToMetric[rule.name] || null;
    if (!metric) continue;

    const current = metricValues[metric] ?? null;
    if (current === null) {
      entries.push({
        rule_id: rule.id,
        name: rule.name,
        category: rule.category || "allocation",
        metric: metric,
        current: null,
        min: rule.threshold_min,
        max: rule.threshold_max,
        status: "not_applicable",
        message: `Metric "${metric}" could not be resolved.`,
      });
      continue;
    }

    // Override cash limit thresholds from risk profile if available
    let min = rule.threshold_min;
    let max = rule.threshold_max;
    if (metric === "cash_percent" && cashOverride) {
      min = cashOverride.min;
      max = cashOverride.max;
    }
    let status: RuleStatus = "within_range";
    let message = "";

    if (min != null && current < min) {
      status = "underweight";
      message = `${rule.name}: ${current.toFixed(1)}% is below minimum ${min}% — underweight.`;
    } else if (max != null && current > max) {
      status = "overweight";
      message = `${rule.name}: ${current.toFixed(1)}% exceeds maximum ${max}% — overweight.`;
    } else {
      message = `${rule.name}: ${current.toFixed(1)}% is within range [${min ?? "–"}%, ${max ?? "–"}%].`;
    }

    entries.push({
      rule_id: rule.id,
      name: rule.name,
      category: rule.category || "allocation",
      metric: metric,
      current: parseFloat(current.toFixed(2)),
      min,
      max,
      status,
      message,
    });

    // Separate hard vs soft issues
    if (status !== "within_range") {
      const enforcement = (rule.rule_enforcement ?? "hard").toLowerCase();
      if (enforcement === "hard") {
        issues.push(message);
      } else if (enforcement === "soft") {
        softIssues.push(message);
      }
      // diagnostic: never add to issues
    }
  }

  // Compute health score breakdown from hard rule entries
  const healthScoreBreakdown: HealthScoreBreakdownItem[] = safeRules
    .filter((r: any) => (r.rule_enforcement ?? "hard").toLowerCase() === "hard")
    .map((r: any) => {
      const entry = entries.find((e: any) => e.rule_id === r.id || e.name === r.name);
      const status = entry?.status ?? "within_range";
      const current = entry?.current ?? 0;
      const isBreach = status === "underweight" || status === "overweight";
      let pointsDeducted = 0;
      if (isBreach) {
        const metric = r.metric || nameToMetric[r.name] || "";
        const min = r.threshold_min ?? 0;
        const max = r.threshold_max ?? 100;
        const overshoot = status === "overweight" ? current - max : min - current;

        // Cash overweight is a softer concern — holding extra cash is defensively
        // prudent, especially in risk-off environments. Cap at -5 points.
        if (metric === "cash_percent" && status === "overweight") {
          pointsDeducted = 5;
        } else {
          pointsDeducted = overshoot > 5 ? 20 : 10;
        }
      }
      return {
        rule: r.name,
        metric: r.metric || "",
        current: parseFloat((current ?? 0).toFixed(1)),
        target: r.threshold_min !== null && r.threshold_min !== undefined && r.threshold_max !== null && r.threshold_max !== undefined
          ? `${r.threshold_min}–${r.threshold_max}%`
          : r.threshold_max !== null && r.threshold_max !== undefined
            ? `≤${r.threshold_max}%`
            : `≥${r.threshold_min}%`,
        status: isBreach ? "breach" as const : "ok" as const,
        points_deducted: pointsDeducted,
      };
    });

  return {
    entries,
    main_allocation_issues: issues.slice(0, 3),
    soft_issues: softIssues.slice(0, 3),
    metrics: {
      equities_percent: parseFloat(equityPercent.toFixed(2)),
      bonds_percent: parseFloat(bondPercent.toFixed(2)),
      commodities_percent: parseFloat(commodityGoldPercent.toFixed(2)),
      cash_percent: parseFloat(cashPercent.toFixed(2)),
      stocks_percent: parseFloat(stocksPercent.toFixed(2)),
      etfs_percent: parseFloat(etfsPercent.toFixed(2)),
      etfs_of_equities_percent: parseFloat(etfsOfEquitiesPercent.toFixed(2)),
      stocks_of_equities_percent: parseFloat(stocksOfEquitiesPercent.toFixed(2)),
      antifragile_percent: parseFloat(antifragilePercent.toFixed(2)),
    },
    health_score_breakdown: healthScoreBreakdown,
  };
}

// ── Server-side cash constraint enforcement ───────────────────────
function enforceCashConstraint(analysisResult: any, cashBalance: number, totalPortfolioValue: number): any {
  // Use percentage-based threshold: skip if cash is >0.5% of portfolio
  const cashPercent = totalPortfolioValue > 0 ? (cashBalance / totalPortfolioValue) * 100 : 0;
  if (cashPercent > 0.5) return analysisResult; // meaningful cash relative to portfolio, skip

  const trades = analysisResult.trade_recommendations ?? [];
  const totalSells = trades
    .filter((t: any) => t.shares_to_trade < 0)
    .reduce((s: number, t: any) => s + Math.abs(t.estimated_value ?? 0), 0);
  const totalBuys = trades
    .filter((t: any) => t.action === "BUY" && t.shares_to_trade > 0)
    .reduce((s: number, t: any) => s + (t.estimated_value ?? 0), 0);
  if (totalBuys <= totalSells) return analysisResult; // already balanced

  // If no sells exist, we can't fund any buys — convert them all to HOLD
  if (totalSells === 0) {
    for (const trade of trades) {
      if (trade.action === "BUY" && trade.shares_to_trade > 0) {
        trade.action = "HOLD";
        trade.shares_to_trade = 0;
        trade.recommended_shares = trade.current_shares ?? 0;
        trade.estimated_value = 0;
        trade.target_weight = trade.current_weight ?? 0;
        trade.reasoning = (trade.reasoning || "") + " [Blocked: no cash or sell proceeds to fund this buy]";
      }
    }
    analysisResult.rebalancing_summary = {
      ...analysisResult.rebalancing_summary,
      total_buys: "$0",
      net_cash_impact: "$0",
    };
    return analysisResult;
  }

  // Scale down buys proportionally to match available sell proceeds
  const scaleFactor = totalSells / totalBuys;
  for (const trade of trades) {
    if (trade.action === "BUY" && trade.shares_to_trade > 0) {
      trade.shares_to_trade = Math.floor(trade.shares_to_trade * scaleFactor);
      trade.recommended_shares = (trade.current_shares ?? 0) + trade.shares_to_trade;
      trade.estimated_value = Math.round((trade.estimated_value ?? 0) * scaleFactor);
      trade.target_weight = parseFloat(((trade.target_weight ?? 0) * scaleFactor).toFixed(2));
      // If scaling reduced shares to 0, convert to HOLD
      if (trade.shares_to_trade === 0) {
        trade.action = "HOLD";
        trade.recommended_shares = trade.current_shares ?? 0;
        trade.target_weight = trade.current_weight ?? 0;
      }
    }
  }
  const newBuys = trades
    .filter((t: any) => t.action === "BUY")
    .reduce((s: number, t: any) => s + (t.estimated_value ?? 0), 0);
  analysisResult.rebalancing_summary = {
    ...analysisResult.rebalancing_summary,
    total_buys: `$${Math.round(newBuys).toLocaleString()}`,
    net_cash_impact: (() => { const n = Math.round(totalSells - newBuys); return n === 0 ? "$0" : `+$${n.toLocaleString()}`; })(),
  };
  return analysisResult;
}

// ── Post-processing: validate & fix trade recommendation consistency ──
function validateTradeConsistency(result: any, positions: any[]): any {
  const trades = result.trade_recommendations;
  if (!Array.isArray(trades)) return result;

  const posMap: Record<string, any> = {};
  for (const p of positions) {
    posMap[p.ticker] = p;
  }

  let fixCount = 0;
  for (const trade of trades) {
    const cw = trade.current_weight ?? 0;
    const tw = trade.target_weight ?? 0;
    const currentShares = trade.current_shares ?? 0;
    const recShares = trade.recommended_shares ?? currentShares;
    const shareDelta = recShares - currentShares;

    // Determine what the action SHOULD be based on numeric fields.
    // Share delta is the primary signal (concrete); weight is secondary (can shift
    // due to other positions changing). Only override the AI's stated action when
    // share direction clearly contradicts it.
    let correctAction: string;
    if (shareDelta === 0 && Math.abs(tw - cw) < 0.3) {
      correctAction = "HOLD";
    } else if (shareDelta < 0) {
      // Shares are decreasing — must be a SELL regardless of weight direction
      correctAction = "SELL";
    } else if (shareDelta > 0) {
      // Shares are increasing — must be a BUY regardless of weight direction
      correctAction = "BUY";
    } else if (shareDelta === 0 && tw < cw) {
      // No share change but weight drops (other positions grew) — this is a HOLD, not SELL
      correctAction = "HOLD";
    } else if (shareDelta === 0 && tw > cw) {
      // No share change but weight increases — HOLD
      correctAction = "HOLD";
    } else {
      correctAction = "HOLD";
    }

    // Fix action if it contradicts the weight/shares direction
    if (trade.action !== correctAction) {
      console.warn(
        `Trade consistency fix: ${trade.ticker} action ${trade.action} → ${correctAction} ` +
        `(weight ${cw}→${tw}, shares ${currentShares}→${recShares})`
      );
      trade.action = correctAction;
      fixCount++;
    }

    // Fix shares_to_trade sign consistency
    if (trade.action === "SELL" && trade.shares_to_trade > 0) {
      trade.shares_to_trade = -Math.abs(trade.shares_to_trade);
      fixCount++;
    } else if (trade.action === "BUY" && trade.shares_to_trade < 0) {
      trade.shares_to_trade = Math.abs(trade.shares_to_trade);
      fixCount++;
    } else if (trade.action === "HOLD" && trade.shares_to_trade !== 0) {
      trade.shares_to_trade = 0;
      trade.recommended_shares = currentShares;
      fixCount++;
    }

    // Fix estimated_value sign: sells should be positive (proceeds), buys positive (cost)
    // but ensure absolute value is used
    if (trade.estimated_value != null) {
      trade.estimated_value = Math.abs(trade.estimated_value);
    }
  }

  if (fixCount > 0) {
    console.log(`validateTradeConsistency: fixed ${fixCount} inconsistencies`);

    // Recalculate rebalancing_summary from corrected trades
    const totalSells = trades
      .filter((t: any) => t.action === "SELL")
      .reduce((s: number, t: any) => s + Math.abs(t.estimated_value ?? 0), 0);
    const totalBuys = trades
      .filter((t: any) => t.action === "BUY")
      .reduce((s: number, t: any) => s + Math.abs(t.estimated_value ?? 0), 0);

    result.rebalancing_summary = {
      ...result.rebalancing_summary,
      total_sells: `$${Math.round(totalSells).toLocaleString()}`,
      total_buys: `$${Math.round(totalBuys).toLocaleString()}`,
      net_cash_impact: (() => {
        const net = Math.round(totalSells - totalBuys);
        if (net === 0) return "$0";
        return `${net > 0 ? "+" : "-"}$${Math.abs(net).toLocaleString()}`;
      })(),
    };
  }

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Risk-profile-based cash guidance ranges
    const riskCashRanges: Record<string, { min: number; max: number }> = {
      cautious: { min: 10, max: 20 },
      balanced: { min: 10, max: 20 },
      growth: { min: 3, max: 10 },
      aggressive: { min: 1, max: 5 },
    };

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const {
      positions,
      rules,
      insights,
      decisions,
      cash_balance,
      total_portfolio_value,
      intelligence_brief,
      etf_classifications,
      stock_fundamentals,
      risk_profile,
      behavioral_alignment,
      portfolio_strategy,
      book_principles,
      etf_overlap,
      sector_momentum,
    } = await req.json();

    // ── Deterministic Rule Evaluation ─────────────────────────────────
    const ruleEvaluation = computeRuleEvaluation(
      positions, rules, etf_classifications, cash_balance ?? 0, total_portfolio_value ?? 0, risk_profile
    );

    // ── Valuation context (FRED + newsletter mentions) ─────────────
    // Pull the latest observation per series_key from the global table.
    const { data: rawValuationRows, error: valErr } = await supabase
      .from("valuation_context")
      .select("series_key, value, value_text, as_of, source, label, interpretation, metadata")
      .order("as_of", { ascending: false })
      .limit(200);
    if (valErr) {
      console.warn("valuation_context fetch failed (non-fatal):", valErr.message);
    }
    const valuationRowsBySeries: Record<string, any> = {};
    for (const row of rawValuationRows ?? []) {
      if (!valuationRowsBySeries[row.series_key]) {
        valuationRowsBySeries[row.series_key] = row;
      }
    }
    const valuationAnchors = Object.values(valuationRowsBySeries);
    const newsletterValuationMentions = Array.isArray(intelligence_brief?.valuation_mentions)
      ? intelligence_brief.valuation_mentions
      : [];

    // ── Prior thesis streaks (feeds escalation logic) ──────────────
    const heldTickers = (positions ?? []).map((p: any) => p.ticker).filter(Boolean);
    let priorStreaks: any[] = [];
    if (heldTickers.length > 0) {
      const { data: streakRows, error: streakErr } = await supabase
        .from("thesis_check_streaks")
        .select("ticker, current_status, streak_length, last_checked_at, last_evidence, last_recommended_action")
        .eq("user_id", user.id)
        .in("ticker", heldTickers);
      if (streakErr) {
        console.warn("thesis streak fetch failed (non-fatal):", streakErr.message);
      } else {
        priorStreaks = streakRows ?? [];
      }
    }
    console.log("Rule evaluation computed:", JSON.stringify({
      main: ruleEvaluation.main_allocation_issues,
      soft: ruleEvaluation.soft_issues,
      metrics: ruleEvaluation.metrics,
    }));

    // ── System Prompt ────────────────────────────────────────────────
    const systemPrompt = `You are a portfolio compliance officer. Find problems, give specific fixes. Be concise.

Return ONLY a raw JSON object. No markdown, no prose, no code fences.

═══ INPUTS YOU RECEIVE ═══
- RULE_EVALUATION: precomputed rule statuses and percentages. TREAT AS GROUND TRUTH. Do NOT recompute.
- RULES_JSON: the rules themselves with thresholds. Use ONLY these thresholds — never invent limits.
- Intelligence Brief: market signals layer. Use as research input for trade direction.
- SECTOR_MOMENTUM: "hot" = avoid new BUYs. "cold" = review positions. Never overrides HARD rules.
- ETF_OVERLAP_ANALYSIS: use effective_exposure for true geographic exposures.
- Risk profile: interpretation lens and allocation targets. Never overrides HARD rules.

═══ DECISION PRIORITIES ═══
1) HARD rules (binding — must fix with trades, deduct score)
2) Intelligence Brief themes (drives trade direction)
3) SOFT rules (observe only — no score impact, no forced trades)
4) DIAGNOSTIC rules (informational — no score, no trades)

═══ SENTIMENT VS. VALUATION — ANTI-MOMENTUM GUARDRAIL ═══
Newsletter sentiment and sector momentum are lagging signals: writers often turn bullish AFTER a rally and bearish after a drop. Do not treat them as forward-looking on their own.
- When sentiment/momentum is bullish BUT valuation context flags the asset as extended (high CAPE, stretched P/E, tight spreads vs history), treat it as a FADE, not a BUY. Prefer HOLD or TRIM.
- When sentiment is bearish BUT valuation is cheap vs history, that is a contrarian BUY candidate (respecting HARD rules and risk profile).
- Never recommend a BUY solely because a sector/ticker is trending up in newsletters or scored "hot" in SECTOR_MOMENTUM. Every BUY must cite at least one of: (a) a HARD rule breach needing this asset to fix it, (b) a valuation anchor, (c) an independent fundamental or thesis-driven reason from the brief.
- If VALUATION_CONTEXT is absent or silent on an asset, err on the side of HOLD over BUY when the only positive signal is sentiment/momentum.

═══ REBALANCING LOGIC — THE MOST IMPORTANT RULE ═══
When cash > 10%, deploying cash into underweight asset classes AUTOMATICALLY fixes multiple breaches at once.

EXAMPLE: equities=70%, bonds=0%, cash=25%, commodities=5%
→ Deploy $63k cash into bonds → equities=60%, bonds=10%, cash=15%. THREE breaches fixed, ZERO sells needed.

THEREFORE:
- ALWAYS compute post-buy allocations BEFORE proposing any sells.
- NEVER sell equities when cash deployment alone fixes equity overweight.
- NEVER sell core ETFs (VWRA, CSPX, etc.) when cash is available.
- Deploy cash in this order: bonds first, then commodities, then individual stocks.
- Only propose sells AFTER all cash deployment opportunities are exhausted AND breaches remain.

When cash ≤ 0.1%: fully invested. total_buys ≤ total_sells. No "funded by cash" language.

═══ ALLOCATION_CHECK — EXACT MAPPING ═══
Copy these directly from RULE_EVALUATION.metrics:
- equities_percent, bonds_percent, commodities_percent, cash_percent
- stocks_vs_etf_split: "X% stocks / Y% ETFs (within equities only)"
- issues: copy RULE_EVALUATION.main_allocation_issues exactly
- Status mapping: "within_range" → "ok". Hard breach → "warning" (≤5pp) or "critical" (>5pp). Soft breach → "ok".

═══ HEALTH SCORE ═══
Start at 100. For each HARD breach: −20 if >5pp beyond limit, −10 if ≤5pp.
Exception: cash overweight = −5 only (excess cash is defensive, not dangerous).
SOFT/DIAGNOSTIC rules: zero score impact. Floor 10, ceiling 100.

═══ TRADE RECOMMENDATIONS ═══
Include EVERY position (existing + new). For each:
- BUY/SELL: reasoning ≤ 30 words. Reference the specific rule breach or brief signal.
- HOLD: reasoning ≤ 15 words. Just the key fact.
- current_weight: the ticker's CURRENT weight BEFORE any trades.
- target_weight: the ticker's weight AFTER ALL proposed trades execute (recalculate based on new total portfolio value).
  For BUYs: target_weight = (current_value + buy_value) / new_total_portfolio_value * 100.
  For HOLDs: target_weight = current_weight (unchanged if no trades affect it), or recalculate if total portfolio value changes due to other trades.
- Execution: Step 1 = cash-funded BUYs, Step 2 = SELLs, Step 3 = buys from proceeds (T+2).
- order_type: "limit" if value > $10k, else "market".
- Totals must be consistent: net_cash_impact = total_sells − total_buys.

NEW BUY TICKER RULES:
- The user is a UAE tax resident. For any NEW position (not already held), prefer Ireland-domiciled UCITS ETFs (15% US dividend treaty rate vs 30%).
- Use AGGU not AGG, IGLA not IAGG, EIMI not EEM, VWRA not VT, CSPX not SPY, etc.
- Only recommend real, exchange-listed tickers. Never use placeholder names.

SELL only for: HARD breaches, brief signals, valuation evidence, invalidation triggers.
Never sell same asset class to buy same asset class (circular trade).
High conviction positions (8-10): don't sell unless HARD breach or invalidation met.
If commodity breach exists: MUST recommend BUY/INCREASE for commodity position.

═══ RECOMMENDED ACTIONS ═══
MAX 3 items. These are the human-readable action items the user should execute.
Each action ≤ 20 words. Reasoning ≤ 25 words.
trades_involved: list ONLY the tickers that this action trades (BUY or SELL). NEVER include HOLD tickers.
These MUST be consistent with trade_recommendations — same trades, same direction.

═══ JSON OUTPUT SCHEMA ═══
{
  "allocation_check": {
    "equities_percent": number,
    "equities_status": "ok" | "warning" | "critical",
    "bonds_percent": number,
    "bonds_status": "ok" | "warning" | "critical",
    "commodities_percent": number,
    "commodities_status": "ok" | "warning" | "critical",
    "cash_percent": number,
    "stocks_vs_etf_split": string,
    "issues": [string]
  },
  "recommended_actions": [{
    "priority": number,
    "action": string,
    "reasoning": string,
    "confidence": "high" | "medium" | "low",
    "trades_involved": [string]
  }],
  "trade_recommendations": [{
    "ticker": string,
    "action": "SELL" | "HOLD" | "BUY",
    "current_shares": number,
    "recommended_shares": number,
    "shares_to_trade": number,
    "estimated_value": number,
    "current_weight": number,
    "target_weight": number,
    "reasoning": string,
    "urgency": "low" | "medium" | "high",
    "rationale_aligned": boolean,
    "execution_step": number | null,
    "order_type": "market" | "limit",
    "execution_note": string
  }],
  "rebalancing_summary": {
    "total_sells": string,
    "total_buys": string,
    "net_cash_impact": string,
    "primary_goal": string,
    "execution_sequence_summary": string
  },
  "health_score_breakdown": [
    { "rule": string, "current": number, "target": string, "status": "breach" | "ok", "points_deducted": number }
  ],
  "portfolio_health_score": number,
  "summary": string
}

═══ SUMMARY ═══
HARD LIMIT: EXACTLY 3 sentences. MAXIMUM 60 words. If you exceed 60 words, delete words until you are under.
1) Deploy $X into [TICKER] to fix [breach]. One sentence, ≤ 25 words.
2) Brief insight affecting portfolio. One sentence, ≤ 20 words.
3) What's working. One sentence, ≤ 15 words.
No labels, no preamble. Start directly with the action. MUST NOT contradict allocation_check.

BANNED: Do not use the prose word "thesis" in summary or recommended_actions text. Thesis health is evaluated in a separate pass.`;

    // ── User Prompt ──────────────────────────────────────────────────
    const bubbleInsights = (insights ?? []).filter((i: any) => i.insight_type === "bubble_signal");
    const macroInsights = (insights ?? []).filter((i: any) =>
      ["macro", "macro_view", "market_view"].includes(i.insight_type)
    );
    const portfolioInsights = (insights ?? []).filter((i: any) =>
      i.tickers_mentioned?.some((t: string) =>
        (positions ?? []).map((p: any) => p.ticker).includes(t)
      )
    );

    const userPrompt = `CURRENT PORTFOLIO:
${JSON.stringify((positions ?? []).map((p: any) => ({
  ...p,
  thesis_notes: p.thesis_notes || null,
  confidence_level: p.confidence_level || null,
  bet_type: p.bet_type || null,
  invalidation_trigger: p.invalidation_trigger || null,
})), null, 2)}

CASH BALANCE: $${(cash_balance ?? 0).toFixed(2)}
TOTAL PORTFOLIO VALUE (including cash): $${(total_portfolio_value ?? 0).toFixed(2)}
CASH AS % OF PORTFOLIO: ${total_portfolio_value ? ((cash_balance / total_portfolio_value) * 100).toFixed(1) : 0}%

RULES_JSON:
${JSON.stringify(rules, null, 2)}

ETF CLASSIFICATIONS (use category field to determine asset class — do not guess from ticker):
${JSON.stringify(etf_classifications, null, 2)}

NEWSLETTER INTELLIGENCE (${insights?.length ?? 0} insights):

BUBBLE & RISK SIGNALS (${bubbleInsights.length}):
${bubbleInsights.map((i: any) => `- [${i.source_name ?? "Newsletter"}] ${i.content} (sentiment: ${i.sentiment})`).join("\n") || "None detected"}

MACRO VIEWS (${macroInsights.length}):
${macroInsights.map((i: any) => `- [${i.source_name ?? "Newsletter"}] ${i.content}`).join("\n") || "None"}

PORTFOLIO MENTIONED IN NEWSLETTERS (${portfolioInsights.length}):
${portfolioInsights.map((i: any) => `- [${i.source_name ?? "Newsletter"}] Tickers: ${i.tickers_mentioned?.join(", ")} — ${i.content} (sentiment: ${i.sentiment})`).join("\n") || "None"}

RECENT DECISION LOG:
${JSON.stringify(decisions, null, 2)}

${etf_overlap ? `ETF_OVERLAP_ANALYSIS:
${JSON.stringify(etf_overlap, null, 2)}

` : "No ETF overlap data available."}

${sector_momentum?.length > 0 ? `SECTOR_MOMENTUM (from newsletter insights, last ~30 days):
${sector_momentum.map((s: any) => `- ${s.sector}: signal=${s.signal}, net_ratio=${s.net_ratio} (${s.bullish}↑ ${s.bearish}↓ ${s.neutral}→ from ${s.total} signals)`).join("\n")}
` : "No sector momentum data available."}

${intelligence_brief ? `INTELLIGENCE BRIEF (${intelligence_brief.newsletters_analyzed ?? 0} newsletters, ${intelligence_brief.insights_analyzed ?? 0} insights, generated_at: ${intelligence_brief.generated_at ?? "unknown"}, age_hours: ${intelligence_brief.generated_at ? Math.round((Date.now() - new Date(intelligence_brief.generated_at).getTime()) / (1000 * 60 * 60)) : "unknown"}):
Weekly Priority: ${intelligence_brief.weekly_priority || "N/A"}

Temporal Shifts (view changes since last brief):
${(intelligence_brief.temporal_shifts || []).map((ts: any) => `- ${ts.topic || ""}: ${ts.significance || ""} ${ts.weeks_tracked ? `(week ${ts.weeks_tracked})` : ""}`).join("\n") || "None"}

Sector Tilts:
${(intelligence_brief.sector_tilts || []).map((st: any) => `- ${st.sector} (${st.direction}, ${st.conviction} conviction): ${st.reasoning} [${st.signal_type || ""}${st.vs_prior_brief ? `, vs prior: ${st.vs_prior_brief}` : ""}]`).join("\n") || "None"}

Country Tilts:
${(intelligence_brief.country_tilts || []).map((ct: any) => `- ${ct.region} (${ct.direction}, ${ct.conviction} conviction): ${ct.reasoning} [${ct.signal_type || ""}${ct.vs_prior_brief ? `, vs prior: ${ct.vs_prior_brief}` : ""}]`).join("\n") || "None"}

Contrarian Opportunities:
${(intelligence_brief.contrarian_opportunities || []).map((co: any) => `- ${co.title}: ${co.macro_tailwind} — ${co.why_not_crowded} (${co.ticker || "no ticker"}, ${co.conviction} conviction)`).join("\n") || "None"}

Crowded Trades (consensus / lower edge):
${(intelligence_brief.crowded_trades || []).map((ct: string) => `- ${ct}`).join("\n") || "None"}

Stocks to Research:
${(intelligence_brief.stocks_to_research || []).map((s: any) => `- ${s.ticker} (${s.name}): ${s.setup} — ${s.thesis} [${s.consensus_or_edge}, ${s.risk_level} risk]`).join("\n") || "None"}

USE THIS BRIEF to drive trade recommendations. Reference specific themes, tilts, and signals.` : "No Intelligence Brief available — rely on raw insights above."}

${stock_fundamentals?.length > 0 ? `STOCK FUNDAMENTALS:
${stock_fundamentals.map((f: any) => `${f.ticker}: ROIC=${f.roic ?? "N/A"}%, Earnings Yield=${f.earnings_yield ?? "N/A"}%, P/E=${f.pe_ratio ?? "N/A"}, D/E=${f.debt_to_equity ?? "N/A"}, Revenue Growth=${f.revenue_growth_yoy ?? "N/A"}%, FCF Yield=${f.free_cash_flow_yield ?? "N/A"}%, Gross Margin=${f.gross_margin ?? "N/A"}%${f.notes ? ` (${f.notes})` : ""}`).join("\n")}` : "No stock fundamentals available."}

VALUATION_CONTEXT (macro/valuation anchors — use as anti-momentum guardrail per system prompt):
${valuationAnchors.length > 0
  ? "FRED_ANCHORS:\n" + valuationAnchors.map((v: any) => `- [${v.series_key}] ${v.label ?? ""}: ${v.value ?? v.value_text ?? "n/a"} (as_of ${v.as_of}). ${v.interpretation ?? ""}${v.metadata?.level ? ` Level=${v.metadata.level}.` : ""}`).join("\n")
  : "FRED_ANCHORS: none available — valuation guardrail should default to caution on momentum-only BUYs."}

${newsletterValuationMentions.length > 0
  ? `NEWSLETTER_VALUATION_MENTIONS:\n${newsletterValuationMentions.map((m: any) => `- ${m.asset ?? "?"}: ${m.metric ?? ""} ${m.value ?? ""} (vs_history=${m.vs_history ?? "unknown"}). ${m.source_snippet ?? ""}`).join("\n")}`
  : "NEWSLETTER_VALUATION_MENTIONS: none extracted from current brief."}

INTERPRETATION GUIDE:
- FRED level="extended" means the asset class implied by that series is priced richly vs 10y history → do NOT recommend new BUYs in that asset class on sentiment alone.
- FRED level="cheap" means contrarian BUY candidate (respecting HARD rules, risk profile, and strategy brief).
- Newsletter valuation mentions with vs_history="high" → treat the named asset as extended; with vs_history="low" → cheap; with "unknown" → ignore.
- If both sources are silent on an asset, apply the default from the system prompt's SENTIMENT VS. VALUATION block (err toward HOLD).

RULE EVALUATION (precomputed — use as ground truth for ALL rule statuses and percentages):
${JSON.stringify(ruleEvaluation, null, 2)}

PRIOR_THESIS_STREAKS (from previous analysis runs — use for escalation):
${priorStreaks.length > 0
  ? priorStreaks.map((s: any) => `- ${s.ticker}: ${s.current_status} x ${s.streak_length} run(s), last ${s.last_checked_at}, action=${s.last_recommended_action ?? "n/a"}, evidence="${(s.last_evidence ?? "").substring(0, 120)}"`).join("\n")
  : "No prior thesis check history — this is the first run or a cold start."}

${risk_profile ? `RISK PROFILE:
- Profile: ${(risk_profile.profile ?? 'balanced')}
- Score: ${risk_profile.score ?? "N/A"}
- Dimension Scores: ${JSON.stringify(risk_profile.dimension_scores ?? {})}
- ALLOCATION TARGETS (as % of total portfolio including cash):
${(() => {
  const targets: Record<string, { broad: number; theme: number; stocks: number; cashRange: string }> = {
    cautious: { broad: 80, theme: 10, stocks: 5, cashRange: "10-20%" },
    balanced: { broad: 70, theme: 20, stocks: 10, cashRange: "10-20%" },
    growth: { broad: 60, theme: 25, stocks: 15, cashRange: "3-10%" },
    aggressive: { broad: 50, theme: 30, stocks: 20, cashRange: "1-5%" },
  };
  const t = targets[(risk_profile.profile ?? 'balanced').toLowerCase()] ?? targets.balanced;
  return `  Broad Market ETFs: ${t.broad}%, Industry/Theme ETFs: ${t.theme}%, Individual Stocks: ${t.stocks}%, Cash: ${t.cashRange}`;
})()}
- IMPORTANT: Evaluate portfolio against these targets first. All percentages are of TOTAL portfolio value including cash.` : "No risk profile set — use default balanced targets."}

${behavioral_alignment ? `BEHAVIORAL ALIGNMENT:
- Aligned ratio: ${behavioral_alignment.aligned_ratio} (${behavioral_alignment.aligned_count}/${behavioral_alignment.total_signals} recent trades matched stated profile)` : "No behavioral signals available."}

${portfolio_strategy ? `PORTFOLIO STRATEGY BRIEF (living document — all recommendations must align):
- Mandate: ${portfolio_strategy.mandate || "Not set"}
- Philosophy: ${portfolio_strategy.philosophy || "Not set"}
- Target Description: ${portfolio_strategy.target_description || "Not set"}
- Strategic Priorities: ${(portfolio_strategy.priorities || []).map((p: string) => `\n  • ${p}`).join("") || "None"}
- Positions to Build: ${(portfolio_strategy.positions_to_build || []).map((p: any) => `\n  • ${p.ticker}: ${p.rationale}`).join("") || "None"}
- Positions to Exit: ${(portfolio_strategy.positions_to_exit || []).map((p: any) => `\n  • ${p.ticker}: ${p.rationale}`).join("") || "None"}
- Constraints: ${portfolio_strategy.constraints || "None"}

STRATEGY ALIGNMENT RULES:
- All recommendations MUST be directionally consistent with this strategy.
- When recommending buys, PRIORITIZE positions_to_build tickers.
- When recommending sells, PRIORITIZE positions_to_exit tickers.
- Flag any recommendation that conflicts with the stated strategy.
- Never recommend buying a ticker listed in positions_to_exit.
- Never recommend selling a ticker listed in positions_to_build (unless a HARD rule breach).` : "No portfolio strategy brief set."}

${(() => {
  const bp = book_principles ?? [];
  if (bp.length === 0) return "No book-sourced investment principles available.";
  // Group by category for structured injection
  const byCategory: Record<string, any[]> = {};
  for (const p of bp) {
    const cat = p.category || "general";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  }
  const sections = Object.entries(byCategory).map(([cat, principles]) => {
    const items = principles.map((p: any) =>
      `  - [${p.author}] WHEN: ${p.condition} → ${p.principle} ACTION: ${p.action_implication}`
    ).join("\n");
    return `${cat.toUpperCase()}:\n${items}`;
  }).join("\n\n");
  return `INVESTMENT WISDOM (${bp.length} principles from investment classics — use these to enrich your analysis):

${sections}

WISDOM APPLICATION RULES:
- When your analysis detects a condition matching a principle, CITE the principle by author in your reasoning.
- Use principles to strengthen or challenge your recommendations — they represent battle-tested wisdom.
- If a principle contradicts your recommendation, acknowledge the tension and explain your reasoning.
- Do NOT list all principles — only reference those directly relevant to the current portfolio state.`;
})()}

Analyze this portfolio and return the JSON response.`;

    console.log("Calling AI for portfolio analysis + ideal allocation in parallel...");

    // ── Build ideal allocation prompt ─────────────────────────────────
    const budget = total_portfolio_value && total_portfolio_value > 0 ? Math.round(total_portfolio_value) : 100000;
    const budgetFormatted = "$" + budget.toLocaleString("en-US");
    const idealBriefSection = intelligence_brief
      ? `INTELLIGENCE BRIEF (use to inform tactical tilts):
Weekly Priority: ${intelligence_brief.weekly_priority || "N/A"}
Sector Tilts:
${(intelligence_brief.sector_tilts || []).map((st: any) => "- " + st.sector + " (" + st.direction + ", " + st.conviction + " conviction): " + st.reasoning).join("\n") || "None"}
Country Tilts:
${(intelligence_brief.country_tilts || []).map((ct: any) => "- " + ct.region + " (" + ct.direction + ", " + ct.conviction + " conviction): " + ct.reasoning).join("\n") || "None"}
Crowded Trades (beware):
${(intelligence_brief.crowded_trades || []).map((ct: string) => "- " + ct).join("\n") || "None"}
Use these signals to tilt sector/region weights.`
      : "No intelligence brief available — use strategic allocation only.";

    const idealSystemPrompt = `You are an expert portfolio construction advisor for non-US residents.

RESPONSE FORMAT: Return ONLY a raw JSON object. No markdown, no prose, no code blocks.

CONTEXT:
- UAE tax resident (0% income/capital gains tax)
- Prefer Ireland-domiciled UCITS ETFs (15% US dividend treaty rate vs 30%)
- Budget: ${budgetFormatted}
- MODE: CLEAN SLATE — Build an ideal portfolio from scratch, ignoring any existing holdings.

RULES ENGINE:
You are given a RULES_JSON array. Each rule has: scope, category, metric, operator, threshold_min, threshold_max, rule_enforcement, message_on_breach.
Use these as the SOLE source of allocation constraints. Respect every min/max threshold strictly.
If no rule exists for a given metric, use conservative defaults and note them in strategy_summary.

RULES_JSON:
${JSON.stringify(rules, null, 2)}

ASSET CLASS RESERVES:
- Individual stocks: ~10% (investor manages separately)
- Commodities (gold, broad): 5-8%
- Cash reserve: 5-10%
- Remaining ~72-80% split between equity and bond ETFs per rules

${idealBriefSection}

REQUIREMENTS:
1. Recommend 6-10 ETFs
2. All MUST be Ireland-domiciled UCITS (LSE, Euronext, or Xetra)
3. Use real tickers (VWRA, IGLA, AGGU, IGLN, EIMI, etc.)
4. Cover equity (global, regional), bonds, commodities
5. Each ETF: 1-2 sentence explanation in plain English
6. Allocations sum to ETF portion (after reserves)
7. Every ETF must have TER ≤ 0.22% — no exceptions
8. Total effective US equity ≤ 40%, tech ≤ 15%
9. Avoid hidden overlap (e.g. VWRA is ~65% US — don't stack US ETFs on top)
10. Bonds 10–40% with duration diversification (short + intermediate)
11. One gold ETF preferred over splitting physical + miners

JSON OUTPUT:
{
  "etfs": [{
    "ticker": "VWRA",
    "name": "Vanguard FTSE All-World UCITS ETF (Acc)",
    "asset_class": "Equity",
    "sub_category": "Global",
    "domicile": "Ireland",
    "exchange": "LSE",
    "amount_usd": 25000,
    "percent": 25.0,
    "expense_ratio": 0.22,
    "explanation": "Core global equity holding."
  }],
  "strategy_summary": "2-3 sentences on overall strategy in plain English.",
  "tax_note": "1-2 sentences on tax efficiency for UAE resident."
}`;

    // ── Dedicated thesis-health prompt (runs in parallel) ─────────────
    // Smaller, focused call — isolates failure and keeps the main analysis fast.
    const heldForThesis = (positions ?? []).map((p: any) => {
      const mv = p.market_value ?? 0;
      const weight = total_portfolio_value && total_portfolio_value > 0
        ? (mv / total_portfolio_value) * 100
        : 0;
      return {
        ticker: p.ticker,
        name: p.name,
        weight_percent: parseFloat(weight.toFixed(2)),
        thesis_notes: p.thesis_notes || null,
        invalidation_trigger: p.invalidation_trigger || null,
        confidence_level: p.confidence_level || null,
      };
    });
    const relevantInsightsForThesis = (insights ?? []).filter((i: any) =>
      i.tickers_mentioned?.some((t: string) =>
        heldForThesis.some((p: any) => p.ticker === t)
      )
    );

    const thesisSystemPrompt = `You are a thesis-health evaluator. You classify each position's investment thesis as invalidated, reinforced, stale, or silent based on newsletter insights and prior-run streaks.

RESPONSE FORMAT: Return ONLY a raw JSON object. No markdown, no prose, no code fences.

SCOPE — emit one entry per position meeting ANY of:
  • Has non-empty thesis_notes — evaluate against recent insights + brief.
  • Has weight_percent ≥ 2% but no thesis_notes — emit status="silent".
Skip positions with weight < 2% AND no thesis.

CLASSIFICATION:
  • "invalidated" — insights contradict thesis OR invalidation_trigger hit. recommended_action: SELL or TRIM.
  • "reinforced"  — insights align with thesis, or brief reinforces it. recommended_action: HOLD or ADD.
  • "stale"       — thesis exists but no recent relevant insight coverage. recommended_action: REVIEW.
  • "silent"      — meaningful position with no written thesis. recommended_action: REVIEW.

CONFIDENCE:
  • "high"   — multiple corroborating insights or explicit invalidation trigger hit.
  • "medium" — single strong signal.
  • "low"    — inferred from absence or weak signal.

EVIDENCE:
  • ≤ 30 words citing specific numbers/insights (e.g. "Direct -7%, margins -130bps per Q3 release").
  • supporting_insight_ids: FK IDs from the insights you cite, if available.

ESCALATION (use PRIOR_THESIS_STREAKS):
  • Ticker "invalidated" for ≥2 consecutive prior runs → recommended_action = SELL (not TRIM/REVIEW).
  • Ticker "reinforced" for ≥3 runs AND underweight vs target → recommended_action may be ADD, BUT ONLY IF valuation context does not flag the asset as extended (high CAPE, stretched P/E, tight spreads vs history). If VALUATION_CONTEXT shows the asset is expensive vs its own history or vs peers, downgrade ADD to HOLD — a reinforced thesis that has already played out in price is not a buy signal. If VALUATION_CONTEXT is absent or silent on this asset, default to HOLD (do not escalate to ADD on sentiment streaks alone).
  • Long streaks warrant "high" confidence unless evidence has weakened.

OUTPUT JSON:
{
  "thesis_checks": [
    {
      "ticker": string,
      "status": "invalidated" | "reinforced" | "stale" | "silent",
      "confidence": "high" | "medium" | "low",
      "evidence": string,
      "supporting_insight_ids": [string],
      "recommended_action": "SELL" | "TRIM" | "REVIEW" | "HOLD" | "ADD"
    }
  ]
}`;

    const thesisUserPrompt = `POSITIONS:
${JSON.stringify(heldForThesis, null, 2)}

RELEVANT NEWSLETTER INSIGHTS (${relevantInsightsForThesis.length}):
${relevantInsightsForThesis.map((i: any) => `- id=${i.id} [${i.source_name ?? "Newsletter"}] tickers=${(i.tickers_mentioned ?? []).join(",")} sentiment=${i.sentiment} — ${i.content}`).join("\n") || "None"}

${intelligence_brief ? `INTELLIGENCE BRIEF (summary):
Weekly Priority: ${intelligence_brief.weekly_priority || "N/A"}
Sector Tilts: ${(intelligence_brief.sector_tilts || []).map((st: any) => `${st.sector}:${st.direction}/${st.conviction}`).join(", ") || "None"}
Country Tilts: ${(intelligence_brief.country_tilts || []).map((ct: any) => `${ct.region}:${ct.direction}/${ct.conviction}`).join(", ") || "None"}` : "No brief available."}

PRIOR_THESIS_STREAKS:
${priorStreaks.length > 0
  ? priorStreaks.map((s: any) => `- ${s.ticker}: ${s.current_status} x ${s.streak_length} run(s), action=${s.last_recommended_action ?? "n/a"}`).join("\n")
  : "No prior history — cold start."}

VALUATION_CONTEXT (use to guard the reinforced→ADD escalation per system prompt):
${valuationAnchors.length > 0
  ? valuationAnchors.map((v: any) => `- ${v.series_key}: ${v.value ?? v.value_text ?? "n/a"} level=${v.metadata?.level ?? "neutral"} (${v.interpretation ?? ""})`).join("\n")
  : "No FRED anchors available."}
${newsletterValuationMentions.length > 0
  ? "\n" + newsletterValuationMentions.map((m: any) => `- ${m.asset}: ${m.metric} ${m.value} vs_history=${m.vs_history}`).join("\n")
  : ""}

Return ONLY the JSON object with thesis_checks.`;

    // ── Run three AI calls in parallel ─────────────────────────────────
    const [response, idealResponse, thesisResponse] = await Promise.all([
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
          max_tokens: 16000,
        }),
      }),
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          system: idealSystemPrompt,
          messages: [{ role: "user", content: `Generate the ideal ${budgetFormatted} portfolio using Ireland-domiciled UCITS ETFs. Return only the JSON object.` }],
          max_tokens: 4000,
        }),
      }),
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          system: thesisSystemPrompt,
          messages: [{ role: "user", content: thesisUserPrompt }],
          max_tokens: 4000,
        }),
      }),
    ]);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "AI analysis failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text;
    const finishReason = aiResponse.stop_reason;

    if (!content) {
      console.error("Empty AI response:", JSON.stringify(aiResponse));
      return new Response(
        JSON.stringify({ error: "AI returned empty response. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (finishReason === "max_tokens") {
      console.error("AI response truncated (hit max_tokens)");
      return new Response(
        JSON.stringify({ error: "Analysis response was truncated. Re-run with fewer insights or a shorter brief." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("AI Response received:", content.substring(0, 200));

    // ── Parse JSON ───────────────────────────────────────────────────
    let analysisResult;
    try {
      let jsonString = content.trim();

      // Strip markdown code fences
      jsonString = jsonString.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();

      // Extract first { to last }
      const firstBrace = jsonString.indexOf("{");
      const lastBrace = jsonString.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        jsonString = jsonString.substring(firstBrace, lastBrace + 1);
      } else {
        throw new Error("No JSON object found in response");
      }

      // Fix common trailing-comma issues
      jsonString = jsonString.replace(/,\s*([}\]])/g, '$1');

      analysisResult = JSON.parse(jsonString);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Raw content (first 500):", content.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Failed to parse AI analysis response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Validate trade recommendation consistency ───────────────────
    analysisResult = validateTradeConsistency(analysisResult, positions ?? []);

    // ── Enforce cash constraint server-side ───────────────────────────
    analysisResult = enforceCashConstraint(analysisResult, cash_balance ?? 0, total_portfolio_value ?? 0);

    // ── Deterministic health score (don't trust Claude for arithmetic) ──
    // The breakdown is computed server-side in computeRuleEvaluation. Overwrite
    // Claude's breakdown and score so the number is always 100 − Σ deductions.
    const serverBreakdown = ruleEvaluation?.health_score_breakdown ?? [];
    const totalDeducted = serverBreakdown.reduce(
      (sum: number, item: any) => sum + (item.points_deducted ?? 0),
      0
    );
    const computedScore = Math.min(100, Math.max(10, 100 - totalDeducted));
    analysisResult.health_score_breakdown = serverBreakdown;
    analysisResult.portfolio_health_score = computedScore;

    // ── Parse ideal allocation (best-effort, don't fail the whole response) ──
    let idealAllocation = null;
    try {
      if (idealResponse.ok) {
        const idealData = await idealResponse.json();
        const idealContent = idealData.content?.[0]?.text?.trim() || "";
        if (idealContent && idealData.stop_reason !== "max_tokens") {
          let idealJson = idealContent;
          idealJson = idealJson.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
          const firstBrace = idealJson.indexOf("{");
          const lastBrace = idealJson.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            idealJson = idealJson.substring(firstBrace, lastBrace + 1);
          }
          idealJson = idealJson.replace(/,\s*([}\]])/g, '$1');
          idealAllocation = JSON.parse(idealJson);
        }
      }
    } catch (idealErr) {
      console.warn("Ideal allocation parsing failed (non-fatal):", idealErr);
    }

    // Attach ideal allocation to the main response
    analysisResult.ideal_allocation = idealAllocation;

    // ── Parse thesis checks (best-effort, don't fail the whole response) ──
    let thesisChecks: any[] = [];
    try {
      if (thesisResponse.ok) {
        const thesisData = await thesisResponse.json();
        const thesisContent = thesisData.content?.[0]?.text?.trim() || "";
        if (thesisContent && thesisData.stop_reason !== "max_tokens") {
          let thesisJson = thesisContent;
          thesisJson = thesisJson.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
          const firstBrace = thesisJson.indexOf("{");
          const lastBrace = thesisJson.lastIndexOf("}");
          if (firstBrace !== -1 && lastBrace > firstBrace) {
            thesisJson = thesisJson.substring(firstBrace, lastBrace + 1);
          }
          thesisJson = thesisJson.replace(/,\s*([}\]])/g, '$1');
          const parsed = JSON.parse(thesisJson);
          if (Array.isArray(parsed.thesis_checks)) {
            thesisChecks = parsed.thesis_checks;
          }
        }
      } else {
        console.warn("Thesis fetch not ok:", thesisResponse.status);
      }
    } catch (thesisErr) {
      console.warn("Thesis parsing failed (non-fatal):", thesisErr);
    }
    analysisResult.thesis_checks = thesisChecks;

    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("analyze-portfolio error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
