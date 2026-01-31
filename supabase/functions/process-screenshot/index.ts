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
      // New multi-image format
      images = body.images;
    } else if (body.imageBase64) {
      // Legacy single image format
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
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing ${images.length} screenshot(s) with Lovable AI...`);

    // Different prompts for single vs multiple images
    const isSingleImage = images.length === 1;
    
    const systemPrompt = isSingleImage
      ? `You are extracting portfolio data from a broker screenshot (likely Interactive Brokers or similar).

Extract all visible positions and return ONLY valid JSON (no markdown, no explanation, no code blocks):
{
  "positions": [
    {
      "ticker": "AAPL",
      "name": "Apple Inc",
      "shares": 100,
      "avg_price": 150.50,
      "current_price": 155.00,
      "market_value": 15500,
      "pnl": 450
    }
  ],
  "cash_balances": {
    "USD": 10000,
    "EUR": 5000
  },
  "total_value": 500000
}

Rules:
- Include ALL visible positions
- Use null for values you cannot clearly read
- Ticker symbols only (no exchange suffixes like .DE or .L)
- Numbers without currency symbols or thousand separators
- If unsure about a value, use null
- For ETFs, try to identify the short ticker (e.g., "VWCE" not "IE00BK5BQT80")
- Return ONLY the JSON object, nothing else`
      : `You are extracting portfolio data from multiple Interactive Brokers screenshots. 
These images are pages from the SAME portfolio view — the full position list did not fit on one screen.

Extract ALL positions across ALL images. Deduplicate if any position appears in more than one image (use the most complete data).

Return ONLY valid JSON (no markdown, no explanation, no code blocks):
{
  "positions": [
    {
      "ticker": "AAPL",
      "name": "Apple Inc",
      "shares": 100,
      "avg_price": 150.50,
      "current_price": 155.00,
      "market_value": 15500,
      "pnl": 450,
      "source_page": 1
    }
  ],
  "cash_balances": {
    "USD": 10000,
    "EUR": 5000
  },
  "total_value": 500000
}

Rules:
- Combine positions from ALL images into one list
- Deduplicate: if same ticker appears twice, keep the row with more data
- Include source_page (1, 2, 3, etc.) indicating which image the position was primarily extracted from
- Use null for values you cannot clearly read
- Ticker symbols only (no exchange suffixes like .DE or .L)
- Numbers without currency symbols or thousand separators
- If unsure about a value, use null
- For ETFs, try to identify the short ticker (e.g., "VWCE" not "IE00BK5BQT80")
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
      
      // Add page label for multi-image
      if (!isSingleImage) {
        userContent.push({
          type: "text",
          text: `[This is Page ${index + 1} of ${images.length}]`,
        });
      }
    });
    
    // Add final instruction
    userContent.push({
      type: "text",
      text: isSingleImage
        ? "Extract all portfolio positions from this broker screenshot. Return only valid JSON."
        : `Extract all portfolio positions from these ${images.length} broker screenshots. Combine and deduplicate positions. Return only valid JSON with source_page for each position.`,
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
        max_tokens: 8192, // Increased for multi-image responses
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
    console.log("AI response received");

    const content = aiResponse.choices?.[0]?.message?.content;
    if (!content) {
      console.error("No content in AI response:", aiResponse);
      return new Response(
        JSON.stringify({ error: "AI returned empty response", raw: JSON.stringify(aiResponse) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to parse the JSON from the response
    let extractedData;
    try {
      // Clean up the response - remove markdown code blocks if present
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
          error: "Could not parse extracted data. Please try with clearer screenshots.",
          raw: content 
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate the structure
    if (!extractedData.positions || !Array.isArray(extractedData.positions)) {
      return new Response(
        JSON.stringify({ 
          error: "Invalid data structure. No positions array found.",
          raw: content 
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully extracted ${extractedData.positions.length} positions from ${images.length} image(s)`);

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
