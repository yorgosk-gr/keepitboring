import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
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

    // Get user_id from ib_accounts (single-user setup)
    const { data: account, error: accountError } = await supabase
      .from("ib_accounts")
      .select("user_id")
      .limit(1)
      .single();

    if (accountError || !account) {
      console.error("Failed to find user:", accountError);
      return new Response(
        JSON.stringify({ error: "No user found in ib_accounts" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Insert newsletter row and get the ID back
    const { data: newsletter, error: insertError } = await supabase
      .from("newsletters")
      .insert({
        user_id: account.user_id,
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

    // Auto-process: call process-newsletter edge function with service role key
    try {
      const processUrl = `${supabaseUrl}/functions/v1/process-newsletter`;
      const processResponse = await fetch(processUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          newsletterId: newsletter.id,
          rawText,
        }),
      });

      const processResult = await processResponse.json();

      if (processResponse.ok) {
        console.log(`Auto-processed newsletter: ${processResult.insights_count} insights extracted`);
      } else {
        console.error("Auto-process failed (newsletter saved, user can retry manually):", processResult);
      }
    } catch (processErr) {
      // Non-fatal: newsletter is saved, user can process manually
      console.error("Auto-process error (non-fatal):", processErr);
    }

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
