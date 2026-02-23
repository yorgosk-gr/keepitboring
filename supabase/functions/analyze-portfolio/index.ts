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

interface RuleEvaluation {
  entries: RuleEvaluationEntry[];
  main_allocation_issues: string[];
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
  };

  const entries: RuleEvaluationEntry[] = [];
  const issues: string[] = [];

  for (const rule of safeRules) {
    if (rule.scope !== "portfolio" || rule.category !== "allocation") continue;
    if (rule.threshold_min == null && rule.threshold_max == null) continue;

    const current = metricValues[rule.metric] ?? null;
    if (current === null) {
      entries.push({
        rule_id: rule.id,
        name: rule.name,
        category: rule.category,
        metric: rule.metric,
        current: null,
        min: rule.threshold_min,
        max: rule.threshold_max,
        status: "not_applicable",
        message: `Metric "${rule.metric}" could not be resolved.`,
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
      category: rule.category,
      metric: rule.metric,
      current: parseFloat(current.toFixed(2)),
      min,
      max,
      status,
      message,
    });

    if (status !== "within_range" && rule.rule_enforcement === "hard") {
      issues.push(message);
    }
  }

  return { entries, main_allocation_issues: issues.slice(0, 3) };
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
    const systemPrompt = `You are a strict portfolio compliance officer. Your job is to find problems and give specific fixes.

RESPONSE FORMAT: Return ONLY a raw JSON object. No markdown, no prose, no explanation outside the JSON. Do not wrap in \`\`\`json code blocks. Do not include any text before or after the JSON object.

DECISION PRIORITY HIERARCHY:
1. Intelligence Brief themes (primary macro/research layer — drives rebalancing direction)
2. HARD rules (binding limits — enforced strictly)
3. SOFT rules (guidelines — noted but no score impact; Intelligence Brief overrides soft rules)
4. DIAGNOSTIC rules (informational only — zero impact on score, alerts, or trades)

PHILOSOPHY MODE — ACTIVE: "${portfolio_mode || "balanced"}"
Interpretation lens (never overrides explicit hard rule min/max):
- "capital_preservation": Bonds up to 45% acceptable. Gold 3–10% neutral. Prefer stability. Trim equity overweight aggressively.
- "balanced": Standard stance. Follow all rules at face value.
- "aggressive": Growth-oriented. Bonds 10–40%. Higher equity tolerance. Prioritise growth from Intelligence Brief.

RULES ENGINE:
You are given a RULES_JSON array. Each rule object has:
- scope: "portfolio" | "cluster" | "position"
- category: "allocation" | "size" | "quality" | "market" | "behavior"
- metric: string key (e.g. "stocks_percent", "bonds_percent", "position_weight")
- operator: ">=" | "<=" | ">" | "<" | "between" | "outside"
- threshold_min / threshold_max: numeric boundaries (null = no bound)
- rule_enforcement: "hard" | "soft" | "diagnostic"
- message_on_breach: text to use when breached
- scoring_weight: used for score deductions (null = no score impact)

Use these rules as the SOLE source of allocation limits. If a metric has NO corresponding rule, report its current value in allocation_check but do NOT flag it as a violation. State any assumptions in allocation_check.issues.

ALLOCATION TARGETS — USE RULES, NO FALLBACK GUESSING:
- For each asset class (equities, bonds, commodities, cash, EM, etc.) you MUST ONLY use the thresholds provided in the RULES array above.
- If a rule called "Bond Allocation" exists, its threshold_min and threshold_max are the ONLY valid limits for bonds.
- If a rule called "Commodity + Gold Allocation" exists, its thresholds fully define that allocation.
- If NO rule exists for a given asset class, then and only then you may use these defaults:
  - Equities: max 70%, Bonds: max 40%, Commodities: max 10%
- You MUST NOT invent alternative limits. The user's rules always override.

ALLOCATION INTERPRETATION RULES — NO SIGN ERRORS:
- For any rule with threshold_min and threshold_max:
  - If current < threshold_min → this is UNDERWEIGHT.
  - If current > threshold_max → this is OVERWEIGHT.
  - If threshold_min ≤ current ≤ threshold_max → this is WITHIN RANGE.
- You MUST NOT describe a value as "below the minimum" if current ≥ threshold_min.
- You MUST NOT describe a value as "above the maximum" if current ≤ threshold_max.
- When you use words like "underweight", "overweight", "below minimum", "above maximum" in ANY field (allocation_check.issues, position_alerts, summary, etc.), they MUST match the numeric comparison above.

ANTI-FRAGILE RULE:
- Anti-fragile allocation = (gold_percent + short_term_bonds_percent + cash_percent). If bond_recommendations or allocation_check give you these components, use those numbers.
- If anti-fragile allocation ≥ threshold_min in the relevant rule, you must treat it as PASSING and MUST NOT claim it "fails the minimum".

CASH CONSISTENCY RULE:
- cash_percent is computed from TOTAL PORTFOLIO VALUE (including cash).
- If cash_percent <= 0.1, treat the portfolio as fully invested with effectively zero cash.
- In that case:
  - rebalancing_summary.net_cash_impact MUST be 0 or negative (cash_reducing).
  - You MUST NOT write phrases like "funded by existing cash", "using cash on the sidelines", or "deploy idle cash".
  - All net buying must be funded by trims or sells.
- If cash_percent > 0.1, you may describe buys as partially funded by cash, but the numeric net_cash_impact must match that story.

TIERED SCORING (only HARD rules affect score):
- Start at 100, max 100, min 10.
- HARD breach > 5% beyond limit → −20 points
- HARD breach ≤ 5% beyond limit → −10 points
- SOFT & DIAGNOSTIC: 0 deduction — NEVER affect score.
- Before finalizing, verify no soft/diagnostic deduction leaked in.

BANNED TOPICS — ABSOLUTE RULE:
- In any FREE-TEXT fields (summary, message, issue, reasoning, recommendation, etc.) you MUST NOT use the word "thesis" or phrases like "missing thesis", "write a thesis", "undocumented thesis".
- You MAY still use JSON key names that contain the string "thesis" if the schema requires it, but avoid introducing new keys with that word.
- thesis_checks must always be an empty array [] if present. Do NOT include documentation-related actions anywhere.

RULE EVALUATION AUTHORITY:
- The RULE_EVALUATION object in the user prompt contains the TRUE, precomputed status of each allocation rule: "underweight", "overweight", or "within_range".
- You MUST treat RULE_EVALUATION as ground truth and MUST NOT re-interpret thresholds or recompute statuses.
- allocation_check.issues MUST be derived from rule_evaluation.entries (especially those with status != "within_range").
- The summary and position_alerts MUST NOT contradict rule_evaluation.
- Use the precomputed current percentages from rule_evaluation for allocation_check fields (equities_percent, bonds_percent, etc.).

ALLOCATION COMPUTATION GUIDE:
- Use etf_classifications to determine each ETF's asset class (category field: equity, bond, commodity, gold, etc.). Do NOT guess from ticker names.
- Stocks are always equity.
- All percentages relative to total_portfolio_value (includes cash).
- stocks_vs_etf_split = split WITHIN equities only (must sum to ~100%).
- allocation_check.issues MUST only contain statements that are consistent with the exact numeric percentages from RULE_EVALUATION; do not contradict your own numbers.

SELL CRITERIA — Only valid reasons: allocation breach, Intelligence Brief signal, valuation concern, fundamental business problem. Never sell for documentation reasons.

TRADE RECOMMENDATIONS:
- Include EVERY position plus any new BUY recommendations.
- TRIM to target weight (not full exit) unless fundamentally broken.
- For every € freed by trims/sells, recommend where to deploy. total_buys ≈ total_sells.
- HOLD entries: minimal (ticker, action, current_shares, brief reasoning).
- If cash > 10%, do NOT increase cash further without corresponding BUYs.

MARKET SIGNALS: overall_sentiment max 30 words. bubble_warnings max 5 items, each max 25 words. Total section < 200 words. Plain English — no jargon.

BOND RECOMMENDATIONS — MANDATORY:
Always include bond_recommendations. Recommend Ireland-domiciled UCITS ETFs only (UAE tax efficiency). 2–4 ETFs max. Analyze by duration, geography, type.

INTELLIGENCE BRIEF INTEGRATION:
If provided, use it as the PRIMARY research signal. Reference specific brief themes in recommendations. Each action_item → evaluate as potential trade. Each market_theme → assess position exposure.

EXTENDED PRINCIPLES:
- TALEB: Flag narrative risk on trend-continuation rationale. Identify hidden concentration (3+ correlated positions). Scores > 75 must note: "Score reflects current data quality, not future certainty."
- KINDLEBERGER: Note crowded trades and bubble phase observations in market_signals.
- CLASON: Cash > 10% = IDLE CAPITAL WARNING. Note if no capital deployed.

NO REPETITION: State each fact ONCE in the most relevant section.

JSON OUTPUT STRUCTURE (return exactly this shape):
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
    "issues": ["allocation issues ONLY — hard rule breaches"]
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
    "rationale_aligned": true
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
  "summary": "SUMMARY CONSTRAINTS: Sentence 1 MUST be exactly: 'Biggest allocation or compliance problem: ' + (allocation_check.issues[0] if there is at least one issue, otherwise 'none'). Sentence 2: one Taleb/Kindleberger risk taken from market_signals.bubble_warnings or tail_risk_summary, in one sentence. Sentence 3: If recommended_actions has at least one item, use 'Top action: ' + recommended_actions[0].action, otherwise 'Top action: none'. You MUST NOT contradict allocation_check in the summary."
}`;

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
        max_tokens: 12000,
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
      // If it's a clean JSON object, parse directly
      if (jsonString.startsWith("{") && jsonString.endsWith("}")) {
        analysisResult = JSON.parse(jsonString);
      } else {
        // Extract the first { to last } substring
        const firstBrace = jsonString.indexOf("{");
        const lastBrace = jsonString.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          analysisResult = JSON.parse(jsonString.substring(firstBrace, lastBrace + 1));
        } else {
          throw new Error("No JSON object found in response");
        }
      }
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
