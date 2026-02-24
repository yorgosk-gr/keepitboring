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
  metrics: RuleEvaluationMetrics;
}

function computeRuleEvaluation(
  positions: any[],
  rules: any[],
  etfClassifications: any[],
  cashBalance: number,
  totalPortfolioValue: number
): RuleEvaluation {
  const safePositions = positions ?? [];
  const safeRules = (rules ?? []).filter((r: any) => r.is_active !== false);
  const totalVal = totalPortfolioValue || 1;

  // Build classification lookup: ticker -> category
  const classMap: Record<string, string> = {};
  for (const c of (etfClassifications ?? [])) {
    if (c.ticker && c.category) {
      classMap[c.ticker] = c.category.toLowerCase();
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
    const cat = classMap[p.ticker] || "";

    if (posType === "stock") {
      equityValue += mv;
    } else if (cat === "equity") {
      equityValue += mv;
    } else if (cat === "bond") {
      bondValue += mv;
    } else if (cat === "commodity" || cat === "gold") {
      commodityGoldValue += mv;
      if (cat === "gold" || (p.name || "").toLowerCase().includes("gold")) {
        goldValue += mv;
      }
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

    const min = rule.threshold_min;
    const max = rule.threshold_max;
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

    // Treat all active allocation rules as hard for scoring
    if (status !== "within_range") {
      issues.push(message);
    }
  }

  return {
    entries,
    main_allocation_issues: issues.slice(0, 3),
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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
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
    } = await req.json();

    // ── Deterministic Rule Evaluation ─────────────────────────────────
    const ruleEvaluation = computeRuleEvaluation(
      positions, rules, etf_classifications, cash_balance ?? 0, total_portfolio_value ?? 0
    );
    console.log("Rule evaluation computed:", JSON.stringify(ruleEvaluation.main_allocation_issues));

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
- NEVER recommend a ticker you do not see in the positions or trade_recommendations list. If recommending a new BUY, use only real, exchange-listed ETF tickers (e.g. VWRA, AGGU, CSPX). Never use placeholder names like CUSTOM_BROAD_MARKET_ETF.

The caller provides RULE_EVALUATION, already computed from positions + rules.

RULE_EVALUATION has:
- entries: array of objects:
  - rule_id, name, category, metric, current, min, max, status, message
  - status ∈ "underweight" | "overweight" | "within_range" | "not_applicable"
- main_allocation_issues: array of strings (top hard-rule allocation issues)
- metrics: canonical percentages:
  - equities_percent
  - bonds_percent
  - commodities_percent
  - cash_percent
  - stocks_percent
  - etfs_percent
  - etfs_of_equities_percent
  - stocks_of_equities_percent
  - antifragile_percent

YOU MUST TREAT RULE_EVALUATION AS AUTHORITATIVE:
- DO NOT recompute equities/bonds/commodities/cash/stocks/etfs/antifragile percentages from raw positions.
- DO NOT re-interpret min/max or statuses.
- If RULE_EVALUATION.metrics.etfs_percent = 43.4 and there is no ETF allocation rule in entries with status != "within_range":
  - You MUST NOT say things like "ETF Allocation: 8.3% is below minimum 75%".
- If an entry has status "within_range", you MUST NOT describe that metric anywhere as "underweight" or "overweight".

ALLOCATION_CHECK FIELDS — EXACT MAPPING
You MUST fill allocation_check as follows:

- allocation_check.equities_percent = RULE_EVALUATION.metrics.equities_percent
- allocation_check.bonds_percent    = RULE_EVALUATION.metrics.bonds_percent
- allocation_check.commodities_percent = RULE_EVALUATION.metrics.commodities_percent
- allocation_check.cash_percent     = RULE_EVALUATION.metrics.cash_percent

- stocks_vs_etf_split:
  - Express as "<X>% stocks / <Y>% ETFs (within equities only)" using RULE_EVALUATION.metrics.stocks_of_equities_percent and RULE_EVALUATION.metrics.etfs_of_equities_percent.
  - Those two MUST sum to 100% (they represent the split within equities, not total portfolio).

- allocation_check.issues:
  - MUST equal RULE_EVALUATION.main_allocation_issues (same strings, same order).
  - You are NOT allowed to add invented issues here.
  - If main_allocation_issues is empty, issues must be [].

- equities_status / bonds_status / commodities_status:
  - Map from RULE_EVALUATION.entries for those metrics:
    - status "within_range" → "ok"
    - status "underweight"  → "warning" or "critical" depending on severity (only for hard rules; soft rules should be "ok" if there is no hard breach).
    - status "overweight"   → "warning" or "critical" similarly.
  - If there are multiple rules on the same metric, the HARDEST status (any hard breach) wins.
  - You MUST NOT mark a metric as "warning" or "critical" if all rules for that metric are "within_range" or "not_applicable".
  - For commodities_status, use the rule on "commodities_gold_percent" if present; otherwise treat it as "ok" unless you explicitly have a hard breach rule.

ANTI-FRAGILE RULE
- Anti-fragile allocation = RULE_EVALUATION.metrics.antifragile_percent.
- If there is a rule on this metric and its entry in RULE_EVALUATION.entries is "within_range":
  - You MUST NOT say "fails the minimum" or "below anti-fragile minimum".
- If it is "underweight" or "overweight", you may reference that EXACTLY as per the status and message.

HARD CASH CONSTRAINT — NON-NEGOTIABLE

Use RULE_EVALUATION.metrics.cash_percent as authoritative.

If cash_percent ≤ 0.1:
- Treat the portfolio as fully invested.
- You MUST enforce:
  total_buys_value ≤ total_sells_value
- net_cash_impact MUST be ≥ 0 (zero or positive).
  (Positive = raising cash. Zero = perfectly funded by sells.)
- You are STRICTLY FORBIDDEN from:
  • Proposing net buys greater than sells.
  • Writing phrases like "funded by cash", "deploy cash", or "using cash".
  • Increasing total portfolio exposure without trimming something.
- If equity is underweight and cash = 0:
  You MUST fund ALL equity buys by trimming bonds, commodities, or stocks.
- Before finalizing JSON:
  - Compute total_sells and total_buys.
  - If total_buys > total_sells:
    You MUST adjust trades until total_buys ≈ total_sells.
  - If not possible, reduce buy sizes.

If cash_percent > 0.1:
- You may describe buys as funded partly by cash, but numeric totals MUST match.

ALLOCATION CONSISTENCY RULE
If equities_percent is below its minimum threshold:
- target_equities_percent MUST be ≥ threshold_min.
- target_bonds_percent MUST decrease accordingly if cash_percent ≤ 0.1.
- You MUST NOT increase bonds and equities simultaneously when cash_percent ≤ 0.1.
- Total allocation across equities + bonds + commodities + cash MUST remain 100%.

FINAL NUMERIC VALIDATION
Before returning JSON:
1. Confirm total_buys_value and total_sells_value.
2. Confirm net_cash_impact = total_sells_value - total_buys_value.
3. Confirm if cash_percent ≤ 0.1: total_buys_value ≤ total_sells_value.
4. Confirm total allocation sums to ~100%.
If any check fails, revise trades before output.

- For each HARD rule breach (rule_enforcement === "hard") that is allocation-related:
  - If breach magnitude > 5 percentage points beyond the limit: −20 points.
  - If breach magnitude ≤ 5 percentage points: −10 points.
- SOFT and DIAGNOSTIC rules MUST NOT change the score.
- Enforce a floor of 10 and ceiling of 100.
- At the end, verify you have NOT applied any deduction from soft/diagnostic rules.
- For scores > 75, somewhere in summary or reasoning you must mention:
  - "Score reflects current data quality, not future certainty."

BANNED TERM
- In ANY free-text field (summary, message, issue, reasoning, recommendation, etc.) you MUST NOT use the word "thesis" or phrases like "missing thesis", "write a thesis", "undocumented thesis".
- The JSON key "thesis_checks" MUST be present and MUST ALWAYS be an empty array [].
- Do not create any other keys containing the string "thesis".

SELL CRITERIA
You may recommend SELLs or TRIMs only for:
- Allocation/rule breaches,
- Intelligence Brief signals,
- Valuation concerns,
- Fundamental business problems.
NEVER sell just to tidy documentation.

TRADE RECOMMENDATIONS
- Include an entry for EVERY existing position plus any NEW ETFs/stocks you recommend.
- For holds: action = "HOLD", recommended_shares = current_shares, shares_to_trade = 0.
- For trims and adds: adjust recommended_shares so that target_weight is coherent with the rebalancing story.
- total_buys and total_sells (rebalancing_summary) MUST be numerically consistent with trade_recommendations.
- net_cash_impact MUST equal (total_sells − total_buys) and MUST respect the cash rule above.

MARKET SIGNALS
- bubble_warnings: max 5 items, each ≤ 25 words.
- overall_sentiment: ≤ 30 words, plain English.
- consensus_level: "mixed" | "bullish_consensus" | "bearish_consensus".
- Use Intelligence Brief + insights to populate these fields; do NOT invent macro views that are not supported.

BOND RECOMMENDATIONS (MANDATORY)
Fill bond_recommendations with a coherent, compact plan:
- current_bond_percent = RULE_EVALUATION.metrics.bonds_percent.
- target_bond_percent: pick a value within any hard rule bounds (e.g., between min and max).
- duration_allocation: 2–4 buckets ("short-term", "intermediate", "long-term", "EM").
- geography_allocation: at least "US" and "EM" if present, or appropriate regions.
- type_split: government vs corporate vs inflation-linked with reasoning.
- recommended_etfs: only Ireland-domiciled UCITS bond ETFs, 2–4 items max.
- current_holdings_assessment: assessment for each existing bond ETF (e.g., IB01, IDTM, IEML) with percent-of-bonds and a one-sentence assessment.

INTELLIGENCE BRIEF INTEGRATION
If intelligence_brief is present:
- Use it as the PRIMARY research signal for tilts and themes.
- For each action item and market theme in the brief, consider if the user's positions are exposed; reflect that in key trade_recommendations and market_signals.
- Do NOT contradict explicit data in the brief.

JSON OUTPUT SCHEMA — YOU MUST MATCH THIS EXACT SHAPE
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
    "strategy_summary": string,
    "duration_allocation": [{ "duration": string, "current_percent_of_bonds": number, "target_percent_of_bonds": number, "reasoning": string }],
    "geography_allocation": [{ "region": string, "target_percent_of_bonds": number, "reasoning": string }],
    "type_split": { "government_percent": number, "corporate_percent": number, "inflation_linked_percent": number, "reasoning": string },
    "recommended_etfs": [{ "ticker": string, "name": string, "duration": string, "region": string, "type": string, "action": string, "target_percent_of_bonds": number, "reasoning": string }],
    "current_holdings_assessment": [{ "ticker": string, "name": string, "duration": string, "region": string, "type": string, "current_percent_of_bonds": number, "assessment": string }]
  },
  "thesis_checks": [],
  "portfolio_health_score": number,
  "summary": string
}

SUMMARY FIELD RULES
- summary MUST be exactly 3 sentences:
  1) "Biggest allocation or compliance problem: " + (allocation_check.issues[0] if it exists, otherwise "none").
  2) One tail-risk or bubble warning taken from market_signals.bubble_warnings, or from your own tail risk reasoning if none are present, max 25 words.
  3) If recommended_actions has at least one item: "Top action: " + recommended_actions[0].action, otherwise "Top action: none".
