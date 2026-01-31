import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PriceResult {
  ticker: string;
  current_price: number;
  currency: string;
  price_date: string;
  source: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { tickers } = await req.json() as { tickers: string[] };
    
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return new Response(
        JSON.stringify({ error: "No tickers provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Fetching prices for ${tickers.length} tickers: ${tickers.join(", ")}`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
          },
        ],
        messages: [
          {
            role: "user",
            content: `Search for the current stock/ETF prices for these tickers. Return ONLY valid JSON:
{
  "prices": [
    {
      "ticker": "AAPL",
      "current_price": 235.50,
      "currency": "USD",
      "price_date": "2026-01-31",
      "source": "where you found this price"
    }
  ],
  "not_found": ["any tickers you could not find prices for"]
}

Tickers to look up: ${tickers.join(", ")}

Important:
- Get the most recent closing price or current trading price
- For European-listed ETFs (VWRA, CSPX, IGLN, EIMI, IWDA, etc), get prices in their trading currency (GBP for LSE, EUR for Euronext/Xetra)
- If a ticker trades on multiple exchanges, prefer the London Stock Exchange or Euronext for European ETFs
- For US stocks/ETFs, use USD prices
- Include the date of the price (most recent trading day)
- Always return numeric prices without currency symbols

Return ONLY valid JSON, no markdown or explanation.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402 || errorText.includes("credit balance")) {
        return new Response(
          JSON.stringify({ error: "API credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Price lookup service unavailable", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    
    // Extract text from all content blocks
    const fullResponse = aiResponse.content
      ?.map((item: { type: string; text?: string }) => (item.type === "text" ? item.text : ""))
      .filter(Boolean)
      .join("\n");

    if (!fullResponse) {
      console.error("Empty response from Claude:", JSON.stringify(aiResponse));
      return new Response(
        JSON.stringify({ error: "No response from price lookup service" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON response
    let priceResult;
    try {
      let jsonStr = fullResponse.trim();
      
      // Remove markdown code blocks if present
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.slice(7);
      }
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith("```")) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();

      priceResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse price response:", fullResponse);
      return new Response(
        JSON.stringify({ 
          error: "Could not parse price response",
          raw_response: fullResponse 
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const prices: PriceResult[] = priceResult.prices || [];
    const notFound: string[] = priceResult.not_found || [];

    console.log(`Successfully fetched ${prices.length} prices, ${notFound.length} not found`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        prices,
        not_found: notFound,
        fetched_at: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error fetching prices:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
