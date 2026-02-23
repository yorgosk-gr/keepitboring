import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { tickers } = await req.json();

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return new Response(
        JSON.stringify({ error: "tickers array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const tickerList = tickers.join(", ");

    const prompt = `You are a financial data assistant. For each of the following stock tickers, provide the most recent available fundamental metrics. Use your training data for the best estimates.

Tickers: ${tickerList}

For EACH ticker, return:
- roic: Return on Invested Capital (%, number only)
- earnings_yield: Earnings Yield (%, number only) 
- pe_ratio: Price-to-Earnings ratio (number only)
- debt_to_equity: Debt-to-Equity ratio (number only)
- revenue_growth_yoy: Year-over-year revenue growth (%, number only)
- free_cash_flow_yield: Free Cash Flow Yield (%, number only)
- gross_margin: Gross Margin (%, number only)
- data_quality: "estimated" or "approximate" - be honest about data freshness

If a metric is not applicable (e.g., for a holding company), set it to null and explain in the notes field.

Return ONLY valid JSON in this exact format, no markdown fences:
{
  "fundamentals": {
    "TICKER1": {
      "roic": 15.2,
      "earnings_yield": 5.8,
      "pe_ratio": 17.2,
      "debt_to_equity": 0.45,
      "revenue_growth_yoy": 12.3,
      "free_cash_flow_yield": 4.5,
      "gross_margin": 42.0,
      "data_quality": "estimated",
      "notes": "Any relevant notes about data quality or special considerations"
    }
  }
}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a financial data lookup tool. Return only valid JSON." },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI Gateway error:", errText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    let parsed;
    try {
      // Try direct parse
      parsed = JSON.parse(content);
    } catch {
      // Try extracting from markdown fences
      const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) {
        parsed = JSON.parse(fenceMatch[1].trim());
      } else {
        // Try finding JSON object with brace matching
        const firstBrace = content.indexOf("{");
        const lastBrace = content.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1) {
          parsed = JSON.parse(content.substring(firstBrace, lastBrace + 1));
        } else {
          throw new Error("Could not extract JSON from AI response");
        }
      }
    }

    const fundamentals = parsed.fundamentals || parsed;

    return new Response(
      JSON.stringify({ fundamentals }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error fetching fundamentals:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
