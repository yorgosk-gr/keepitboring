import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

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
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");

    // Allow service-role calls (e.g. from ingest-email or cron-tasks) — trusted server-to-server
    const isServiceRole = token === supabaseKey;
    let userId: string | null = null;

    if (isServiceRole) {
      // Service role: userId will be read from the newsletter row itself
      userId = null;
    } else {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      userId = user.id;
    }

    const { newsletterId, rawText } = await req.json();

    if (!newsletterId || !rawText) {
      return new Response(
        JSON.stringify({ error: "Missing newsletterId or rawText" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing newsletter ${newsletterId}, text length: ${rawText.length}`);

    // Verify newsletter ownership: for user-initiated calls, ensure the newsletter belongs to the caller.
    // For service-role calls (ingest-email, cron), read the owner from the row.
    const ownerQuery = await supabase
      .from("newsletters")
      .select("user_id")
      .eq("id", newsletterId)
      .maybeSingle();

    if (!ownerQuery.data) {
      return new Response(
        JSON.stringify({ error: "Newsletter not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isServiceRole && userId && ownerQuery.data.user_id !== userId) {
      return new Response(
        JSON.stringify({ error: "Forbidden — you do not own this newsletter" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Acquire processing lock — prevents duplicate processing from concurrent calls
    // Also clears any previous error so the UI shows "Pending" during retry
    const lockCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: lockResult } = await supabase
      .from("newsletters")
      .update({ processing_started_at: new Date().toISOString(), processing_error: null })
      .eq("id", newsletterId)
      .eq("user_id", ownerQuery.data.user_id)
      .or(`processing_started_at.is.null,processing_started_at.lt.${lockCutoff}`)
      .select("id")
      .maybeSingle();

    if (!lockResult) {
      console.log(`Newsletter ${newsletterId} is already being processed, skipping`);
      return new Response(
        JSON.stringify({ error: "Newsletter is already being processed", already_processing: true }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Release lock helper
    const releaseLock = async () => {
      await supabase
        .from("newsletters")
        .update({ processing_started_at: null })
        .eq("id", newsletterId);
    };

    // Write error to DB and release lock in one update
    const writeError = async (errorMessage: string) => {
      await supabase
        .from("newsletters")
        .update({ processing_error: errorMessage, processing_started_at: null })
        .eq("id", newsletterId);
    };

    try {

    const truncatedText = rawText.length > 50000 ? rawText.substring(0, 50000) + "\n\n[Text truncated...]" : rawText;

    const systemPrompt = `You are an expert financial analyst extracting structured insights from investment newsletters.

Analyze the newsletter text and return ONLY valid JSON (no markdown, no explanation, no code blocks):
{
  "source_profile": {
    "name": "inferred newsletter name if detectable",
    "author": "author or writer name if detectable, or null",
    "publication_date": "date the newsletter was written in YYYY-MM-DD format if detectable, or null",
    "style": "macro|equity|quant|generalist",
    "confidence_score": 0.8,
    "confidence_rationale": "specific data cited, named sources, track record signals vs vague opinion"
  },
  "stock_mentions": [
    {
      "ticker": "AAPL",
      "sentiment": "bullish",
      "summary": "what the newsletter actually says about this stock",
      "confidence_language": ["strong buy", "high conviction"],
      "management_tone": "positive|negative|neutral|mixed|not_mentioned",
      "guidance_revision": "raised|lowered|maintained|initiated|not_mentioned",
      "earnings_surprise": "beat|miss|in_line|not_mentioned",
      "claim_specificity": "high|medium|low",
      "data_backed": true,
      "catalyst": "specific catalyst mentioned, or null"
    }
  ],
  "macro_views": [
    {
      "topic": "inflation|rates|growth|recession|other",
      "view": "what the newsletter says",
      "sentiment": "bullish|bearish|neutral",
      "conviction_level": "high|medium|low",
      "is_consensus_view": true,
      "supporting_data": "specific data point or named source cited, or null"
    }
  ],
  "sector_views": [
    {
      "sector": "technology",
      "view": "summary",
      "sentiment": "bullish|bearish|neutral",
      "conviction_level": "high|medium|low"
    }
  ],
  "country_views": [
    {
      "country": "Japan",
      "view": "summary",
      "sentiment": "bullish|bearish|neutral",
      "etf_proxy": "EWJ",
      "conviction_level": "high|medium|low"
    }
  ],
  "sector_tilts": [
    {
      "sector": "Energy",
      "direction": "overweight|underweight|neutral",
      "reasoning": "one sentence",
      "conviction": "high|medium|low"
    }
  ],
  "stock_ideas": [
    {
      "ticker": "OXY",
      "name": "Occidental Petroleum",
      "sentiment": "bullish|bearish|neutral",
      "thesis": "one sentence why",
      "claim_specificity": "high|medium|low",
      "catalyst": "specific catalyst or null"
    }
  ],
  "bubble_signals": [
    {
      "phrase": "exact quote",
      "context": "surrounding context",
      "severity": "high|medium|low"
    }
  ],
  "overall_sentiment": "bullish|bearish|neutral",
  "overall_conviction": "high|medium|low",
  "key_takeaways": ["takeaway 1", "takeaway 2"],
  "notable_omissions": ["topic conspicuously absent that peers typically cover"]
}

EXTRACTION RULES:
- management_tone: infer from earnings call language, CEO commentary, forward guidance tone — not_mentioned if absent
- guidance_revision: explicit forward guidance changes only — raised/lowered/maintained/initiated — not_mentioned if not discussed
- earnings_surprise: only populate if earnings results are actually discussed — not_mentioned otherwise
- source_profile.confidence_score: 0.0–1.0. High (≥0.8) = specific data, price targets, named sources, cited studies. Medium (0.5–0.79) = directional with reasoning. Low (<0.5) = vague claims, no data, excessive hedging or certainty without basis
- claim_specificity: high = price targets or specific dates or hard data; medium = directional with reasoning; low = vague directional opinion
- data_backed: true only if a specific statistic, study, or named source is cited in support
- is_consensus_view: true if the view is conventional wisdom broadly held — false if it is differentiated or contrarian
- notable_omissions: what major topics does this letter conspicuously ignore? (e.g. a macro letter silent on China, an equity letter ignoring rates)
- Return ONLY the JSON object, nothing else
- Empty array [] for any category with no items`;

    // Retry wrapper for Anthropic API calls
    async function callAnthropicWithRetry(body: object, maxRetries = 2): Promise<Response> {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });

        if (response.ok) return response;

        // Don't retry on auth/billing errors
        if (response.status === 401 || response.status === 402 || response.status === 403) {
          return response;
        }

        // Retry on rate limit (429) and server errors (5xx)
        if (attempt < maxRetries && (response.status === 429 || response.status >= 500)) {
          const delay = response.status === 429 ? 5000 * (attempt + 1) : 2000 * (attempt + 1);
          console.log(`Anthropic returned ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        return response;
      }
      throw new Error("Unreachable");
    }

    const response = await callAnthropicWithRetry({
      model: "claude-sonnet-4-5-20250929",
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Analyze this investment newsletter and extract insights:\n\n${truncatedText}`,
        },
      ],
      max_tokens: 16384,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);

      if (response.status === 429) {
        await writeError("Rate limit exceeded. Please try again in a moment.");
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment.", retry_after_seconds: 30 }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "30" } }
        );
      }
      if (response.status === 402) {
        await writeError("AI credits exhausted.");
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      await writeError(`AI processing failed (HTTP ${response.status}).`);
      return new Response(
        JSON.stringify({ error: "AI processing failed. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.content?.[0]?.text;
    const finishReason = aiResponse.stop_reason;

    if (!content) {
      console.error("No content in AI response:", aiResponse);
      await writeError("AI returned empty response.");
      return new Response(
        JSON.stringify({ error: "AI returned empty response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (finishReason === "max_tokens") {
      console.error("AI response truncated (finish_reason: length)");
      await writeError("Newsletter too long for single-pass processing.");
      return new Response(
        JSON.stringify({ error: "Newsletter generated too many insights for a single pass. Please try reprocessing." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let insights;
    try {
      let jsonString = content.trim();
      // Strip markdown code blocks
      if (jsonString.includes("```json")) {
        jsonString = jsonString.split("```json")[1].split("```")[0];
      } else if (jsonString.includes("```")) {
        jsonString = jsonString.split("```")[1].split("```")[0];
      }
      jsonString = jsonString.trim();

      // If it doesn't start with {, try to find the JSON object
      if (!jsonString.startsWith("{")) {
        const firstBrace = jsonString.indexOf("{");
        const lastBrace = jsonString.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace > firstBrace) {
          jsonString = jsonString.substring(firstBrace, lastBrace + 1);
        }
      }

      try {
        insights = JSON.parse(jsonString);
      } catch {
        // Normalize smart quotes and whitespace, then retry
        const cleaned = jsonString
          .replace(/[\u201C\u201D]/g, '"')
          .replace(/[\u2018\u2019]/g, "'")
          .replace(/\r?\n/g, " ")
          .replace(/\s+/g, " ");
        insights = JSON.parse(cleaned);
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", content.substring(0, 1000));
      await writeError("Could not parse AI response.");
      return new Response(
        JSON.stringify({ error: "Could not parse AI response", raw: content.substring(0, 500) }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Parsed insights:", JSON.stringify(insights).substring(0, 500));

    // Delete existing insights for this newsletter (in case of reprocessing)
    await supabase.from("insights").delete().eq("newsletter_id", newsletterId);

    const sourceConfidence = insights.source_profile?.confidence_score ?? 0.5;

    // ── Quality scoring (1–5) ─────────────────────────────────────────────────
    // Scores each insight on specificity, data-backing, and conviction.
    // Score 1 = auto-excluded from brief (pure filler). Users can override any score.
    const FILLER_PATTERNS = [
      /markets? (are|remain[s]?) volatile/i,
      /uncertainty remains/i,
      /mixed signals/i,
      /it'?s? hard to (say|predict|know)/i,
      /we (will|shall) see/i,
      /time will tell/i,
      /proceed with caution/i,
    ];
    const isFiller = (text: string) => FILLER_PATTERNS.some((r) => r.test(text ?? ""));

    function scoreInsight(
      type: string,
      meta: Record<string, any>,
      content: string,
    ): number {
      let s = 2; // baseline — directional claim with no supporting data
      switch (type) {
        case "stock_mention":
          if (meta.data_backed) s += 1;
          if (meta.claim_specificity === "high") s += 1;
          if (meta.catalyst) s += 1;
          if (meta.claim_specificity === "low") s -= 1;
          break;
        case "macro":
          if (meta.conviction_level === "high") s += 1;
          if (meta.supporting_data) s += 1;
          if (meta.is_consensus_view) s -= 1; // consensus = lower edge value
          break;
        case "recommendation":
          if (meta.conviction_level === "high") s += 1;
          if (meta.conviction_level === "low") s -= 1;
          break;
        case "bubble_signal":
          s = 3; // inherently specific
          if (meta.severity === "high") s += 1;
          if (meta.severity === "low") s -= 1;
          break;
        case "sentiment":
          // key takeaways are narrative summaries — moderately useful
          s = 2;
          if (meta.overall_conviction === "high") s += 1;
          break;
      }
      if (isFiller(content)) s -= 1;
      return Math.max(1, Math.min(5, s));
    }

    const insightsToInsert: any[] = [];

    // Sanitize sentiment — DB has a CHECK constraint: must be bullish|bearish|neutral
    const VALID_SENTIMENTS = new Set(["bullish", "bearish", "neutral"]);
    const sanitizeSentiment = (s: unknown): string =>
      typeof s === "string" && VALID_SENTIMENTS.has(s) ? s : "neutral";

    // Helper: build insight with auto quality_score + excluded_from_brief
    const mkInsight = (
      type: string,
      content: string,
      meta: Record<string, any>,
      extra: Record<string, any>,
    ) => {
      const qs = scoreInsight(type, meta, content);
      return {
        newsletter_id: newsletterId,
        insight_type: type,
        content,
        metadata: meta,
        quality_score: qs,
        excluded_from_brief: qs <= 1,
        ...extra,
        sentiment: sanitizeSentiment(extra.sentiment), // always override with sanitized value
      };
    };

    // Stock mentions
    for (const stock of insights.stock_mentions || []) {
      const meta = {
        management_tone: stock.management_tone,
        guidance_revision: stock.guidance_revision,
        earnings_surprise: stock.earnings_surprise,
        claim_specificity: stock.claim_specificity,
        data_backed: stock.data_backed,
        catalyst: stock.catalyst || null,
        source_confidence: sourceConfidence,
      };
      insightsToInsert.push(mkInsight("stock_mention", stock.summary, meta, {
        sentiment: stock.sentiment,
        tickers_mentioned: [stock.ticker],
        confidence_words: stock.confidence_language || [],
      }));
    }

    // Macro views
    for (const macro of insights.macro_views || []) {
      const meta = {
        conviction_level: macro.conviction_level,
        is_consensus_view: macro.is_consensus_view,
        supporting_data: macro.supporting_data,
        source_confidence: sourceConfidence,
      };
      insightsToInsert.push(mkInsight("macro", `${macro.topic}: ${macro.view}`, meta, {
        sentiment: macro.sentiment,
        tickers_mentioned: [],
        confidence_words: macro.conviction_level ? [macro.conviction_level] : [],
      }));
    }

    // Sector views
    for (const sector of insights.sector_views || []) {
      const meta = { conviction_level: sector.conviction_level, source_confidence: sourceConfidence };
      insightsToInsert.push(mkInsight("recommendation", `${sector.sector}: ${sector.view}`, meta, {
        sentiment: sector.sentiment,
        tickers_mentioned: [],
        confidence_words: [],
      }));
    }

    // Bubble signals
    for (const bubble of insights.bubble_signals || []) {
      const meta = { severity: bubble.severity, source_confidence: sourceConfidence };
      insightsToInsert.push(mkInsight("bubble_signal", `"${bubble.phrase}" - ${bubble.context}`, meta, {
        sentiment: "bearish",
        tickers_mentioned: [],
        confidence_words: [],
      }));
    }

    // Country views
    for (const cv of insights.country_views || []) {
      const meta = { conviction_level: cv.conviction_level, source_confidence: sourceConfidence };
      insightsToInsert.push(mkInsight("macro", `Country: ${cv.country}: ${cv.view}`, meta, {
        sentiment: cv.sentiment,
        tickers_mentioned: cv.etf_proxy ? [cv.etf_proxy] : [],
        confidence_words: [],
      }));
    }

    // Sector tilts
    for (const st of insights.sector_tilts || []) {
      const meta = { conviction_level: st.conviction, source_confidence: sourceConfidence };
      const sentiment = st.direction === "overweight" ? "bullish" : st.direction === "underweight" ? "bearish" : "neutral";
      insightsToInsert.push(mkInsight("recommendation", `Sector tilt: ${st.sector}: ${st.direction} — ${st.reasoning}`, meta, {
        sentiment,
        tickers_mentioned: [],
        confidence_words: st.conviction ? [st.conviction] : [],
      }));
    }

    // Stock ideas
    for (const si of insights.stock_ideas || []) {
      const meta = { claim_specificity: si.claim_specificity, catalyst: si.catalyst, source_confidence: sourceConfidence };
      insightsToInsert.push(mkInsight("stock_mention", `${si.name || si.ticker}: ${si.thesis}`, meta, {
        sentiment: si.sentiment || "bullish",
        tickers_mentioned: [si.ticker],
        confidence_words: [],
      }));
    }

    // Key takeaways
    for (const takeaway of insights.key_takeaways || []) {
      const meta = {
        overall_conviction: insights.overall_conviction,
        source_confidence: sourceConfidence,
        notable_omissions: insights.notable_omissions || [],
      };
      insightsToInsert.push(mkInsight("sentiment", takeaway, meta, {
        sentiment: insights.overall_sentiment || "neutral",
        tickers_mentioned: [],
        confidence_words: [],
      }));
    }

    if (insightsToInsert.length > 0) {
      const { error: insertError } = await supabase.from("insights").insert(insightsToInsert);
      if (insertError) {
        console.error("Failed to insert insights:", insertError);
        const detail = insertError.message || insertError.code || "unknown";
        await writeError(`Failed to save insights: ${detail}`);
        return new Response(
          JSON.stringify({ error: "Failed to save insights", detail }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Run newsletter update and reputation update in parallel (both non-blocking)
    const authorValue = insights.source_profile?.author ?? null;
    const pubDateValue = insights.source_profile?.publication_date ?? null;

    // Fix: removed .is("processed", false) guard — allow re-processing to update metadata
    const updateNewsletterPromise = supabase
      .from("newsletters")
      .update({
        processed: true,
        processing_error: null,
        processing_started_at: null,
        ...(authorValue ? { author: authorValue } : {}),
        ...(pubDateValue ? { publication_date: pubDateValue } : {}),
      })
      .eq("id", newsletterId)
      .then(({ error }) => {
        if (error) console.error("Failed to update newsletter:", error);
      });

    // Source reputation update via atomic RPC (non-fatal)
    const updateReputationPromise = (async () => {
      try {
        const { data: nl } = await supabase
          .from("newsletters")
          .select("source_name, user_id")
          .eq("id", newsletterId)
          .single();

        if (!nl) return;

        await supabase.rpc("recalculate_source_reputation", {
          p_user_id: nl.user_id,
          p_source_name: nl.source_name,
          p_style: insights.source_profile?.style ?? null,
        });
      } catch (reputationError) {
        console.warn("Failed to update source reputation (non-fatal):", reputationError);
      }
    })();

    // Wait for both in parallel
    await Promise.all([updateNewsletterPromise, updateReputationPromise]);

    console.log(`Successfully processed newsletter ${newsletterId}, inserted ${insightsToInsert.length} insights (scores: ${insightsToInsert.map((i: any) => i.quality_score).join(",")})`);

    return new Response(
      JSON.stringify({
        success: true,
        insights_count: insightsToInsert.length,
        overall_sentiment: insights.overall_sentiment,
        source_confidence: sourceConfidence,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

    } catch (innerError) {
      // Write error and release processing lock
      const msg = innerError instanceof Error ? innerError.message : "Processing failed";
      await writeError(msg);
      throw innerError;
    }
  } catch (error) {
    console.error("Error processing newsletter:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
