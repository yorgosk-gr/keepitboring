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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { positions, rules, insights, decisions } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are an investment analyst applying a specific philosophy. Analyze this portfolio.

PHILOSOPHY SUMMARY:
- Margin of safety is paramount
- 80% passive ETFs / 20% selective stocks
- Position limits: single stock max 8%, themed ETF max 15%, sector max 25%
- Quality: prefer high ROIC and earnings yield
- Think probabilistically, not in certainties
- Process > outcomes; avoid resulting
- Watch for bubble signals and crowded trades
- Beliefs are hypotheses, not identities

You MUST respond with valid JSON only, no other text. The JSON must match this exact structure:
{
  "allocation_check": {
    "stocks_percent": number,
    "stocks_status": "ok" | "warning" | "critical",
    "etfs_percent": number,
    "etfs_status": "ok" | "warning" | "critical",
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

    console.log("Calling Lovable AI Gateway...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "API credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Empty response from AI");
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
