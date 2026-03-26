import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ETFToClassify {
  ticker: string;
  name?: string;
}

interface Classification {
  ticker: string;
  full_name: string;
  issuer: string;
  tracks: string;
  category: "equity" | "bond" | "commodity" | "gold" | "country" | "theme";
  sub_category: string;
  geography: string;
  is_broad_market: boolean;
  asset_class_details: string;
  expense_ratio: number | null;
  classification_reasoning: string;
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

    const { etfs, forceReclassify = false } = await req.json() as { 
      etfs: ETFToClassify[];
      forceReclassify?: boolean;
    };

    if (!etfs || !Array.isArray(etfs) || etfs.length === 0) {
      return new Response(
        JSON.stringify({ error: "No ETFs provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Classification service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check cache for existing classifications (30-day threshold)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let etfsToClassify = etfs;
    const cachedResults: Classification[] = [];

    if (!forceReclassify) {
      const { data: cachedData } = await supabase
        .from("etf_metadata")
        .select("*")
        .in("ticker", etfs.map(e => e.ticker))
        .gte("classified_at", thirtyDaysAgo.toISOString());

      if (cachedData && cachedData.length > 0) {
        const cachedTickers = new Set(cachedData.map(c => c.ticker));
        etfsToClassify = etfs.filter(e => !cachedTickers.has(e.ticker));
        
        cachedResults.push(...cachedData.map(c => ({
          ticker: c.ticker,
          full_name: c.full_name || "",
          issuer: c.issuer || "",
          tracks: c.tracks || "",
          category: c.category as Classification["category"],
          sub_category: c.sub_category || "",
          geography: c.geography || "",
          is_broad_market: c.is_broad_market || false,
          asset_class_details: c.asset_class_details || "",
          expense_ratio: c.expense_ratio,
          classification_reasoning: "Cached result",
        })));
      }
    }

    // If all are cached, return early
    if (etfsToClassify.length === 0) {
      console.log(`All ${etfs.length} ETFs found in cache`);
      return new Response(
        JSON.stringify({ 
          success: true, 
          classifications: cachedResults,
          fromCache: cachedResults.length,
          classified: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Classifying ${etfsToClassify.length} ETFs using Claude web search...`);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20251001",
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
            content: `Classify these ETFs. For each one, search the web to find what it tracks and categorize it.

ETFs to classify:
${JSON.stringify(etfsToClassify)}

For EACH ETF, return:
{
  "classifications": [
    {
      "ticker": "VWRA",
      "full_name": "Vanguard FTSE All-World UCITS ETF",
      "issuer": "Vanguard",
      "tracks": "FTSE All-World Index",
      "category": one of: "equity" | "bond" | "commodity" | "gold" | "country" | "theme",
      "sub_category": more specific classification,
      "geography": "global" | "us" | "europe" | "japan" | "india" | "emerging_markets" | "other",
      "is_broad_market": true or false,
      "asset_class_details": "what it actually holds",
      "expense_ratio": 0.22 or null,
      "classification_reasoning": "why this category"
    }
  ]
}

Classification rules:
- "equity": tracks a stock index (S&P 500, MSCI World, etc)
- "bond": tracks government or corporate bonds, treasuries, fixed income
- "commodity": tracks a basket of commodities or commodity producers
- "gold": specifically tracks gold price or gold miners
- "country": focused on a single country (not broad regions)
- "theme": sector-specific or thematic (cybersecurity, clean energy, etc)

is_broad_market should be true for:
- Total world / all-world funds (VWRA, VT)
- S&P 500 trackers (CSPX, SPY, VOO)
- Total US market (VTI)
- MSCI World trackers
- Broad regional (MSCI Europe, MSCI Pacific)

is_broad_market should be false for:
- Single country funds (India, Japan, Brazil)
- Sector/thematic funds
- Commodity funds
- Narrow bond funds

Return ONLY valid JSON.`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Claude API error:", response.status, errorText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Classification failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Extract text from all content blocks
    const fullResponse = data.content
      .map((item: { type: string; text?: string }) => (item.type === "text" ? item.text : ""))
      .filter(Boolean)
      .join("\n");

    if (!fullResponse) {
      return new Response(
        JSON.stringify({ error: "No response from classification service" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON response
    let classifications: Classification[];
    try {
      const clean = fullResponse.replace(/```json|```/g, "").trim();
      // Find the JSON object in the response
      const jsonMatch = clean.match(/\{[\s\S]*"classifications"[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No valid JSON found in response");
      }
      const parsed = JSON.parse(jsonMatch[0]);
      classifications = parsed.classifications || [];
    } catch (parseError) {
      console.error("Failed to parse classification response:", fullResponse);
      return new Response(
        JSON.stringify({ 
          error: "Failed to parse classification results",
          raw: fullResponse 
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save classifications to cache
    for (const classification of classifications) {
      const { error: upsertError } = await supabase
        .from("etf_metadata")
        .upsert({
          ticker: classification.ticker,
          full_name: classification.full_name,
          issuer: classification.issuer,
          tracks: classification.tracks,
          category: classification.category,
          sub_category: classification.sub_category,
          geography: classification.geography,
          is_broad_market: classification.is_broad_market,
          asset_class_details: classification.asset_class_details,
          expense_ratio: classification.expense_ratio,
          classified_at: new Date().toISOString(),
        }, { onConflict: "ticker" });

      if (upsertError) {
        console.error(`Failed to cache classification for ${classification.ticker}:`, upsertError);
      }
    }

    // Combine cached and new classifications
    const allClassifications = [...cachedResults, ...classifications];

    console.log(`Successfully classified ${classifications.length} ETFs, ${cachedResults.length} from cache`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        classifications: allClassifications,
        fromCache: cachedResults.length,
        classified: classifications.length
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error classifying ETFs:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
