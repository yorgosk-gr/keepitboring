import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${images.length} screenshot(s) with Lovable AI...`);

    const isSingleImage = images.length === 1;
    
    // Broker-agnostic prompt that handles any brokerage format
    const systemPrompt = `You are extracting portfolio positions from brokerage screenshots.

These could be from ANY broker (Interactive Brokers, Degiro, Trading 212, Schwab, Fidelity, eToro, Revolut, TD Ameritrade, Robinhood, or any other platform).

Different brokers display data differently. Adapt to whatever format you see:
- Some show ticker symbols, others show full company names
- Some show average cost, others show total cost basis
- Some show P&L in currency, others in percentage, others both
- Some use USD, others EUR, GBP, or mixed currencies
- Column order varies by broker

${!isSingleImage ? `These are ${images.length} pages from the SAME portfolio view — the full position list did not fit on one screen. Combine and deduplicate positions across all pages.` : ""}

Extract ALL positions you can identify. For each position, provide as much data as you can find.

IMPORTANT - TICKER IDENTIFICATION:
- If you see a company name but no ticker (e.g., 'Apple Inc'), provide the standard ticker symbol (AAPL)
- If you see an ISIN code, map it to the common ticker if you know it
- If you see an ETF name (e.g., 'Vanguard FTSE All-World'), provide the most common ticker (VWRA for European, VT for US)
- If you are unsure of the ticker, put your best guess and add 'needs_verification': true
- For regional listings, note the exchange if visible

HANDLING UNCLEAR DATA:
- If the screenshot is blurry or unreadable, set 'extraction_quality': 'poor' and explain in extraction_notes
- If you can only extract partial data, extract what you can see clearly
- If you see duplicate tickers, include both with different source_page values

Return ONLY valid JSON (no markdown, no code blocks):
{
  "detected_broker": "Interactive Brokers" or "Degiro" or "Trading 212" or "Unknown",
  "detected_currency": "EUR" or "USD" or "GBP" or "mixed",
  "extraction_quality": "good" or "partial" or "poor",
  "positions": [
    {
      "ticker": "AAPL",
      "name": "Apple Inc",
      "isin": "US0378331005" or null,
      "shares": 100,
      "avg_price": 150.50 or null,
      "current_price": 155.00 or null,
      "market_value": 15500 or null,
      "pnl": 450 or null,
      "pnl_percent": 2.5 or null,
      "currency": "USD" or null,
      "needs_verification": false,
      "source_page": 1
    }
  ],
  "cash_balances": {
    "USD": 10000
  } or null,
  "total_value": 500000 or null,
  "extraction_notes": "Any issues, ambiguities, or notes about the extraction"
}

Rules:
- Use null for values you cannot clearly read
- Ticker symbols only in the ticker field (no exchange suffixes like .DE or .L)
- Numbers without currency symbols or thousand separators
- Set needs_verification: true for any ticker you're not 100% confident about
- Include source_page (1, 2, 3...) for multi-image extractions
- Always try to detect the broker from UI elements, logos, or layout
- Return ONLY the JSON object, nothing else`;

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
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
        JSON.stringify({ error: "AI processing failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;
    
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
