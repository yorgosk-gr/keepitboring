import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ImageData {
  base64: string;
  mimeType: string;
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

    const body = await req.json();
    
    // Support both single image (legacy) and multiple images
    let images: ImageData[] = [];
    
    if (body.images && Array.isArray(body.images)) {
      images = body.images;
    } else if (body.imageBase64) {
      images = [{ base64: body.imageBase64, mimeType: body.mimeType || "image/png" }];
    }
    
    if (images.length === 0) {
      return new Response(
        JSON.stringify({ error: "No images provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${images.length} screenshot(s) with Lovable AI...`);

    const isSingleImage = images.length === 1;
    
    // IBKR-focused prompt with clear column identification
    const systemPrompt = `You are extracting portfolio data from Interactive Brokers (IBKR) mobile app screenshots.

IBKR MOBILE APP COLUMNS (left to right):
1. **Instrument** — ticker in bold + exchange code in small grey text below (e.g. "LSEETF", "NASDAQ.NMS", "NYSE", "LSE", "AEB", "SBF", "IBIS2", "ASX")
2. **Avg Price** — average cost per share. This is the PER-SHARE cost, NOT total cost.
3. **Cst Bss** — total cost basis (= avg_price × shares). May appear in green or red. May show "K" suffix (e.g. "157.7K" = 157,700). IGNORE this column for pricing — use Avg Price instead.
4. **Cur** — trading currency (USD, GBP, EUR, AUD). This column may or may not be visible depending on the user's scroll position.
5. **Position** — number of shares/units held. May show "K" suffix (e.g. "2.18K" = 2,180, "5.00K" = 5,000, "1.93K" = 1,930).
6. **P&L** — unrealized profit/loss. CAN BE NEGATIVE (shown in red). Often partially cut off on the right edge.

The columns may vary depending on how the user has configured the view. Sometimes **Mkt Val** (market value) is visible instead of or in addition to other columns. If Mkt Val is visible, it shows total position value (= shares × current_price), and may be truncated with "..." on the right.

CALCULATING CURRENT PRICE:
The mobile app typically does NOT show a "current price" column. Calculate it:
  current_price = avg_price + (pnl / shares)
Or if Mkt Val is visible:
  current_price = market_value / shares
If P&L is cut off or unreadable, set current_price = avg_price as a fallback and mark needs_verification: true.

CALCULATING MARKET VALUE:
  market_value = shares × current_price
If Mkt Val is visible in the screenshot, use that value and cross-check against shares × current_price.

CRITICAL — DECIMAL PRECISION:
IBKR shows prices with full decimal precision. The "." is ALWAYS a decimal point, NEVER a thousands separator:
- "738.0537" = seven hundred thirty-eight point zero five three seven ≈ 738
- "175.0894" = one hundred seventy-five point zero nine ≈ 175
- "299.4440" = two hundred ninety-nine point forty-four ≈ 299
- "27.7889" = twenty-seven point seventy-nine ≈ 28
- "9.575" = nine point five eight ≈ 10
- "5.402" = five point four zero ≈ 5
- "2.3499" = two point thirty-five ≈ 2
These are NEVER in the thousands. A value of 738.0537 means approximately $738, NOT $738,054.

CRITICAL — GBP PENCE HANDLING:
Some LSE-listed stocks (NOT ETFs) are priced in GBP pence, not pounds.
How to detect: the Cur column shows "GBP", the exchange is "LSE" (not "LSEETF"), and the avg_price seems disproportionately large compared to the cost basis.

Example: III (3i Group) — exchange "LSE", currency "GBP", avg_price 3118.50
- 3118.50 is in PENCE. Divide by 100 → £31.185 per share.
- Cost basis 4,268 ÷ 100 shares = £42.68 per share? No — 3118.50p × 100 = £3,118.50 cost basis. The Cst Bss confirms this.
- For the output: report avg_price as 31.185 (pounds, not pence), currency as "GBP"
- Calculate current_price in pounds too: current_price = avg_price_in_pounds + (pnl / shares)

DO NOT apply pence conversion to LSEETF positions — those are already in whole currency units (USD).

CRITICAL — "K" SUFFIX:
The letter K means ×1,000:
- Position column: "2.18K" = 2,180 shares, "5.00K" = 5,000, "1.93K" = 1,930
- Cst Bss column: "157.7K" = 157,700, "13.3K" = 13,300
- Cash balances: "13.3K" = 13,300, "13.8K" = 13,800

CRITICAL — DEDUPLICATION:
When multiple screenshot pages are provided, positions WILL overlap between pages. The user scrolls down and takes another screenshot, so some positions appear on both pages.
- If the same ticker appears on multiple pages, include it ONLY ONCE.
- Use the instance with the most complete/readable data.
- Mark source_page as the page where you got the best reading.

EXCHANGE CODE → EXCHANGE + CURRENCY MAPPING:
- "NASDAQ.NMS" or "NASDAQ.SCM" → exchange: "NASDAQ", currency: "USD"
- "NYSE" → exchange: "NYSE", currency: "USD"
- "LSEETF" → exchange: "LSE", currency: "USD" (UCITS ETFs on LSE trade in USD)
- "LSE" (without ETF) → exchange: "LSE", currency: "GBP" (UK stocks, often in pence — see pence rules above)
- "AEB" → exchange: "EURONEXT", currency: "EUR" (Amsterdam)
- "SBF" → exchange: "EURONEXT", currency: "EUR" (Paris)
- "IBIS2" → exchange: "XETRA", currency: "EUR"
- "ASX" → exchange: "ASX", currency: "AUD"

If the Cur column is visible, ALWAYS use it — it overrides the mapping above.

STOCK vs ETF CLASSIFICATION:
- Exchange label "LSEETF" → always ETF
- Exchange label "NASDAQ.NMS", "NYSE", "LSE", "ASX" → usually stock (unless name contains ETF/UCITS/Index)
- Exchange label "SBF" with ticker GRE1 → ETF (Amundi MSCI Greece)
- Exchange label "AEB" → could be either; check if name contains ETF indicators
- ETF name indicators: iShares, Vanguard, SPDR, Xtrackers, Amundi, WisdomTree, Invesco, ETF, UCITS, Index, Tracker

CATEGORY:
- equity: stock index ETFs (VWRA, CSPX, EIMI, IMEU, IMID), individual stocks (AAPL, AMZN, META, etc.)
- bond: treasury/fixed income ETFs (IDTM, IB01)
- commodity: commodity ETFs (CMOD, COPX)
- gold: gold/precious metal ETFs (IGLN)
- country: single-country ETFs (NDIA=India, IJPA=Japan, IBZL=Brazil, GRE1=Greece)
- theme: sector/thematic ETFs (XDWH, CBUX=infrastructure)

CASH BALANCES:
IBKR shows cash at the bottom of the position list:
- "AUD Cash ... 501.19" → AUD: 501.19
- "EUR Cash ... 0.41" → EUR: 0.41
- "USD Cash ... 13.3K" → USD: 13300
- "Total Cash ... 13.8K" → ignore (it's the sum)
Extract individual currency balances into cash_balances. Do NOT include "Total Cash".

TOTAL PORTFOLIO VALUE:
Look for "Net Liquidation Value" at the top of the first screenshot. Extract this number as total_value.

VALIDATION — CHECK EVERY ROW:
1. avg_price must be positive and reasonable for the security type
2. shares must be positive
3. market_value = shares × current_price (calculate this yourself, don't trust truncated Mkt Val)
4. If avg_price looks like thousands but Cst Bss ÷ shares ≈ avg_price, you're reading the decimal wrong
5. For GBP pence stocks: after conversion, avg_price should be in the tens, not thousands

FINAL CROSS-CHECK:
Sum all position market_values + total cash. Compare to Net Liquidation Value from the top of the screenshot.
If your sum differs by more than 10%, you have errors — review positions with largest market_value first.
The Net Liquidation Value in these screenshots is typically around 500,000-510,000.

${!isSingleImage ? `MULTI-PAGE INSTRUCTIONS: These are ${images.length} pages from the SAME portfolio view. The user scrolled and took multiple screenshots, so there WILL be overlapping positions. Deduplicate — include each ticker only once. Cash balances typically appear only on the last page.` : ""}

CRITICAL — ALL VALUES MUST BE PLAIN NUMBERS:
Every numeric field (shares, avg_price, current_price, market_value, pnl) must be a plain number literal.
Do NOT use arithmetic expressions like "205.34 + (478.2 / 96)" or "4157 / 1". Calculate the result yourself and write the final number.
WRONG: "current_price": 205.34 + (478.2 / 96)
CORRECT: "current_price": 210.32

Return ONLY valid JSON (no markdown, no code blocks, no explanation):
{
  "detected_broker": "Interactive Brokers",
  "detected_currency": "mixed",
  "extraction_quality": "good" or "partial" or "poor",
  "positions": [
    {
      "ticker": "AAPL",
      "name": "Apple Inc",
      "isin": null,
      "shares": 61,
      "avg_price": 258.80,
      "current_price": 259.62,
      "market_value": 15837,
      "pnl": 50.02,
      "pnl_percent": null,
      "exchange": "NASDAQ",
      "currency": "USD",
      "position_type": "stock",
      "category": "equity",
      "needs_verification": false,
      "source_page": 1
    }
  ],
  "cash_balances": { "AUD": 501.19, "EUR": 0.41, "USD": 13300 },
  "total_value": 509737,
  "extraction_notes": "any issues or ambiguities"
}`;

    // Build the content array with all images
    const userContent: Array<{ type: string; image_url?: { url: string }; text?: string }> = [];
    
    images.forEach((img, index) => {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${img.mimeType || "image/png"};base64,${img.base64}`,
        },
      });
      
      if (!isSingleImage) {
        userContent.push({
          type: "text",
          text: `[Page ${index + 1} of ${images.length}]`,
        });
      }
    });
    
    userContent.push({
      type: "text",
      text: isSingleImage
        ? "Extract all portfolio positions from this broker screenshot. Identify the broker if possible. Return only valid JSON."
        : `Extract all portfolio positions from these ${images.length} broker screenshots. Combine and deduplicate. Identify the broker if possible. Return only valid JSON with source_page for each position.`,
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20251001",
        system: systemPrompt,
          messages: [{ role: "user", content: userContent }],
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
        JSON.stringify({ error: "AI processing failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text;
    
    if (!content) {
      return new Response(
        JSON.stringify({ error: "AI returned empty response", raw: JSON.stringify(aiResponse) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let extractedData;
    try {
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) {
        cleanContent = cleanContent.slice(7);
      }
      if (cleanContent.startsWith("```")) {
        cleanContent = cleanContent.slice(3);
      }
      if (cleanContent.endsWith("```")) {
        cleanContent = cleanContent.slice(0, -3);
      }
      cleanContent = cleanContent.trim();
      
      // Sanitize: AI sometimes returns arithmetic expressions instead of plain numbers.
      // Replace patterns like `: 205.34 + (478.2 / 96)` or `: 4157 / 1` with evaluated results.
      cleanContent = cleanContent.replace(
        /:\s*([\d.]+\s*[+\-*/]\s*[\d.(/)\s*+\-*/]+)/g,
        (match, expr) => {
          try {
            // Only evaluate if it looks like simple arithmetic (digits, operators, parens, spaces)
            if (/^[\d.+\-*/() \t]+$/.test(expr.trim())) {
              const result = Function(`"use strict"; return (${expr.trim()})`)();
              if (typeof result === "number" && isFinite(result)) {
                return `: ${Math.round(result * 10000) / 10000}`;
              }
            }
          } catch { /* fall through */ }
          return match;
        }
      );
      
      extractedData = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", content);
      return new Response(
        JSON.stringify({ 
          error: "Could not parse extracted data. Please try with a clearer screenshot.",
          raw: content 
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate and normalize the response
    if (!extractedData.positions || !Array.isArray(extractedData.positions)) {
      // Check if extraction quality is poor
      if (extractedData.extraction_quality === "poor") {
        return new Response(
          JSON.stringify({ 
            error: "Could not extract positions. The screenshot appears blurry or unreadable. Please upload a clearer image.",
            extraction_notes: extractedData.extraction_notes,
            raw: content 
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          error: "Invalid data structure. No positions array found.",
          raw: content 
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Ensure all positions have the required flags
    extractedData.positions = extractedData.positions.map((pos: Record<string, unknown>, index: number) => ({
      ...pos,
      needs_verification: pos.needs_verification ?? false,
      source_page: pos.source_page ?? 1,
      id: `extracted-${index}`,
    }));

    console.log(`Successfully extracted ${extractedData.positions.length} positions from ${images.length} image(s). Broker: ${extractedData.detected_broker || 'Unknown'}`);

    return new Response(
      JSON.stringify({ 
        success: true,
        data: extractedData
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing screenshot:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
