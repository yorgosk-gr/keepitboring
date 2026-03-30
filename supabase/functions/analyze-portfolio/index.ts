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

interface RuleEvaluation {
  entries: RuleEvaluationEntry[];
  main_allocation_issues: string[];
  soft_issues: string[];
  metrics: RuleEvaluationMetrics;
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
      const normalised = raw.replace(/ies$/, "y").replace(/s$/, "");
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
    const cat = rawCat.replace(/ies$/, "y").replace(/s$/, "");

    if (posType === "stock") {
      equityValue += mv;
    } else if (cat === "bond") {
      bondValue += mv;
    } else if (cat === "commodity" || cat === "gold") {
      commodityGoldValue += mv;
      if (cat === "gold" || (p.name || "").toLowerCase().includes("gold")) {
        goldValue += mv;
      }
    } else {
      // Default: unclassified ETFs and equity ETFs both count as equity
      equityValue += mv;
    }
  }

  const stocksValue = safePositions
    .filter((p: any) => (p.position_type || "").toLowerCase() === "stock")
    .reduce((s: number, p: any) => s + (p.market_value ?? 0), 0);

  const equityPercent = (equityValue / totalVal) * 100;
  const bondPercent = (bondValue / totalVal) * 100;
  const commodityGoldPercent = (commodityGoldValue / totalVal) * 100;
  const cashPercent = (cashBalance / totalVal) * 100;
  const goldPercent = (goldValue / totalVal) * 100;
  const stocksPercent = (stocksValue / totalVal) * 100;
  const etfsPercent = equityPercent - stocksPercent;

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
  };
}

