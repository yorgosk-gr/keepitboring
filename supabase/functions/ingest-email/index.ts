import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OWNER_USER_ID = "38ce8fa7-9327-4424-b247-c14755e32852";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function stripHtml(html: string): string {
  let text = html;

  // Remove entire blocks that are never content
  text = text.replace(/<head[\s>][\s\S]*?<\/head>/gi, "");
  text = text.replace(/<style[\s>][\s\S]*?<\/style>/gi, "");
  text = text.replace(/<script[\s>][\s\S]*?<\/script>/gi, "");
  text = text.replace(/<noscript[\s>][\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");

  // Remove tracking pixels and tiny images (1x1, hidden, display:none)
  text = text.replace(/<img[^>]*(width\s*=\s*["']?1["']?|height\s*=\s*["']?1["']?|display\s*:\s*none)[^>]*\/?>/gi, "");

  // Remove common newsletter footer/nav patterns before tag stripping
  text = text.replace(/<footer[\s>][\s\S]*?<\/footer>/gi, "");

  // Convert block elements to newlines for structure preservation
  text = text.replace(/<\/?(p|div|br|hr|h[1-6]|li|tr|blockquote|section|article)[\s>][^>]*>/gi, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");

  // Extract link text (keep text, drop URL)
  text = text.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "$1");

  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  const entities: Record<string, string> = {
    "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">",
    "&quot;": '"', "&#39;": "'", "&apos;": "'", "&ndash;": "–",
    "&mdash;": "—", "&bull;": "•", "&hellip;": "…", "&rsquo;": "'",
    "&lsquo;": "'", "&rdquo;": "\u201D", "&ldquo;": "\u201C",
    "&trade;": "™", "&copy;": "©", "&reg;": "®",
  };
  for (const [entity, char] of Object.entries(entities)) {
    text = text.replaceAll(entity, char);
  }
  // Numeric entities
  text = text.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));

  // Remove URLs (tracking links, image URLs, etc.)
  text = text.replace(/https?:\/\/[^\s)}\]"'<>]+/g, "");

  // Remove common newsletter junk lines
  const junkPatterns = [
    /unsubscribe/i, /view\s*(this\s*)?(email\s*)?in\s*(your\s*)?browser/i,
    /manage\s*preferences/i, /email\s*preferences/i,
    /add\s*us\s*to\s*your\s*address\s*book/i,
    /©\s*\d{4}/i, /all\s*rights\s*reserved/i,
    /powered\s*by\s*(mailchimp|substack|beehiiv|convertkit|buttondown)/i,
    /click\s*here\s*to/i, /forward\s*this\s*(email|newsletter)/i,
    /sent\s*(to|by)\s*\S+@\S+/i,
  ];

  const lines = text.split("\n");
  const cleanedLines = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    // Skip very short lines (likely nav items, buttons)
    if (trimmed.length < 4) return false;
    // Skip junk lines
    return !junkPatterns.some((p) => p.test(trimmed));
  });

  // Collapse whitespace per line, then join
  text = cleanedLines
    .map((l) => l.replace(/\s+/g, " ").trim())
    .join("\n");

  // Collapse multiple blank lines
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // Basic auth verification (Cloudmailin sends credentials in the URL)
    const CLOUDMAILIN_USER = "ingest";
    const CLOUDMAILIN_PASS = Deno.env.get("CLOUDMAILIN_PASS") ?? "";
    const authHeader = req.headers.get("Authorization") ?? "";
    if (authHeader.startsWith("Basic ")) {
      const decoded = atob(authHeader.slice(6));
      const [user, pass] = decoded.split(":");
      if (user !== CLOUDMAILIN_USER || pass !== CLOUDMAILIN_PASS) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // Extract fields from Cloudmailin payload
    const subject =
      body.subject || body.headers?.subject || "Unknown Newsletter";
    const plain = body.plain || "";
    const html = body.html || "";

    // Use plain text if available, otherwise strip HTML
    const rawText = plain.trim() ? plain.trim() : stripHtml(html);

    if (!rawText) {
      return new Response(
        JSON.stringify({ error: "No email body content found" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client with service role key to bypass RLS
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Insert newsletter row and get the ID back
    const { data: newsletter, error: insertError } = await supabase
      .from("newsletters")
      .insert({
        user_id: OWNER_USER_ID,
        source_name: subject,
        raw_text: rawText,
        upload_date: new Date().toISOString().split("T")[0],
        processed: false,
      })
      .select("id")
      .single();

    if (insertError || !newsletter) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: insertError?.message ?? "Insert failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Newsletter ingested: "${subject}" (${newsletter.id})`);

    // Auto-process: fire-and-forget to avoid edge function timeout
    // The newsletter is already saved; if processing fails, user can retry manually
    const processUrl = `${supabaseUrl}/functions/v1/process-newsletter`;
    fetch(processUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        newsletterId: newsletter.id,
        rawText,
      }),
    }).then(async (processResponse) => {
      if (processResponse.ok) {
        const processResult = await processResponse.json();
        console.log(`Auto-processed newsletter: ${processResult.insights_count} insights extracted`);
      } else {
        const errBody = await processResponse.text();
        console.error("Auto-process failed (newsletter saved, user can retry manually):", errBody);
      }
    }).catch((processErr) => {
      console.error("Auto-process error (non-fatal):", processErr);
    });

    return new Response(
      JSON.stringify({ success: true, source_name: subject, id: newsletter.id }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
