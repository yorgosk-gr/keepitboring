import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildAllocationTargets(rules: any[]): string {
  if (!rules || rules.length === 0) return "(No custom rules defined — use defaults below)";
  return rules.map((r: any) => {
    const enforcement = r.rule_enforcement || "hard";
    let line = `- ${r.name}`;
    if (r.description) line += `: ${r.description}`;
    if (r.threshold_min != null && r.threshold_max != null) {
      line += ` (min: ${r.threshold_min}%, max: ${r.threshold_max}%)`;
    } else if (r.threshold_max != null) {
      line += ` (max: ${r.threshold_max}%)`;
    } else if (r.threshold_min != null) {
      line += ` (min: ${r.threshold_min}%)`;
    }
    if (r.rule_type) line += ` [type: ${r.rule_type}]`;
    line += ` [enforcement: ${enforcement}]`;
    return line;
  }).join("\n");
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

    // Use Lovable AI gateway instead of user API key
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { positions, rules, insights, decisions, cash_balance, total_portfolio_value, intelligence_brief, etf_classifications, stock_fundamentals } = await req.json();

    const systemPrompt = `You are a strict portfolio compliance officer. Your job is to find problems and give specific fixes.

RESPONSE FORMAT: Return ONLY a raw JSON object. No markdown, no prose, no explanation outside the JSON. Do not wrap in \`\`\`json code blocks.

CRITICAL DATA ACCURACY RULE — ABSOLUTE:
- You are given EXACT position data including weight_percent, market_value, shares, and current_price for every position
- You MUST use these EXACT values when referencing any position's weight, value, or size — NEVER estimate, round aggressively, or fabricate percentages
- When generating position_alerts about size limits (e.g. "position is over X%"), use the EXACT weight_percent from the position data
- If a position's weight_percent is 1.1%, do NOT say it is "over 3%" — that is fabrication and makes the entire response INVALID
- Double-check every percentage you cite against the actual weight_percent field in the position data before including it
- The same rule applies to market_value, shares, and all other numerical fields — use the data as provided

BANNED TOPICS — ABSOLUTE RULE:
The word "thesis" must NOT appear anywhere in your response. Do not mention: "thesis", "undocumented", "missing thesis", "document investment thesis", "no invalidation criteria", "write a thesis". This applies to ALL fields: position_alerts, recommended_actions, trade_recommendations, key_risks, summary. Any mention of thesis documentation makes the response INVALID. thesis_checks must always be an empty array [].

RULE ENFORCEMENT LEVELS — CRITICAL:
Each rule has an enforcement level: "hard", "soft", or "diagnostic" (shown as [enforcement: X] in the rules list).
- HARD rules: May trigger critical/warning issues. Deduct points from portfolio_health_score. Appear in allocation_check.issues.
- SOFT rules: May appear in position_alerts ONLY. Must NOT deduct points. Must NOT change portfolio_health_score.
- DIAGNOSTIC rules: Informational only. Include as observations but must NOT affect scoring, must NOT trigger rebalancing, must NOT appear in allocation_check.issues.
- If a rule has no enforcement level specified, treat it as "hard" (backward compatibility).

SCORING RULES (be harsh — only "hard" rules affect score):
- Start at 100
- Each CRITICAL issue from a HARD rule: -20 points (allocation breach >5% over limit)
- Each WARNING from a HARD rule: -10 points (near limit, stale review)
- SOFT and DIAGNOSTIC rule violations must NOT deduct any points
- NEVER deduct points for missing documentation of any kind
- Minimum score: 10

Example: 78% equities (hard rule breach) = -20, one stock near size limit (hard rule) = -10. Score = 100 - 20 - 10 = 70.

ALLOCATION TARGETS — READ THE USER'S RULES CAREFULLY:
The user has defined these specific rules. Use their EXACT min/max values:
${buildAllocationTargets(rules)}
IMPORTANT: If NO user-defined rule exists for a given asset class, do NOT invent fallback allocation limits. Simply report the current allocation percentage without flagging it as a violation. Portfolio compliance is driven ONLY by user-defined rules — never by implicit defaults.

EXTENDED PRINCIPLES (Taleb, Kindleberger, Thorndike, Clason):

TALEB — Apply as a skepticism layer on all analysis:
- Flag any thesis based primarily on trend continuation as NARRATIVE RISK: HIGH
- Identify HIDDEN CONCENTRATION: 3+ positions that would fall together in a risk-off event (e.g. multiple equity ETFs, correlated growth stocks)
- Health scores above 75 must include this note in summary: "Score reflects current data quality, not future certainty — tail risks are by definition not visible in present signals"
- Do NOT flag positions for "no stress test in holding period" or "no drawdown since purchase" — this is not actionable
- Assess each stock: is the business FRAGILE (dependent on one input) or ROBUST (multiple revenue streams, pricing power, low leverage)?

KINDLEBERGER — Bubble phase per sector:
- For each sector/asset class in the portfolio, assign one of: DISPLACEMENT | CREDIT EXPANSION | EUPHORIA | DISTRESS | REVULSION
- Positions in EUPHORIA: flag for thesis review
- Positions in REVULSION: flag as potential contrarian opportunity
- Overwhelming newsletter consensus on any theme = CROWDED TRADE warning

THORNDIKE — Capital allocation quality (stocks only, not ETFs):
- Is management buying or selling their own shares?
- Is capex growing faster than revenue? Flag as CAPITAL MISALLOCATION if so
- Is the company FCF positive or negative?
- Flag any major acquisition in past 12 months
- Classify CEO as OPERATOR or ALLOCATOR (allocators outperform per Thorndike)

CLASON — Cash discipline:
- Cash > 10% of portfolio = IDLE CAPITAL WARNING
- If cash has been above 10% for more than one period = DRIFTED CASH (flag more strongly)
- Note if no capital was deployed in the current period

NO REPETITION RULE:
- State each fact ONCE in the most relevant section
- allocation_check.issues: allocation problems only
- DO NOT use a separate key_risks array — merge all risks into position_alerts instead
- position_alerts: individual position problems AND portfolio-level risks
- DO NOT repeat "78% equities" in multiple sections

INSIGHT RULE — Connect the dots:
- If newsletters warn about AI bubble AND portfolio holds AI stocks (META, CRWD, NVDA, etc), flag it explicitly: "META and CRWD are exposed to AI bubble warnings from newsletters"
- If newsletters mention sector rotation AND portfolio is heavy in that sector, connect them
- Don't just list bubble warnings — link them to specific holdings

INTELLIGENCE BRIEF INTEGRATION:
- If an Intelligence Brief is provided, treat it as the PRIMARY research signal layer
- Use the brief's key_points, action_items, market_themes, and contrarian_signals to DRIVE reallocation recommendations
- For each action_item in the brief, evaluate whether it should become a trade recommendation (BUY/SELL/TRIM/ADD)
- For each market_theme, assess which positions benefit or are at risk, and recommend reallocation accordingly
- Contrarian signals should inform position sizing: if consensus is crowded, reduce; if contrarian opportunity, consider adding
- The brief's executive_summary should inform the overall portfolio strategy direction
- Explicitly reference the Intelligence Brief when making recommendations: e.g. "Per Intelligence Brief: Mag 7 rotation underway — trim AMZN exposure"

SELL CRITERIA — ONLY these reasons are valid for recommending SELL:
- Allocation breach (position or asset class exceeds limits)
- Intelligence Brief signals (specific research-driven concern)
- Valuation concern (overvalued based on fundamentals)
- Fundamental business problem (declining revenue, cash burn, etc.)
- Do NOT recommend SELL for any documentation-related reason.

STRESS TEST RULE:
- Do NOT generate alerts or warnings about "no stress test in holding period", "no drawdown since purchase", or "tail risk unknown due to no drawdown". These are not actionable.

TRADE RECOMMENDATIONS — REBALANCING RULE:
Return trade_recommendations array with EVERY position PLUS any new BUY recommendations. Format:
- TRIM positions: reduce to a TARGET WEIGHT, do NOT sell to 0% unless the position is fundamentally broken. Calculate shares_to_trade based on bringing the position to target weight.
- SELL positions (full exit): ONLY when a position is fundamentally flawed (e.g. FCF negative confirmed, business deteriorating). Never sell just because allocation is breached — TRIM instead.
- BUY positions: for every € freed up by trims/sells, you MUST recommend where to deploy that cash. Recommend BUY for existing underweight positions or new ETFs that fill allocation gaps. The total_buys in rebalancing_summary should roughly equal total_sells.
- HOLD positions: minimal (just ticker, action, current_shares, "On target" reasoning)
- Use the actual market_value and current_price from the position data to calculate estimated_value — do NOT make up values

CRITICAL CASH RULE: If cash is already above 10%, you must NOT recommend actions that increase cash further without corresponding BUY recommendations. Every rebalancing plan must be CASH NEUTRAL or CASH REDUCING — the goal is to move money from overweight areas to underweight areas, not to pile up more cash.

CRITICAL: The recommended_actions should have COMPLETE reasoning visible, not cut off. Each action needs:
- What to do (specific ticker and shares)
- Why (one clear sentence, referencing Intelligence Brief themes where applicable)
- What it achieves (e.g., "reduces equity to 68%")
- Do NOT include any thesis documentation actions

MARKET SIGNALS RULES:
- Keep market_signals.overall_sentiment to ONE sentence (max 30 words)
- Keep market_signals.bubble_warnings to max 5 bullet points, each max 25 words
- Total market_signals section must be under 200 words
- Use PLAIN, SIMPLE ENGLISH throughout — write as if explaining to a smart friend who is not a finance professional
- Avoid jargon like "multiples stretched past fundamentals", "parabolic highs", "private credit", "pricing hope not disaster"
- Instead say things like: "Some tech stocks are priced too high compared to their actual earnings", "Gold and copper prices rose too fast and are now falling back", "Too much risky lending happening", "Markets are betting everything will go well, ignoring what could go wrong"
- Every bullet point must be immediately understandable without financial expertise

INDUSTRY RECOMMENDATIONS:
- Based on newsletter insights, Intelligence Brief themes, and current market conditions, recommend which industries/sectors to overweight, underweight, or stay neutral on
- Provide 4-8 industry recommendations
- Each must have a clear stance and reasoning tied to current signals

BOND ALLOCATION STRATEGY — MANDATORY (must ALWAYS be included):
- This section is REQUIRED in every analysis response. Never omit bond_recommendations.
- Analyze the user's current bond holdings by duration (short 0-3yr, medium 3-7yr, long 7+yr), geography (US, Europe, Japan, Global), and type (Government/Treasury, Corporate, Inflation-Linked)
- Recommend a target allocation across these dimensions based on: current rate environment, philosophy rules, Intelligence Brief themes, and newsletter insights
- ALWAYS recommend Ireland-domiciled UCITS ETFs (for UAE tax efficiency) — never US-listed bond ETFs
- Consider Malkiel's principles on bond duration and diversification, Taleb's anti-fragility (short duration = more robust), and current macro signals
- Be specific: recommend 2-4 bond ETFs maximum to keep the portfolio simple
- Assess whether current bond holdings are well-diversified or over-concentrated
- If the user only holds one type of bond ETF, recommend diversification with specific alternatives

STOCK PICKS — NEWSLETTER-DRIVEN QUALITY OPPORTUNITIES:
- ONLY recommend stocks that have appeared as STRONG RECOMMENDATIONS in the newsletter insights or Intelligence Brief — do NOT pick stocks based on general market knowledge alone
- A "strong recommendation" means: the stock was explicitly recommended as a buy/add in one or more newsletters, OR it was mentioned positively across multiple newsletter sources with bullish sentiment
- If no stocks meet this criteria from the newsletters, return an empty stock_picks array [] — do NOT fabricate picks
- For qualifying stocks, focus on companies with: strong free cash flow, competitive moats, earnings growth momentum
- Each pick must cite WHICH newsletter(s) or Intelligence Brief theme recommended it (e.g., "Recommended as a BUY in [Newsletter Name]; also mentioned positively in 2 other sources")
- Include a target price or expected return range where possible
- Flag any risks or invalidation triggers for each pick
- The newsletter_mentions field must reflect the ACTUAL count of newsletter sources that mentioned this stock positively
- If a stock is already in the user's portfolio, note that and whether to increase position
- Apply Thorndike capital allocation quality checks: FCF positive, insider buying, capex discipline

JSON structure:
{
  "allocation_check": {
    "equities_percent": number,
    "equities_status": "ok" | "warning" | "critical",
    "bonds_percent": number,
    "bonds_status": "ok" | "warning" | "critical", 
    "commodities_percent": number,
    "commodities_status": "ok" | "warning" | "critical",
    "commodities_breakdown": [
      { "label": "Gold", "percent": 3.2, "positions": ["IGLN", "SGLN"] },
      { "label": "Broad Commodities", "percent": 2.1, "positions": ["CMOD"] },
      { "label": "Copper Miners", "percent": 1.0, "positions": ["COPX"] }
    ],
    "cash_percent": number,
    "stocks_vs_etf_split": "X% stocks / Y% ETFs (WITHIN equities only, must sum to ~100%)",
    "equity_by_geography": [
      { "region": "US", "percent": 35.2, "positions": ["IUQA", "AMZN", "META"], "recommendation": "Near target" },
      { "region": "Europe", "percent": 12.0, "positions": ["IMEU", "III"], "recommendation": "Consider adding" },
      { "region": "Japan", "percent": 8.5, "positions": ["IJPA"], "recommendation": "Newsletters favor Japan — consider increasing" },
      { "region": "Emerging Markets", "percent": 5.0, "positions": ["EIMI", "NDIA"], "recommendation": "On target" },
      { "region": "Global/Diversified", "percent": 20.0, "positions": ["VWRA"], "recommendation": "Core holding" }
    ],
    "equity_by_style": [
      { "style": "Broad Market / Index", "percent": 55.0, "positions": ["VWRA", "IUQA", "IJPA"], "recommendation": "Core allocation on target" },
      { "style": "Quality / Factor", "percent": 5.0, "positions": ["IUQA"], "recommendation": "Consider adding quality tilt" },
      { "style": "Thematic / Sector", "percent": 8.0, "positions": ["COPX"], "recommendation": "Within limits" },
      { "style": "Individual Stocks", "percent": 12.0, "positions": ["AMZN", "META", "MELI"], "recommendation": "Monitor concentration" }
    ],
    "issues": ["allocation issues ONLY - do not repeat elsewhere"]
  },
  "position_alerts": [
    {
      "ticker": "XXX",
      "alert_type": "size" | "thesis" | "sentiment",
      "severity": "warning" | "critical",
      "issue": "specific problem",
      "recent_sentiment": "from newsletters if mentioned",
      "recommendation": "specific action"
    }
  ],
  "thesis_checks": [],
  "market_signals": {
    "bubble_warnings": ["max 5 items, each max 25 words"],
    "consensus_level": "mixed" | "bullish_consensus" | "bearish_consensus",
    "overall_sentiment": "one sentence, max 30 words",
    "portfolio_exposure": "which of YOUR positions are exposed to these signals"
  },
  "industry_recommendations": [
    {
      "industry": "Pharmaceuticals / Healthcare",
      "stance": "overweight" | "underweight" | "neutral",
      "reasoning": "Defensive sector with strong pipeline visibility; newsletters highlight pharma as resilient in late cycle"
    },
    {
      "industry": "Energy",
      "stance": "underweight",
      "reasoning": "Oil demand softening per Intelligence Brief; avoid cyclical exposure at peak"
    }
  ],
  "recommended_actions": [
    {
      "priority": 1,
      "action": "Trim AMZN by 50 shares to reduce US tech concentration",
      "reasoning": "Intelligence Brief flags crowded Mag 7 trade. Reduces equity from 78% to 74%.",
      "confidence": "high",
      "trades_involved": ["AMZN"]
    }
  ],
  "trade_recommendations": [
    {
      "ticker": "IB01",
      "action": "SELL",
      "current_shares": 1364,
      "recommended_shares": 600,
      "shares_to_trade": -764,
      "estimated_value": 38200,
      "current_weight": 14.0,
      "target_weight": 6.0,
      "reasoning": "Bonds overweight at 37% vs max 30%. Trim (not full exit) to bring bonds closer to target.",
      "urgency": "high",
      "thesis_aligned": true
    },
    {
      "ticker": "EIMI",
      "action": "BUY",
      "current_shares": 100,
      "recommended_shares": 250,
      "shares_to_trade": 150,
      "estimated_value": 7500,
      "current_weight": 1.8,
      "target_weight": 4.5,
      "reasoning": "EM equities underweight. Deploy cash from bond trims to increase diversification.",
      "urgency": "medium",
      "thesis_aligned": true
    },
    {
      "ticker": "VWRA",
      "action": "HOLD",
      "current_shares": 920,
      "recommended_shares": 920,
      "shares_to_trade": 0,
      "estimated_value": 157771,
      "current_weight": 31.5,
      "target_weight": 31.5,
      "reasoning": "Core holding, on target",
      "urgency": "low",
      "thesis_aligned": true
    }
  ],
  "rebalancing_summary": {
    "total_sells": "€38,200 across 1 position",
    "total_buys": "€35,000 across 3 positions",
    "net_cash_impact": "+€3,200",
    "primary_goal": "Trim overweight bonds and redeploy into underweight equities to fix allocation breaches"
  },
  "bubble_phase_map": [
    {
      "sector": "US Equities",
      "positions": ["IUQA", "AMZN"],
      "phase": "EUPHORIA",
      "reasoning": "one sentence",
      "action": "Flag for thesis review"
    }
  ],
  "tail_risk_summary": {
    "correlation_clusters": [
      {
        "cluster_name": "Global Equity ETFs",
        "positions": ["IUQA", "IJPA", "IMEU", "EIMI"],
        "risk": "All would fall together in risk-off event despite geographic diversity"
      }
    ],
    "untested_positions": [],
    "fragile_positions": ["tickers with fragile business models"],
    "narrative_risk_positions": ["tickers whose thesis relies on trend continuation"]
  },
  "capital_allocation_flags": [
    {
      "ticker": "AMZN",
      "ceo_type": "ALLOCATOR",
      "fcf_positive": true,
      "buyback_activity": "Active buyback program",
      "capex_vs_revenue": "ok",
      "acquisition_warning": false,
      "notes": "one sentence"
    }
  ],
  "bond_recommendations": {
    "current_bond_percent": 20.5,
    "target_bond_percent": 20,
    "strategy_summary": "1-2 sentence bond strategy based on current macro environment, philosophy rules, and Intelligence Brief themes",
    "duration_allocation": [
      {
        "duration": "Short-term (0-3 years)",
        "current_percent_of_bonds": 70,
        "target_percent_of_bonds": 40,
        "reasoning": "Why this duration weight — reference rate expectations, Taleb anti-fragility, or brief themes"
      },
      {
        "duration": "Medium-term (3-7 years)",
        "current_percent_of_bonds": 0,
        "target_percent_of_bonds": 30,
        "reasoning": "Why add or reduce this bucket"
      },
      {
        "duration": "Long-term (7+ years)",
        "current_percent_of_bonds": 30,
        "target_percent_of_bonds": 30,
        "reasoning": "Why this weight"
      }
    ],
    "geography_allocation": [
      {
        "region": "US Treasuries",
        "target_percent_of_bonds": 30,
        "reasoning": "Why this region"
      },
      {
        "region": "Europe / EUR",
        "target_percent_of_bonds": 40,
        "reasoning": "Why"
      },
      {
        "region": "Global / Diversified",
        "target_percent_of_bonds": 30,
        "reasoning": "Why"
      }
    ],
    "type_split": {
      "government_percent": 70,
      "corporate_percent": 20,
      "inflation_linked_percent": 10,
      "reasoning": "Why this split between govt, corporate, and inflation-linked"
    },
    "recommended_etfs": [
      {
        "ticker": "AGGU",
        "name": "iShares Core Global Aggregate Bond UCITS ETF",
        "duration": "Medium-term",
        "region": "Global",
        "type": "Government + Corporate blend",
        "action": "HOLD" | "BUY" | "INCREASE" | "REDUCE" | "SELL",
        "target_percent_of_bonds": 50,
        "reasoning": "Why this specific ETF — reference duration, geography, and cost"
      }
    ],
    "current_holdings_assessment": [
      {
        "ticker": "IB01",
        "name": "Current bond ETF name",
        "duration": "Short-term",
        "region": "US",
        "type": "Treasury",
        "current_percent_of_bonds": 70,
        "assessment": "Over-concentrated in short duration US treasuries. Consider diversifying into medium-term European or global aggregate."
      }
    ]
  },
  "stock_picks": [
    {
      "ticker": "NVDA",
      "name": "NVIDIA Corporation",
      "sector": "Technology / Semiconductors",
      "thesis": "2-4 sentence investment thesis grounded in newsletter insights and fundamentals",
      "catalysts": ["specific upcoming catalyst 1", "catalyst 2"],
      "risks": ["key risk 1", "key risk 2"],
      "expected_return": "15-25% in 12 months",
      "quality_score": "high",
      "newsletter_mentions": 3,
      "already_held": false,
      "action": "BUY"
    }
  ],
  "cash_assessment": {
    "cash_percent": 5.2,
    "status": "ok",
    "message": "specific Clason-rule assessment",
    "deployment_plan": "noted"
  },
  "portfolio_health_score": number,
  "key_risks": [],
  "summary": "3 sentences. First: biggest allocation or compliance problem. Second: most important Taleb/Kindleberger risk. Third: top action."
}`;

    const bubbleInsights = (insights ?? []).filter((i: any) => i.insight_type === 'bubble_signal');
    const macroInsights = (insights ?? []).filter((i: any) => i.insight_type === 'macro' || i.insight_type === 'macro_view' || i.insight_type === 'market_view');
    const portfolioInsights = (insights ?? []).filter((i: any) =>
      i.tickers_mentioned?.some((t: string) => (positions ?? []).map((p: any) => p.ticker).includes(t))
    );

    const userPrompt = `CURRENT PORTFOLIO:
${JSON.stringify(positions, null, 2)}

CASH BALANCE: $${(cash_balance ?? 0).toFixed(2)}
TOTAL PORTFOLIO VALUE (including cash): $${(total_portfolio_value ?? 0).toFixed(2)}
CASH AS % OF PORTFOLIO: ${total_portfolio_value ? ((cash_balance / total_portfolio_value) * 100).toFixed(1) : 0}%

ACTIVE RULES:
${JSON.stringify(rules, null, 2)}

ETF CLASSIFICATIONS (use these to correctly identify each ETF's asset class when calculating allocation percentages — do not guess based on ticker name):
${JSON.stringify(etf_classifications, null, 2)}

NEWSLETTER INTELLIGENCE (${insights?.length ?? 0} insights from processed newsletters):

BUBBLE & RISK SIGNALS (${bubbleInsights.length}):
${bubbleInsights.map((i: any) => `- [${i.source_name ?? 'Newsletter'}] ${i.content} (sentiment: ${i.sentiment})`).join('\n') || 'None detected'}

MACRO VIEWS (${macroInsights.length}):
${macroInsights.map((i: any) => `- [${i.source_name ?? 'Newsletter'}] ${i.content}`).join('\n') || 'None'}

YOUR PORTFOLIO MENTIONED IN NEWSLETTERS (${portfolioInsights.length}):
${portfolioInsights.map((i: any) => `- [${i.source_name ?? 'Newsletter'}] Tickers: ${i.tickers_mentioned?.join(', ')} — ${i.content} (sentiment: ${i.sentiment})`).join('\n') || 'None'}

RECENT DECISION LOG:
${JSON.stringify(decisions, null, 2)}

${intelligence_brief ? `INTELLIGENCE BRIEF (synthesized from ${intelligence_brief.newsletters_analyzed ?? 0} newsletters, ${intelligence_brief.insights_analyzed ?? 0} insights):
Executive Summary: ${intelligence_brief.executive_summary || "N/A"}

Key Points:
${(intelligence_brief.key_points || []).map((kp: any) => `- [${kp.relevance}] ${kp.title}: ${kp.detail}`).join("\n")}

Action Items from Brief:
${(intelligence_brief.action_items || []).map((ai: any) => `- [${ai.urgency}] ${ai.action} — ${ai.reasoning}`).join("\n")}

Market Themes:
${(intelligence_brief.market_themes || []).map((mt: any) => `- ${mt.theme} (${mt.sentiment}, ${mt.source_count} sources): ${mt.portfolio_impact}`).join("\n")}

Contrarian Signals:
${(intelligence_brief.contrarian_signals || []).map((cs: string) => `- ${cs}`).join("\n")}

USE THIS INTELLIGENCE BRIEF to drive your trade recommendations and reallocation suggestions. Each recommended action should reference specific brief themes where applicable.` : "No Intelligence Brief available — rely on raw insights above."}

${stock_fundamentals && stock_fundamentals.length > 0 ? `STOCK FUNDAMENTALS (AI-estimated metrics for individual stocks — use these for quality assessment, Thorndike checks, and position alerts):
${stock_fundamentals.map((f: any) => `${f.ticker}: ROIC=${f.roic ?? 'N/A'}%, Earnings Yield=${f.earnings_yield ?? 'N/A'}%, P/E=${f.pe_ratio ?? 'N/A'}, D/E=${f.debt_to_equity ?? 'N/A'}, Revenue Growth YoY=${f.revenue_growth_yoy ?? 'N/A'}%, FCF Yield=${f.free_cash_flow_yield ?? 'N/A'}%, Gross Margin=${f.gross_margin ?? 'N/A'}%${f.notes ? ` (${f.notes})` : ''}`).join('\n')}
Use these metrics to:
- Flag stocks with ROIC < 10% or negative FCF yield as potential quality concerns
- Identify high-quality compounders (ROIC > 15%, positive FCF, growing revenue)
- Apply Thorndike capital allocation quality checks using actual data instead of estimates
- Factor earnings yield into valuation assessments for position sizing` : "No stock fundamentals available — recommend the user fetch fundamentals data for better quality assessment."}

IMPORTANT: The allocation percentages (equities_percent, bonds_percent, commodities_percent, cash_percent) must be calculated relative to TOTAL PORTFOLIO VALUE ($${(total_portfolio_value ?? 0).toFixed(2)}), which includes the cash balance of $${(cash_balance ?? 0).toFixed(2)}. Cash percent should reflect this.
CRITICAL: stocks_vs_etf_split must show the split WITHIN equities only (stocks as % of equities, ETFs as % of equities). These two numbers must sum to approximately 100%. Do NOT use total portfolio as the denominator for this field.

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
    
    // OpenAI-compatible format: choices[0].message.content
    const content = aiResponse.choices?.[0]?.message?.content;
    const finishReason = aiResponse.choices?.[0]?.finish_reason;

    if (!content) {
      console.error("Empty AI response:", JSON.stringify(aiResponse));
      return new Response(
        JSON.stringify({ error: "AI returned empty response. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if response was truncated due to max_tokens
    if (finishReason === "length") {
      console.error("AI response was truncated (hit max_tokens limit)");
      return new Response(
        JSON.stringify({ error: "Analysis response was too long and got truncated. Please try again with fewer insights." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("AI Response received:", content.substring(0, 200));

    // Parse the JSON response - handle potential markdown code blocks
    let analysisResult;
    try {
      let jsonString = content.trim();
      // Extract JSON from markdown code blocks or surrounding text
      const jsonBlockMatch = jsonString.match(/```json\s*([\s\S]*?)```/);
      if (jsonBlockMatch) {
        jsonString = jsonBlockMatch[1].trim();
      } else {
        // Try to find raw JSON object in the response
        const firstBrace = jsonString.indexOf('{');
        const lastBrace = jsonString.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonString = jsonString.substring(firstBrace, lastBrace + 1);
        }
      }
      analysisResult = JSON.parse(jsonString);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Raw content (first 500):", content.substring(0, 500));
      throw new Error("Failed to parse AI analysis response");
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
