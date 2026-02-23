import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function formatRules(rules: any[]): string {
  if (!rules || rules.length === 0) return "No custom rules — use sensible defaults (60% equity, 25% bonds, 15% commodities)";
  return rules.map((r: any) => {
    let line = "- " + r.name;
    if (r.description) line += ": " + r.description;
    if (r.threshold_min != null) line += " (min: " + r.threshold_min + "%)";
    if (r.threshold_max != null) line += " (max: " + r.threshold_max + "%)";
    if (r.rule_type) line += " [type: " + r.rule_type + "]";
    return line;
  }).join("\n");
}

function formatBrief(brief: any): string {
  if (!brief) return "No intelligence brief available — use strategic allocation only.";
  const parts: string[] = [];
  parts.push("INTELLIGENCE BRIEF (use this to inform tactical tilts):");
  parts.push("Executive Summary: " + (brief.executive_summary || "N/A"));
  if (brief.key_points && brief.key_points.length > 0) {
    parts.push("\nKey Points:");
    for (const kp of brief.key_points) {
      parts.push("- [" + kp.relevance + "] " + kp.title + ": " + kp.detail);
    }
  }
  if (brief.market_themes && brief.market_themes.length > 0) {
    parts.push("\nMarket Themes:");
    for (const mt of brief.market_themes) {
      parts.push("- " + mt.theme + " (" + mt.sentiment + "): " + mt.portfolio_impact);
    }
  }
  if (brief.contrarian_signals && brief.contrarian_signals.length > 0) {
    parts.push("\nContrarian Signals:");
    for (const cs of brief.contrarian_signals) {
      parts.push("- " + cs);
    }
  }
  parts.push("\nUse these signals to adjust tactical weights.");
  return parts.join("\n");
}

function formatPositions(positions: any[]): string {
  if (!positions || positions.length === 0) return "";
  return positions.map((p: any) => {
    return "- " + p.ticker + " (" + (p.name || "Unknown") + "): " +
      (p.shares || 0) + " shares, $" + ((p.market_value || 0).toFixed(0)) +
      " (" + ((p.weight_percent || 0).toFixed(1)) + "%), category: " + (p.category || "unknown") +
      ", type: " + (p.position_type || "unknown");
  }).join("\n");
}