- summary MUST NOT contradict allocation_check or RULE_EVALUATION in any way.`;

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
${JSON.stringify(positions, null, 2)}

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

Key Points:
${(intelligence_brief.key_points || []).map((kp: any) => `- [${kp.relevance}] ${kp.title}: ${kp.detail}`).join("\n")}

Action Items:
${(intelligence_brief.action_items || []).map((ai: any) => `- [${ai.urgency}] ${ai.action} — ${ai.reasoning}`).join("\n")}

Market Themes:
${(intelligence_brief.market_themes || []).map((mt: any) => `- ${mt.theme} (${mt.sentiment}, ${mt.source_count} sources): ${mt.portfolio_impact}`).join("\n")}

Contrarian Signals:
${(intelligence_brief.contrarian_signals || []).map((cs: string) => `- ${cs}`).join("\n")}

USE THIS BRIEF to drive trade recommendations. Reference specific themes.` : "No Intelligence Brief available — rely on raw insights above."}

${stock_fundamentals?.length > 0 ? `STOCK FUNDAMENTALS:
${stock_fundamentals.map((f: any) => `${f.ticker}: ROIC=${f.roic ?? "N/A"}%, Earnings Yield=${f.earnings_yield ?? "N/A"}%, P/E=${f.pe_ratio ?? "N/A"}, D/E=${f.debt_to_equity ?? "N/A"}, Revenue Growth=${f.revenue_growth_yoy ?? "N/A"}%, FCF Yield=${f.free_cash_flow_yield ?? "N/A"}%, Gross Margin=${f.gross_margin ?? "N/A"}%${f.notes ? ` (${f.notes})` : ""}`).join("\n")}` : "No stock fundamentals available."}

RULE EVALUATION (precomputed, use as ground truth for all rule statuses):
${JSON.stringify(ruleEvaluation, null, 2)}

Analyze this portfolio and return the JSON response.`;

    console.log("Calling Lovable AI gateway for portfolio analysis...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
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
    const content = aiResponse.choices?.[0]?.message?.content;
    const finishReason = aiResponse.choices?.[0]?.finish_reason;

    if (!content) {
      console.error("Empty AI response:", JSON.stringify(aiResponse));
      return new Response(
        JSON.stringify({ error: "AI returned empty response. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (finishReason === "length") {
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
      
      // Strip markdown code fences (```json ... ```)
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
