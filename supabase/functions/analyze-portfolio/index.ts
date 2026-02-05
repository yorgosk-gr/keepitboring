import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const { positions, rules, insights, decisions } = await req.json();

    const systemPrompt = `You are a portfolio analyst. Be BRIEF and DIRECT. No fluff.

ALLOCATION TARGETS:
- Equities (stocks + equity ETFs): max 70%
- Bonds: max 20%
- Commodities + Gold + Crypto: max 10%
- Within equities: 15-25% stocks, 75-85% ETFs
- Single stock max: 8%
- Themed ETF max: 15%

ANALYSIS RULES:
1. Lead with problems. If allocation is fine, say "OK" — don't elaborate.
2. Only flag positions that actually need action. Don't mention positions that are fine.
3. For trade recommendations: ONLY recommend trades for positions that are oversized, have no thesis, or have invalidated thesis. Mark everything else as HOLD with minimal reasoning.
4. Keep reasoning to ONE sentence max.
5. Don't repeat information. If you flag something in allocation_check, don't repeat it in position_alerts.
6. Prioritize ruthlessly: critical issues first, then warnings. Skip minor observations.

TRADE RECOMMENDATIONS:
- SELL: only if oversized, thesis invalidated, or hard rule breach
- BUY: only if underweight vs target and cash available
- HOLD: everything else (keep reasoning to 3-5 words like "On target" or "Thesis intact")

For HOLD positions, use minimal fields:
{ "ticker": "VWRA", "action": "HOLD", "current_shares": 920, "recommended_shares": 920, "shares_to_trade": 0, "estimated_value": 157771, "current_weight": 31.5, "target_weight": 31.5, "reasoning": "Core position, on target", "urgency": "low", "thesis_aligned": true }

Only provide detailed reasoning for SELL or BUY recommendations.

You MUST respond with valid JSON only. Structure:
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
    "issues": ["ONLY list actual problems, not observations"]
  },
  "position_alerts": [
    {
      "ticker": "XXX",
      "alert_type": "size" | "thesis" | "sentiment",
      "severity": "warning" | "critical",
      "issue": "one sentence max",
      "recent_sentiment": "bullish/bearish/neutral",
      "recommendation": "specific action"
    }
  ],
  "thesis_checks": [
    {
      "ticker": "XXX",
      "has_thesis": boolean,
      "has_invalidation": boolean,
      "bet_type_declared": boolean,
      "confidence_set": boolean,
      "days_since_review": number
    }
  ],
  "market_signals": {
    "bubble_warnings": ["only explicit bubble language from newsletters"],
    "consensus_level": "mixed" | "bullish_consensus" | "bearish_consensus",
    "overall_sentiment": "one sentence max"
  },
  "recommended_actions": [
    {
      "priority": 1,
      "action": "specific trade with ticker and shares",
      "reasoning": "one sentence",
      "confidence": "high" | "medium" | "low",
      "trades_involved": ["SELL 50 CSPX"]
    }
  ],
  "trade_recommendations": [...],
  "rebalancing_summary": {
    "total_sells": "€X",
    "total_buys": "€X",
    "net_cash_impact": "+/-€X",
    "primary_goal": "one sentence"
  },
  "portfolio_health_score": 1-100,
  "key_risks": ["max 3 risks, one sentence each"],
  "summary": "2 sentences max. Lead with the #1 issue or 'Portfolio healthy' if no issues."
}`;

    const userPrompt = `CURRENT PORTFOLIO:
${JSON.stringify(positions, null, 2)}

ACTIVE RULES:
${JSON.stringify(rules, null, 2)}

RECENT INSIGHTS (30 days):
${JSON.stringify(insights, null, 2)}

RECENT DECISION LOG:
${JSON.stringify(decisions, null, 2)}

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