function formatAnalysis(analysis: any): string {
  if (!analysis) return "";
  const parts: string[] = [];
  parts.push("Health Score: " + (analysis.portfolio_health_score || "N/A") + "/100");
  parts.push("Summary: " + (analysis.summary || "N/A"));

  if (analysis.allocation_check) {
    const a = analysis.allocation_check;
    parts.push("\nCurrent Allocation:");
    parts.push("- Equities: " + (a.equities_percent || 0).toFixed(1) + "% (" + (a.equities_status || "ok") + ")");
    parts.push("- Bonds: " + (a.bonds_percent || 0).toFixed(1) + "% (" + (a.bonds_status || "ok") + ")");
    parts.push("- Commodities: " + (a.commodities_percent || 0).toFixed(1) + "% (" + (a.commodities_status || "ok") + ")");
    parts.push("- Cash: " + (a.cash_percent || 0).toFixed(1) + "%");
  }

  if (analysis.industry_recommendations && analysis.industry_recommendations.length > 0) {
    parts.push("\nIndustry Recommendations from Analysis:");
    for (const rec of analysis.industry_recommendations) {
      parts.push("- " + rec.stance.toUpperCase() + " " + rec.industry + ": " + rec.reasoning);
    }
  }

  if (analysis.trade_recommendations && analysis.trade_recommendations.length > 0) {
    const nonHold = analysis.trade_recommendations.filter((t: any) => t.action !== "HOLD");
    if (nonHold.length > 0) {
      parts.push("\nActive Trade Recommendations:");
      for (const tr of nonHold) {
        parts.push("- " + tr.action + " " + tr.ticker + ": " + tr.reasoning);
      }
    }
  }

  return parts.join("\n");
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { rules, intelligence_brief, mode, positions, analysis, portfolio_value } = await req.json();
    const budget = portfolio_value && portfolio_value > 0 ? Math.round(portfolio_value) : 100000;
    const budgetFormatted = "$" + budget.toLocaleString("en-US");
    const isAdjustMode = mode === "adjust" && positions && positions.length > 0;

    const modeContext = isAdjustMode ? [
      "",
      "MODE: ADJUST CURRENT PORTFOLIO",
      "The investor already holds positions. Your job is to recommend an IDEAL TARGET allocation that:",
      "- Accounts for what they already own (don't recommend ETFs they already hold at target weight)",
      "- Identifies GAPS in their current portfolio (missing asset classes, geographies, etc.)",
      "- Highlights OVERLAPS with their current holdings",
      "- Suggests what to ADD to reach the ideal, not rebuild from scratch",
      "- In the strategy_summary, explain how this complements their existing portfolio",
      "",
      "CURRENT POSITIONS:",
      formatPositions(positions),
      "",
      ...(analysis ? ["LATEST ANALYSIS RESULTS:", formatAnalysis(analysis), ""] : []),
    ] : [
      "",
      "MODE: CLEAN SLATE",
      "Build an ideal portfolio from scratch, ignoring any existing holdings.",
      "",
    ];

    const systemPrompt = [
      "You are an expert portfolio construction advisor specializing in tax-efficient investing for non-US residents.",
      "",
      "CONTEXT:",
      "- The investor is a UAE tax resident (0% income tax, 0% capital gains tax)",
      "- To avoid US withholding tax on dividends (30% for non-treaty countries), prefer Ireland-domiciled UCITS ETFs",
      "- Ireland has a 15% treaty rate with the US, making Irish-domiciled ETFs the most tax-efficient choice",
      "- Budget: " + budgetFormatted + " to allocate",
      "",
      "ASSET CLASS CONSTRAINTS:",
      "- Individual stocks: ~10% of portfolio (the investor manages stock picks separately)",
      "- Commodities (gold, broad commodities): 5-8% of portfolio",
      "- Cash reserve: 5-10% of portfolio",
      "- The remaining ~72-80% should be split between equity ETFs and bond ETFs per philosophy rules",
      "- Your ETF recommendations should account for these reserves — allocate only the ETF portion (" + budgetFormatted + " minus stock/cash reserves)",
      "",
      "INVESTMENT PHILOSOPHY RULES:",
      formatRules(rules),
      "",
      ...modeContext,
      "REQUIREMENTS:",
      "1. Recommend exactly 6 to 10 ETFs",
      "2. All ETFs MUST be Ireland-domiciled UCITS ETFs (traded on London Stock Exchange, Euronext, or Xetra)",
      "3. Use real, existing ETF tickers (e.g., VWRA, IGLA, AGGU, IGLN, EIMI, etc.)",
      "4. Cover equity (global, regional), bonds, and commodities",
      "5. Each ETF must have a brief explanation (1-2 sentences) covering why it's chosen",
      "6. Allocations must sum to the ETF portion of " + budgetFormatted + " (after reserving ~10% stocks, 5-8% commodities, 5-10% cash)",
      "7. Respect the philosophy rules for allocation limits STRICTLY — check every min/max threshold",
      "",
      "OVERLAP & CONCENTRATION RULES (CRITICAL):",
      "- AVOID HIDDEN OVERLAP: If you include a broad global ETF (e.g. VWRA which is ~65% US, ~30% tech), do NOT also add US-only or US tech ETFs on top — this creates hidden concentration",
      "- Calculate EFFECTIVE exposure: e.g. 30% VWRA + 10% CSPX + 10% ISPY = ~40% effective US exposure, not 30% global + 10% US + 10% tech",
      "- Total effective US equity exposure should not exceed 40% of portfolio",
      "- Total effective tech sector exposure should not exceed 15% of portfolio",
      "- If bubble signals exist for a sector, REDUCE exposure to that sector, do not add tactical tilts into it",
      "",
      "COMMODITIES RULE:",
      "- Total commodities allocation (gold, gold miners, broad commodities combined) must respect the philosophy rules max — typically 10-15%",
      "- Do NOT split gold into physical + miners to circumvent the limit — they count together",
      "- Prefer ONE gold ETF (physical gold like IGLN or SGLN), not both miners and physical",
      "",
      "BOND DIVERSIFICATION RULE:",
      "- Bonds allocation should be at LEAST 20% of portfolio (unless philosophy rules specify otherwise)",
      "- Include BOTH short-duration AND intermediate/aggregate bond ETFs for proper duration diversification",
      "- Do not rely solely on short-term treasuries — add aggregate bonds (e.g. AGGU, IGLA) or investment-grade corporate bonds",
      "- Consider the current rate environment when weighting short vs intermediate duration",
      "",
      "GEOGRAPHIC DIVERSIFICATION:",
      "- If using a global ETF as core, complement with underrepresented regions (Europe, Japan, EM) rather than doubling down on US",
      "- Avoid more than 2 ETFs with significant US overlap",
      "",
      formatBrief(intelligence_brief),
      "",
      'Return a JSON object with this EXACT structure:',
      '{',
      '  "etfs": [',
      '    {',
      '      "ticker": "VWRA",',
      '      "name": "Vanguard FTSE All-World UCITS ETF (Acc)",',
      '      "asset_class": "Equity",',
      '      "sub_category": "Global",',
      '      "domicile": "Ireland",',
      '      "exchange": "LSE",',
      '      "amount_usd": 25000,',
      '      "percent": 25.0,',
      '      "expense_ratio": 0.22,',
      '      "explanation": "Core global equity holding."',
      '    }',
      '  ],',
      '  "strategy_summary": "2-3 sentences explaining the overall allocation strategy.",',
      '  "tax_note": "1-2 sentences about tax efficiency for a UAE resident."',
      '}',
    ].join("\n");

    const userMessage = isAdjustMode
      ? "Generate the ideal " + budgetFormatted + " ETF portfolio that complements my current holdings. Account for gaps and overlaps. Reserve ~10% for individual stocks, 5-8% for commodities, and 5-10% for cash. Return only the JSON object."
      : "Generate the ideal " + budgetFormatted + " portfolio allocation using Ireland-domiciled UCITS ETFs. Reserve ~10% for individual stocks, 5-8% for commodities, and 5-10% for cash. Return only the JSON object.";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + LOVABLE_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI analysis failed." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    let content = aiData.choices?.[0]?.message?.content || "";
    content = content.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const result = JSON.parse(content);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ideal-allocation error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
