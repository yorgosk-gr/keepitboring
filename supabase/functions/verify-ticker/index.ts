import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PositionToVerify {
  ticker: string;
  name?: string | null;
  isin?: string | null;
  shares?: number | null;
  current_price?: number | null;
  market_value?: number | null;
}

interface VerifiedPosition {
  original_ticker: string;
  verified_ticker: string;
  name: string;
  asset_type: "stock" | "etf";
  category: "equity" | "bond" | "commodity" | "gold" | "country" | "theme";
  exchange: string;
  currency: string;
  current_price: number | null;
  verification_status: "confirmed" | "corrected" | "uncertain";
  notes: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { positions } = await req.json() as { positions: PositionToVerify[] };
    
    if (!positions || !Array.isArray(positions) || positions.length === 0) {
      return new Response(
        JSON.stringify({ error: "No positions provided for verification" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "API key required. Please configure your Anthropic API key to use ticker verification." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cache for recently verified tickers
    const tickers = positions.map(p => p.ticker);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: cachedData } = await supabase
      .from("verification_cache")
      .select("*")
      .in("ticker", tickers)
      .gte("verified_at", twentyFourHoursAgo);

    const cachedTickers = new Map<string, VerifiedPosition>();
    if (cachedData) {
      for (const cached of cachedData) {
        cachedTickers.set(cached.ticker, cached.verified_data as VerifiedPosition);
      }
    }

    // Filter out cached positions
    const positionsToVerify = positions.filter(p => !cachedTickers.has(p.ticker));
    
    // If all positions are cached, return immediately
    if (positionsToVerify.length === 0) {
      console.log("All positions found in cache");
      const verifiedPositions = positions.map(p => cachedTickers.get(p.ticker)!);
      return new Response(
        JSON.stringify({ 
          success: true, 
          verified_positions: verifiedPositions,
          from_cache: true 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Verifying ${positionsToVerify.length} positions with Claude web search...`);

    const MAX_RETRIES = 3;
    const BACKOFF_MS = [5000, 10000, 20000];
    let response: Response | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      response = await fetch("https://api.anthropic.com/v1/messages", {
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
              content: `Verify these portfolio positions. For each one, confirm or correct the ticker symbol and fill in any missing data.

Positions to verify:
${JSON.stringify(positionsToVerify, null, 2)}

For EACH position, search the web and return:
{
  "verified_positions": [
    {
      "original_ticker": "what was extracted",
      "verified_ticker": "correct ticker after verification",
      "name": "full company/ETF name",
      "asset_type": "stock" or "etf",
      "category": "equity" | "bond" | "commodity" | "gold" | "country" | "theme",
      "exchange": "primary exchange",
      "currency": "trading currency",
      "current_price": latest price if found (number or null),
      "verification_status": "confirmed" | "corrected" | "uncertain",
      "notes": "any relevant context"
    }
  ]
}

Specific things to check:
- Is this ticker valid and actively traded?
- If an ISIN was provided, does it match the ticker?
- For ETFs: what does it track? Classify as equity/bond/commodity/gold/country/theme
- For stocks: what sector? Is it a real operating company?
- If the original ticker seems wrong, what is the correct one?
- Get the latest price if possible

Return ONLY valid JSON, no markdown or explanation.`,
            },
          ],
        }),
      });

      if (response.ok) break;

      if (response.status === 429 && attempt < MAX_RETRIES) {
        const wait = BACKOFF_MS[attempt];
        console.warn(`Rate limited (attempt ${attempt + 1}/${MAX_RETRIES + 1}), retrying in ${wait / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, wait));
        continue;
      }

      // Non-429 error or final retry exhausted
      break;
    }

    if (!response || !response.ok) {
      const errorText = response ? await response.text() : "No response";
      console.error("Anthropic API error after retries:", response?.status, errorText);

      // Return uncertain fallbacks instead of crashing
      const fallbacks: VerifiedPosition[] = positionsToVerify.map(p => ({
        original_ticker: p.ticker,
        verified_ticker: p.ticker,
        name: p.name || "Unknown",
        asset_type: "stock" as const,
        category: "equity" as const,
        exchange: "Unknown",
        currency: "USD",
        current_price: p.current_price || null,
        verification_status: "uncertain" as const,
        notes: "Verification failed after retries",
      }));

      const allWithCached: VerifiedPosition[] = positions.map(p => {
        const cached = cachedTickers.get(p.ticker);
        if (cached) return cached;
        return fallbacks.find(f => f.original_ticker === p.ticker) || fallbacks[0];
      });

      return new Response(
        JSON.stringify({ success: true, verified_positions: allWithCached, partial: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        JSON.stringify({ error: "No response from verification service" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON response
    let verificationResult;
    try {
      // Try to extract JSON from the response
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

      verificationResult = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse verification response:", fullResponse);
      return new Response(
        JSON.stringify({ 
          error: "Could not parse verification response",
          raw_response: fullResponse 
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const verifiedPositions: VerifiedPosition[] = verificationResult.verified_positions || [];

    // Cache the newly verified positions
    for (const verified of verifiedPositions) {
      await supabase
        .from("verification_cache")
        .upsert({
          ticker: verified.original_ticker,
          verified_data: verified,
          verified_at: new Date().toISOString(),
        }, { onConflict: "ticker" });
    }

    // Combine cached and newly verified positions
    const allVerified: VerifiedPosition[] = positions.map(p => {
      const cached = cachedTickers.get(p.ticker);
      if (cached) return cached;
      
      const verified = verifiedPositions.find(v => v.original_ticker === p.ticker);
      if (verified) return verified;
      
      // Fallback for positions that weren't verified
      return {
        original_ticker: p.ticker,
        verified_ticker: p.ticker,
        name: p.name || "Unknown",
        asset_type: "stock" as const,
        category: "equity" as const,
        exchange: "Unknown",
        currency: "USD",
        current_price: p.current_price || null,
        verification_status: "uncertain" as const,
        notes: "Could not verify this position",
      };
    });

    console.log(`Successfully verified ${verifiedPositions.length} positions`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        verified_positions: allVerified,
        cached_count: cachedTickers.size,
        verified_count: verifiedPositions.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error verifying positions:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
