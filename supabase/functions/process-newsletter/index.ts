import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { newsletterId, rawText } = await req.json();

    if (!newsletterId || !rawText) {
      return new Response(
        JSON.stringify({ error: "Missing newsletterId or rawText" }),
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

    // Create Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Processing newsletter ${newsletterId}, text length: ${rawText.length}`);

    // Truncate text if too long (keep first 50k chars for context window)
    const truncatedText = rawText.length > 50000 ? rawText.substring(0, 50000) + "\n\n[Text truncated...]" : rawText;

    const systemPrompt = `You are an expert financial analyst extracting structured insights from investment newsletters.

Analyze the newsletter text and return ONLY valid JSON (no markdown, no explanation, no code blocks):
{
  "stock_mentions": [
    {
      "ticker": "AAPL",
      "sentiment": "bullish",
      "summary": "Brief summary of the view",
      "confidence_language": ["strong buy", "conviction"]
    }
  ],
  "macro_views": [
    {
      "topic": "inflation",
      "view": "Summary of the view",
      "sentiment": "bullish"
    }
  ],
  "sector_views": [
    {
      "sector": "technology",
      "view": "Summary",
      "sentiment": "bullish"
    }
  ],
  "bubble_signals": [
    {
      "phrase": "exact quote",
      "context": "surrounding context"
    }
  ],
  "overall_sentiment": "bullish",
  "key_takeaways": ["takeaway 1", "takeaway 2"]
}

Rules:
- sentiment must be exactly "bullish", "bearish", or "neutral"
- topic must be one of: "inflation", "rates", "growth", "recession", "other"
- Identify stock tickers accurately (use standard symbols like AAPL, MSFT, etc.)
- For bubble_signals, flag phrases like: "new paradigm", "this time is different", "can't lose", "guaranteed", "easy money", excessive optimism
- confidence_language should capture phrases indicating conviction level
- Return ONLY the JSON object, nothing else
- If no items for a category, use empty array []`;

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
          {
            role: "user",
            content: `Analyze this investment newsletter and extract insights:\n\n${truncatedText}`,
          },
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
      console.error("No content in AI response:", aiResponse);
      return new Response(
        JSON.stringify({ error: "AI returned empty response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse the JSON response
    let insights;
    try {
      let cleanContent = content.trim();
      if (cleanContent.startsWith("```json")) cleanContent = cleanContent.slice(7);
      if (cleanContent.startsWith("```")) cleanContent = cleanContent.slice(3);
      if (cleanContent.endsWith("```")) cleanContent = cleanContent.slice(0, -3);
      cleanContent = cleanContent.trim();
      insights = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Could not parse AI response", raw: content }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Parsed insights:", JSON.stringify(insights).substring(0, 500));

    // Delete existing insights for this newsletter (in case of reprocessing)
    await supabase.from("insights").delete().eq("newsletter_id", newsletterId);

    // Insert insights into database
    const insightsToInsert = [];

    // Stock mentions
    for (const stock of insights.stock_mentions || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: "stock_mention",
        content: stock.summary,
        sentiment: stock.sentiment,
        tickers_mentioned: [stock.ticker],
        confidence_words: stock.confidence_language || [],
      });
    }

    // Macro views
    for (const macro of insights.macro_views || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: `macro_${macro.topic}`,
        content: macro.view,
        sentiment: macro.sentiment,
        tickers_mentioned: [],
        confidence_words: [],
      });
    }

    // Sector views
    for (const sector of insights.sector_views || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: `sector_${sector.sector}`,
        content: sector.view,
        sentiment: sector.sentiment,
        tickers_mentioned: [],
        confidence_words: [],
      });
    }

    // Bubble signals
    for (const bubble of insights.bubble_signals || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: "bubble_signal",
        content: `"${bubble.phrase}" - ${bubble.context}`,
        sentiment: "bearish", // Bubble signals are warnings
        tickers_mentioned: [],
        confidence_words: [],
      });
    }

    // Key takeaways
    for (const takeaway of insights.key_takeaways || []) {
      insightsToInsert.push({
        newsletter_id: newsletterId,
        insight_type: "key_takeaway",
        content: takeaway,
        sentiment: insights.overall_sentiment || "neutral",
        tickers_mentioned: [],
        confidence_words: [],
      });
    }

    if (insightsToInsert.length > 0) {
      const { error: insertError } = await supabase.from("insights").insert(insightsToInsert);
      if (insertError) {
        console.error("Failed to insert insights:", insertError);
        return new Response(
          JSON.stringify({ error: "Failed to save insights" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Mark newsletter as processed
    const { error: updateError } = await supabase
      .from("newsletters")
      .update({ processed: true })
      .eq("id", newsletterId);

    if (updateError) {
      console.error("Failed to update newsletter:", updateError);
    }

    console.log(`Successfully processed newsletter ${newsletterId}, inserted ${insightsToInsert.length} insights`);

    return new Response(
      JSON.stringify({
        success: true,
        insights_count: insightsToInsert.length,
        overall_sentiment: insights.overall_sentiment,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing newsletter:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
