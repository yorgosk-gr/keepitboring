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

    const systemPrompt = `You are an investment analyst applying a specific philosophy. Analyze this portfolio.

PHILOSOPHY SUMMARY:
- Margin of safety is paramount
- ASSET CLASS TARGETS (by total portfolio value):
  • Equities max 70% (this includes BOTH individual stocks AND equity ETFs like VWRA, CSPX, IMID, IMEU, NDIA, IJPA, IBZL, GRE1, XDWH, CBUX, EIMI, and all individual stocks)
  • Bonds max 20% (bond ETFs like IDTM, IB01)
  • Commodities + Gold + Crypto max 10% (CMOD, COPX, IGLN, and any crypto positions)
  • Cash: remainder
- STOCK vs ETF SPLIT: within the equities allocation, target 15-25% individual stocks and 75-85% ETFs
- Position limits: single stock max 8%, themed ETF max 15%, sector max 25%
- Quality: prefer high ROIC and earnings yield
- Think probabilistically, not in certainties
- Process > outcomes; avoid resulting
- Watch for bubble signals and crowded trades
- Beliefs are hypotheses, not identities

You MUST respond with valid JSON only, no other text. The JSON must match this exact structure:
{
  "allocation_check": {
    "equities_percent": number,
    "equities_status": "ok" | "warning" | "critical",
    "bonds_percent": number,
    "bonds_status": "ok" | "warning" | "critical",
    "commodities_percent": number,
    "commodities_status": "ok" | "warning" | "critical",
    "cash_percent": number,
    "stocks_vs_etf_split": "e.g. 18% stocks / 82% ETFs within equities",
    "issues": ["list of allocation issues"]
  },
  "position_alerts": [
    {
      "ticker": "XXX",
      "alert_type": "size" | "quality" | "thesis" | "sentiment",
      "severity": "warning" | "critical",
      "issue": "description",
      "recent_sentiment": "bullish/bearish/neutral from newsletters",
      "recommendation": "specific action"
    }
  ],
  "thesis_checks": [
    {
      "ticker": "XXX",
      "has_thesis": true/false,
      "has_invalidation": true/false,
      "bet_type_declared": true/false,
      "confidence_set": true/false,
      "days_since_review": number
    }
  ],
  "market_signals": {
    "bubble_warnings": ["any bubble language found"],
    "consensus_level": "mixed" | "bullish_consensus" | "bearish_consensus",
    "overall_sentiment": "description"
  },
  "recommended_actions": [
    {
      "priority": number,
      "action": "specific action",
      "reasoning": "why this action",
      "confidence": "high" | "medium" | "low"
    }
  ],
  "portfolio_health_score": number between 1-100,
  "key_risks": ["risk 1", "risk 2"],
  "summary": "2-3 sentence overall assessment"
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
        max_tokens: 8192,
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

    if (!content) {
      console.error("Empty AI response:", JSON.stringify(aiResponse));
      return new Response(
        JSON.stringify({ error: "AI returned empty response. Please try again." }),
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