// ── Server-side cash constraint enforcement ───────────────────────
function enforceCashConstraint(analysisResult: any, cashBalance: number): any {
  if (cashBalance > 500) return analysisResult; // meaningful cash, skip
  const trades = analysisResult.trade_recommendations ?? [];
  const totalSells = trades
    .filter((t: any) => t.shares_to_trade < 0)
    .reduce((s: number, t: any) => s + Math.abs(t.estimated_value ?? 0), 0);
  const totalBuys = trades
    .filter((t: any) => t.action === "BUY" && t.shares_to_trade > 0)
    .reduce((s: number, t: any) => s + (t.estimated_value ?? 0), 0);
  if (totalBuys <= totalSells) return analysisResult; // already balanced
  const scaleFactor = totalSells > 0 ? totalSells / totalBuys : 0;
  for (const trade of trades) {
    if (trade.action === "BUY" && trade.shares_to_trade > 0) {
      trade.shares_to_trade = Math.floor(trade.shares_to_trade * scaleFactor);
      trade.recommended_shares = (trade.current_shares ?? 0) + trade.shares_to_trade;
      trade.estimated_value = Math.round((trade.estimated_value ?? 0) * scaleFactor);
      trade.target_weight = parseFloat(((trade.target_weight ?? 0) * scaleFactor).toFixed(2));
    }
  }
  const newBuys = trades
    .filter((t: any) => t.action === "BUY")
    .reduce((s: number, t: any) => s + (t.estimated_value ?? 0), 0);
  analysisResult.rebalancing_summary = {
    ...analysisResult.rebalancing_summary,
    total_buys: `$${Math.round(newBuys).toLocaleString()}`,
    net_cash_impact: `+$${Math.round(totalSells - newBuys).toLocaleString()}`,
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

    // Determine what the action SHOULD be based on numeric fields
    let correctAction: string;
    if (Math.abs(tw - cw) < 0.3 && shareDelta === 0) {
      correctAction = "HOLD";
    } else if (tw < cw || shareDelta < 0) {
      correctAction = "SELL";
    } else if (tw > cw || shareDelta > 0) {
      correctAction = "BUY";
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
      net_cash_impact: `${totalSells >= totalBuys ? "+" : "-"}$${Math.round(Math.abs(totalSells - totalBuys)).toLocaleString()}`,
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
      portfolio_mode,
      risk_profile,
      behavioral_alignment,
      portfolio_strategy,
      north_star,
    } = await req.json();

    // ── Deterministic Rule Evaluation ─────────────────────────────────
    const ruleEvaluation = computeRuleEvaluation(
      positions, rules, etf_classifications, cash_balance ?? 0, total_portfolio_value ?? 0, risk_profile
    );
    console.log("Rule evaluation computed:", JSON.stringify({
      main: ruleEvaluation.main_allocation_issues,
      soft: ruleEvaluation.soft_issues,
      metrics: ruleEvaluation.metrics,
    }));

    // ── System Prompt ────────────────────────────────────────────────
    const systemPrompt = `You are a strict portfolio compliance officer. Your job is to find problems and give specific, numerically consistent fixes.

RESPONSE FORMAT
- Return ONLY a raw JSON object.
- No markdown, no prose around it, no code fences.
- Do NOT include any text before or after the JSON.

ROLE & PRIORITY
1) Intelligence Brief themes (primary macro/research layer — drives direction)
2) HARD rules (binding limits — enforced strictly)
3) SOFT rules (guidelines — note them but no score impact)
4) DIAGNOSTIC rules (informational only — no score, no trades)

PORTFOLIO PHILOSOPHY MODE
The user provides a string "portfolio_mode" (e.g. "capital_preservation", "balanced", "aggressive").
Use it ONLY as an interpretation lens:
- "capital_preservation": prefer more bonds (up to 45%), gold 3–10%, conservative.
- "balanced": neutral stance, use rules as-is.
- "aggressive": tolerate higher equity, bonds closer to the lower bound.
It NEVER overrides explicit numeric min/max in rules or rule_evaluation.

RISK PROFILE (behavioral risk tolerance)
The user may provide "risk_profile" with { profile, score, dimension_scores } and "behavioral_alignment" with { aligned_ratio, total_signals, aligned_count }.

RISK PROFILE ALLOCATION TARGETS:
When a risk profile is active, the user has specific allocation targets as a percentage of TOTAL PORTFOLIO VALUE (including cash):
- Cautious: Broad Market ETFs 80%, Industry/Theme ETFs 10%, Individual Stocks 5%, Cash 10-20%
- Balanced: Broad Market ETFs 70%, Industry/Theme ETFs 20%, Individual Stocks 10%, Cash 10-20%
- Growth: Broad Market ETFs 60%, Industry/Theme ETFs 25%, Individual Stocks 15%, Cash 3-10%
- Aggressive: Broad Market ETFs 50%, Industry/Theme ETFs 30%, Individual Stocks 20%, Cash 1-5%

CRITICAL: ALL allocation percentages are calculated as a share of TOTAL PORTFOLIO VALUE including cash. Individual stocks at 10% means 10% of the entire portfolio, NOT 10% of equities. Evaluate the portfolio against these profile-based targets FIRST, then apply philosophy rules as secondary constraints.

Risk profile calibrates POSITION-LEVEL sizing and CASH BUFFER recommendations:
- "cautious": max individual stock position 3-5% of portfolio. Flag any single position above 10% as high risk. Suggest higher cash buffer (10-20%). Favor broad market ETFs over concentrated bets.
- "balanced": standard recommendations. Flag positions above 15%. Moderate rebalancing. Cash buffer 5-15%.
- "growth": accept higher concentration. Flag positions above 20%. Encourage deploying excess cash into targets. Cash buffer 3-10%.
- "aggressive": accept concentrated positions. Focus on maximizing return vs targets. Minimal cash buffer nudges (1-5%). Higher position sizes acceptable.

PORTFOLIO MODE + RISK PROFILE INTERACTION:
- When they ALIGN (e.g. Aggressive mode + Aggressive profile): full conviction recommendations, lean into the style.
- When they CONFLICT (e.g. Aggressive mode + Cautious profile): temper recommendations toward the more conservative of the two. Add a note in the summary highlighting the mismatch.
- Risk profile NEVER overrides HARD rules. It adjusts the tone and sizing of SOFT recommendations only.

BEHAVIORAL ALIGNMENT:
If behavioral_alignment is provided and aligned_ratio < 0.5:
- Add an observation in recommended_actions: "Note: your recent trading behavior suggests a more [cautious/aggressive] approach than your stated [profile] profile. Recommendations are based on your stated profile, but consider recalibrating via the Risk Profile questionnaire."
- Determine direction: if the user's trades show more selling/hedging than expected for their profile, say "cautious". If more buying/concentrating, say "aggressive".

RULES ENGINE
You are given RULES_JSON (array of rules). Each rule has:
- scope: "portfolio" | "cluster" | "position"
- category: "allocation" | "size" | "quality" | "market" | "behavior"
- metric: string key (e.g. "stocks_percent", "bonds_percent")
- operator: ">=" | "<=" | ">" | "<" | "between" | "outside"
- threshold_min, threshold_max: numeric boundaries (null = no bound)
- rule_enforcement: "hard" | "soft" | "diagnostic"
- message_on_breach: text for breach
- scoring_weight: may be used for score, but you MUST follow the scoring rules below.

ALLOCATION LIMITS — RULES FIRST, NO INVENTION
- For each metric (stocks_percent, bonds_percent, etc.) you MUST use the thresholds from RULES_JSON when they exist.
- If a metric has NO rules at all, you may treat it as "unconstrained" (report it, but do not call it a violation).
- You MUST NOT invent targets like "ETF minimum 75%" unless there is an explicit rule for that metric in RULES_JSON.
- If rules change (e.g., bonds max from 30% to 40%), you must follow the new thresholds immediately — no cached assumptions.

ETF CLASSIFICATION — ASSET CLASS, NOT SEPARATE BUCKET
- CRITICAL: ETF positions must be counted as their asset class (equity/bond/commodity), NOT as a separate category. An equity ETF counts toward equities_percent. A bond ETF counts toward bonds_percent. Never count ETFs as a separate bucket.

TICKER VALIDITY
- NEVER recommend a ticker you do not see in the positions list. If recommending a new BUY, use only real, exchange-listed ETF tickers (e.g. VWRA, AGGU, CSPX). Never use placeholder names like CUSTOM_BROAD_MARKET_ETF.

CIRCULAR TRADE RULE
- Never sell one position to buy another in the same asset class and category with no allocation benefit.
- Selling an equity ETF to buy another equity ETF is FORBIDDEN — it changes nothing.
- A trade is only valid if it changes allocation meaningfully (different asset class, geography, or duration) OR addresses a specific position-level alert.

The caller provides RULE_EVALUATION, already computed from positions + rules.

RULE_EVALUATION has:
- entries: array of objects with rule_id, name, category, metric, current, min, max, status, message
  - status ∈ "underweight" | "overweight" | "within_range" | "not_applicable"
- main_allocation_issues: HARD rule breaches only (drives score deductions and trades)
- soft_issues: SOFT rule breaches only (observations, no score impact, no forced trades)
- metrics: canonical percentages including etfs_of_equities_percent and stocks_of_equities_percent

YOU MUST TREAT RULE_EVALUATION AS AUTHORITATIVE:
- DO NOT recompute any percentages from raw positions.
- DO NOT re-interpret min/max or statuses.
- If an entry has status "within_range", you MUST NOT describe that metric as "underweight" or "overweight" anywhere.

RULE ENFORCEMENT LEVELS:
- main_allocation_issues = HARD breaches only → deduct score, must address with trades.
- soft_issues = SOFT breaches only → mention as observations only. Do NOT deduct score points. Do NOT list as the primary problem. Do NOT drive sell recommendations from soft breaches alone.
- If main_allocation_issues is empty, summary sentence 1 MUST say "Biggest allocation or compliance problem: none."
- The ETF Allocation rule is SOFT. A soft ETF breach = note it, suggest gradual increase over time, never sell other positions just to fix it.

ALLOCATION_CHECK FIELDS — EXACT MAPPING
- allocation_check.equities_percent = RULE_EVALUATION.metrics.equities_percent
- allocation_check.bonds_percent    = RULE_EVALUATION.metrics.bonds_percent
- allocation_check.commodities_percent = RULE_EVALUATION.metrics.commodities_percent
- allocation_check.cash_percent     = RULE_EVALUATION.metrics.cash_percent
- stocks_vs_etf_split: use RULE_EVALUATION.metrics.stocks_of_equities_percent and etfs_of_equities_percent. Express as "<X>% stocks / <Y>% ETFs (within equities only)".
- allocation_check.issues: MUST equal RULE_EVALUATION.main_allocation_issues exactly. If empty, issues = [].
- equities_status / bonds_status / commodities_status: map from RULE_EVALUATION.entries. "within_range" → "ok". Only hard breaches → "warning" or "critical". Soft breaches → "ok".

ANTI-FRAGILE RULE
- Use RULE_EVALUATION.metrics.antifragile_percent.
- Only reference as breach if its entry status is "underweight" or "overweight".
- If "within_range", MUST NOT say "fails the minimum".

HARD CASH CONSTRAINT — NON-NEGOTIABLE
Use RULE_EVALUATION.metrics.cash_percent as authoritative.

If cash_percent ≤ 0.1:
- Portfolio is fully invested. total_buys_value MUST NOT exceed total_sells_value.
- net_cash_impact MUST be ≥ 0.
- FORBIDDEN: proposing net buys > sells, phrases like "funded by cash", "deploy cash".
- Fund ALL equity buys by trimming bonds, commodities, or stocks.
- Before finalizing: if total_buys > total_sells, reduce buy sizes until balanced.

If cash_percent > 0.1:
- Buys may be funded partly by cash, but numeric totals MUST match.

ALLOCATION CONSISTENCY RULE
Total allocation across equities + bonds + commodities + cash MUST remain 100%.
MUST NOT increase bonds and equities simultaneously when cash_percent ≤ 0.1.

FINAL NUMERIC VALIDATION
1. Confirm total_buys_value and total_sells_value.
2. net_cash_impact = total_sells_value - total_buys_value.
3. If cash_percent ≤ 0.1: total_buys_value ≤ total_sells_value.
4. Total allocation sums to ~100%.
If any check fails, revise trades before output.

HEALTH SCORE
- Start at 100.
- For each HARD rule breach (main_allocation_issues): −20 if breach > 5pp beyond limit, −10 if ≤ 5pp.
- SOFT and DIAGNOSTIC rules MUST NOT change the score.
- Floor 10, ceiling 100.
- For scores > 75: mention "Score reflects current data quality, not future certainty." somewhere.

BANNED TERM
- NEVER use the word "thesis" in any free-text field.
- "thesis_checks" key MUST always be present and always be [].

THESIS / CONVICTION DATA
- Each position may include thesis_notes, confidence_level (1-10), bet_type (active/passive_carry/legacy_hold), and invalidation_trigger.
- HIGH CONVICTION (8-10): Do NOT recommend selling unless there is a clear HARD rule breach or the invalidation trigger has been met. Respect the investor's conviction.
- LOW CONVICTION + LEGACY HOLD: Flag these as first candidates for exit or trimming. Legacy holds with conviction ≤ 4 should be priority sells in any rebalancing.
- When recommending a sell, if the position has an invalidation_trigger, reference it: "Your invalidation trigger for [TICKER] was [trigger] — current conditions suggest this has been met."
- Use thesis_notes to assess rationale alignment (rationale_aligned field in trade_recommendations).

SELL CRITERIA — only for:
- HARD allocation/rule breaches
- Intelligence Brief signals on specific tickers
- Valuation concerns with fundamental evidence
- Fundamental business problems
- Invalidation triggers being met
NEVER sell just to tidy documentation or fix a SOFT rule.

DIAGNOSTIC RULES (rule_enforcement === "diagnostic") are informational only:
- NEVER use diagnostic rule breaches as the primary reason to sell a position.
- NEVER deduct health score points for diagnostic rule breaches.
- You MAY mention them in position_alerts as observations, but severity must be "warning" not "critical", and recommendation must be "monitor" not "sell".
- Quality metrics (ROIC floor, Earnings Yield floor) are diagnostic rules — they inform but do not mandate trades.

TRADE RECOMMENDATIONS
- Include EVERY existing position plus any new ETFs/stocks recommended.
- HOLD: action="HOLD", recommended_shares=current_shares, shares_to_trade=0.
- total_buys and total_sells MUST be numerically consistent with trade_recommendations.
- net_cash_impact MUST equal (total_sells − total_buys).

MARKET SIGNALS
- bubble_warnings: max 5 items, each ≤ 25 words.
- overall_sentiment: ≤ 30 words.
- Use Intelligence Brief + insights only; do NOT invent macro views.

BOND RECOMMENDATIONS (MANDATORY)
- current_bond_percent = RULE_EVALUATION.metrics.bonds_percent.
- recommended_etfs: only Ireland-domiciled UCITS bond ETFs, 2–4 items max.
- current_holdings_assessment: assess each existing bond ETF with percent-of-bonds.

INTELLIGENCE BRIEF INTEGRATION
- Use as PRIMARY research signal for tilts and themes.
- Reflect in trade_recommendations and market_signals.
- Do NOT contradict explicit data in the brief.

JSON OUTPUT SCHEMA — MATCH THIS EXACT SHAPE:
{
  "allocation_check": {
    "equities_percent": number,
    "equities_status": "ok" | "warning" | "critical",
    "bonds_percent": number,
    "bonds_status": "ok" | "warning" | "critical",
    "commodities_percent": number,
    "commodities_status": "ok" | "warning" | "critical",
    "commodities_breakdown": [{ "label": string, "percent": number, "positions": [string] }],
    "cash_percent": number,
    "stocks_vs_etf_split": "X% stocks / Y% ETFs (within equities only)",
    "equity_by_geography": [{ "region": string, "percent": number, "positions": [string], "recommendation": string }],
    "equity_by_style": [{ "style": string, "percent": number, "positions": [string], "recommendation": string }],
    "issues": [string]
  },
  "position_alerts": [{
    "ticker": string,
    "alert_type": "size" | "quality" | "rationale" | "sentiment",
    "severity": "warning" | "critical",
    "issue": string,
    "recent_sentiment": string,
    "recommendation": string
  }],
  "market_signals": {
    "bubble_warnings": [string],
    "consensus_level": "mixed" | "bullish_consensus" | "bearish_consensus",
    "overall_sentiment": string,
    "portfolio_exposure": string
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
    "rationale_aligned": boolean
  }],
  "rebalancing_summary": {
    "total_sells": string,
    "total_buys": string,
    "net_cash_impact": string,
    "primary_goal": string
  },
  "bond_recommendations": {
    "current_bond_percent": number,
    "target_bond_percent": number,
    "strategy_summary": string (1-2 sentences MAX, no filler),
    "bond_actions": [{ "ticker": string, "name": string, "action": "HOLD"|"BUY"|"INCREASE"|"REDUCE"|"SELL", "current_percent_of_bonds": number|null, "target_percent_of_bonds": number, "reasoning": string (≤15 words) }],
    "funding_note": string|null (e.g. "Funded by reducing IB01 by 10%" or "Requires $2,000 additional cash" — only when BUY/INCREASE actions exist, otherwise null)
  },
  "thesis_checks": [],
  "portfolio_health_score": number,
  "summary": string
}

SUMMARY FIELD RULES
- Exactly 4 sentences. Each must add NEW information — zero repetition:
  1) What's working well — highlight 1-2 strengths (e.g. strong diversification, good bond core, solid ETF backbone). Be specific, mention tickers or allocations.
  2) What needs attention — the most important compliance issue or portfolio weakness, in ≤20 words. Not a laundry list.
  3) Key risk or opportunity ahead — a non-obvious insight from market signals, newsletter intelligence, or concentration analysis. ≤25 words.
  4) "Top action: " + ONE specific, actionable next step naming at most 2 tickers with a concrete change (e.g. "Trim AMZN by 2% into VWRA"). Not a list of all trades.
- Do NOT start with the health score (it's displayed separately). Do NOT use labels like "Biggest problem:" or "Strengths:".
- Write as a portfolio manager's narrative brief — conversational, insightful, no jargon dump.
- MUST NOT contradict allocation_check or RULE_EVALUATION.`;

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

${intelligence_brief ? `INTELLIGENCE BRIEF (${intelligence_brief.newsletters_analyzed ?? 0} newsletters, ${intelligence_brief.insights_analyzed ?? 0} insights):
Executive Summary: ${intelligence_brief.executive_summary || "N/A"}

Temporal Shifts:
${(intelligence_brief.temporal_shifts || []).map((ts: any) => `- ${ts.topic}: ${ts.prior_view} → ${ts.current_view} (${ts.significance})`).join("\n")}

Market Themes:
${(intelligence_brief.market_themes || []).map((mt: any) => `- ${mt.theme} (${mt.sentiment}, ${mt.source_count} sources): ${mt.portfolio_impact}`).join("\n")}

Crowded Trades:
${(intelligence_brief.crowded_trades || []).map((ct: string) => `- ${ct}`).join("\n")}

USE THIS BRIEF to drive trade recommendations. Reference specific themes.` : "No Intelligence Brief available — rely on raw insights above."}

${stock_fundamentals?.length > 0 ? `STOCK FUNDAMENTALS:
${stock_fundamentals.map((f: any) => `${f.ticker}: ROIC=${f.roic ?? "N/A"}%, Earnings Yield=${f.earnings_yield ?? "N/A"}%, P/E=${f.pe_ratio ?? "N/A"}, D/E=${f.debt_to_equity ?? "N/A"}, Revenue Growth=${f.revenue_growth_yoy ?? "N/A"}%, FCF Yield=${f.free_cash_flow_yield ?? "N/A"}%, Gross Margin=${f.gross_margin ?? "N/A"}%${f.notes ? ` (${f.notes})` : ""}`).join("\n")}` : "No stock fundamentals available."}

RULE EVALUATION (precomputed — use as ground truth for ALL rule statuses and percentages):
${JSON.stringify(ruleEvaluation, null, 2)}

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

PORTFOLIO MODE: ${portfolio_mode ?? "balanced"}

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

${north_star && north_star.length > 0 ? `NORTH STAR TARGET PORTFOLIO:
The user has defined their ideal target portfolio. Every recommendation must move the portfolio closer to this target.
${north_star.map((ns: any) => `• ${ns.ticker} (${ns.name || ""}): ideal ${ns.target_weight_ideal}% [${ns.target_weight_min}%-${ns.target_weight_max}%], status=${ns.status}, priority=${ns.priority}`).join("\n")}

NORTH STAR RULES:
- Prioritize buying positions with status="build" and highest priority.
- Prioritize exiting positions with status="exit".
- For "reduce" positions, recommend trimming toward target weight.
- Include a "north_star_progress" section in your response with: alignment_percent (0-100), top_3_moves (array of {ticker, action, rationale}).` : "No north star target portfolio set."}

Analyze this portfolio and return the JSON response.`;

    console.log("Calling Lovable AI gateway for portfolio analysis...");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
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
    });

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
    analysisResult = enforceCashConstraint(analysisResult, cash_balance ?? 0);

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
