import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function buildAllocationTargets(rules: any[]): string {
  if (!rules || rules.length === 0) return "(No custom rules defined — use defaults below)";
  return rules.map((r: any) => {
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

    const { positions, rules, insights, decisions, cash_balance, total_portfolio_value } = await req.json();

    const systemPrompt = `You are a strict portfolio compliance officer. Your job is to find problems and give specific fixes.

SCORING RULES (be harsh):
- Start at 100
- Each CRITICAL issue: -20 points (allocation breach, missing thesis on stock)
- Each WARNING: -10 points (near limit, stale review)
- Each stock without thesis: -5 points
- Minimum score: 10

Example: 78% equities (breach) = -20, one stock no thesis = -20, two stocks no invalidation = -10 each. Score = 100 - 20 - 20 - 10 - 10 = 40.

ALLOCATION TARGETS (from user's active philosophy rules):
${buildAllocationTargets(rules)}
If the user has not defined specific allocation rules, use these defaults:
- Equities (stocks + equity ETFs): max 70%
- Bonds: max 20%
- Commodities + Gold + Crypto: max 10%
- Within equities: 15-25% stocks, 75-85% ETFs
- Single stock: max 8%
Always prioritize the user's custom rules over the defaults above.

NO REPETITION RULE:
- State each fact ONCE in the most relevant section
- allocation_check.issues: allocation problems only
- key_risks: portfolio-level risks, not allocation (that's already covered)
- position_alerts: individual position problems
- DO NOT repeat "78% equities" in multiple sections

INSIGHT RULE — Connect the dots:
- If newsletters warn about AI bubble AND portfolio holds AI stocks (META, CRWD, NVDA, etc), flag it explicitly: "META and CRWD are exposed to AI bubble warnings from newsletters"
- If newsletters mention sector rotation AND portfolio is heavy in that sector, connect them
- Don't just list bubble warnings — link them to specific holdings

THESIS COMPLIANCE:
- List ALL individual stocks, not just ones with problems
- Show pass/fail for each

TRADE RECOMMENDATIONS:
Return trade_recommendations array with EVERY position. Format:
- SELL positions: full detail with reasoning
- BUY positions: full detail with reasoning  
- HOLD positions: minimal (just ticker, action, current_shares, "On target" reasoning)

CRITICAL: The recommended_actions should have COMPLETE reasoning visible, not cut off. Each action needs:
- What to do (specific ticker and shares)
- Why (one clear sentence)
- What it achieves (e.g., "reduces equity to 68%")

JSON structure:
{
  "allocation_check": {
    "equities_percent": number,
    "equities_status": "ok" | "warning" | "critical",
    "bonds_percent": number,
    "bonds_status": "ok" | "warning" | "critical", 
    "commodities_percent": number,
    "commodities_status": "ok" | "warning" | "critical",
    "cash_percent": number,
    "stocks_vs_etf_split": "X% stocks / Y% ETFs",
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
  "thesis_checks": [
    {
      "ticker": "META",
      "has_thesis": false,
      "has_invalidation": false,
      "bet_type_declared": true,
      "confidence_set": false,
      "days_since_review": 999
    }
  ],
  "market_signals": {
    "bubble_warnings": ["direct quotes from newsletters"],
    "consensus_level": "mixed" | "bullish_consensus" | "bearish_consensus",
    "overall_sentiment": "one sentence",
    "portfolio_exposure": "which of YOUR positions are exposed to these signals"
  },
  "recommended_actions": [
    {
      "priority": 1,
      "action": "SELL 3127 TEA (~€X)",
      "reasoning": "No thesis documented. Philosophy requires thesis for all stocks. Proceeds reduce equity allocation.",
      "confidence": "high",
      "trades_involved": ["SELL 3127 TEA"]
    }
  ],
  "trade_recommendations": [
    {
      "ticker": "TEA",
      "action": "SELL",
      "current_shares": 3127,
      "recommended_shares": 0,
      "shares_to_trade": -3127,
      "estimated_value": 5000,
      "current_weight": 1.0,
      "target_weight": 0,
      "reasoning": "No thesis. Must exit per philosophy rules.",
      "urgency": "high",
      "thesis_aligned": false
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
    "total_sells": "€X across N positions",
    "total_buys": "€0",
    "net_cash_impact": "+€X",
    "primary_goal": "Reduce equity from 78% to 70% and exit positions without thesis"
  },
  "portfolio_health_score": number,
  "key_risks": [
    "AI/tech exposure (META, CRWD) vulnerable to bubble correction per newsletter signals",
    "No invalidation criteria on any position increases drawdown risk"
  ],
  "summary": "2 sentences. First: biggest problem. Second: top action."
}`;

    const userPrompt = `CURRENT PORTFOLIO:
${JSON.stringify(positions, null, 2)}

CASH BALANCE: $${(cash_balance ?? 0).toFixed(2)}
TOTAL PORTFOLIO VALUE (including cash): $${(total_portfolio_value ?? 0).toFixed(2)}
CASH AS % OF PORTFOLIO: ${total_portfolio_value ? ((cash_balance / total_portfolio_value) * 100).toFixed(1) : 0}%

ACTIVE RULES:
${JSON.stringify(rules, null, 2)}

RECENT INSIGHTS (30 days):
${JSON.stringify(insights, null, 2)}

RECENT DECISION LOG:
${JSON.stringify(decisions, null, 2)}

IMPORTANT: The allocation percentages must be calculated relative to TOTAL PORTFOLIO VALUE ($${(total_portfolio_value ?? 0).toFixed(2)}), which includes the cash balance of $${(cash_balance ?? 0).toFixed(2)}. Cash percent should reflect this.

Analyze this portfolio and return the JSON response.`;

    console.log("Calling Lovable AI gateway for portfolio analysis...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 16384,
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
      // Remove markdown code blocks if present
      if (jsonString.startsWith("```json")) {
        jsonString = jsonString.slice(7);
      } else if (jsonString.startsWith("```")) {
        jsonString = jsonString.slice(3);
      }
      if (jsonString.endsWith("```")) {
        jsonString = jsonString.slice(0, -3);
      }
      analysisResult = JSON.parse(jsonString.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Raw content:", content);
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
