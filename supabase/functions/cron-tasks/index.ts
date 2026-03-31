import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Verify this is called with service role key or a valid user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = authHeader.replace("Bearer ", "");
  const isServiceRole = token === serviceKey;

  let userId: string | null = null;
  if (!isServiceRole) {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = user.id;
  }

  let body: { task?: string } = {};
  try {
    body = await req.json();
  } catch {
    // default to running all tasks
  }

  const task = body.task ?? "all";
  const results: Record<string, any> = {};

  try {
    // Get all users (or just the requesting user)
    const usersQuery = userId
      ? { data: [{ id: userId }], error: null }
      : await supabase.from("ib_accounts").select("user_id").then(r => ({
          data: (r.data ?? []).map((a: any) => ({ id: a.user_id })),
          error: r.error,
        }));

    const users = usersQuery.data ?? [];

    // TASK 1: Refresh prices for all users' positions
    if (task === "all" || task === "refresh-prices") {
      const priceResults: any[] = [];

      for (const u of users) {
        const { data: positions } = await supabase
          .from("ib_positions")
          .select("symbol, currency, exchange, instrument_type")
          .eq("user_id", u.id);

        if (!positions?.length) continue;

        const tickers = positions.map((p: any) => ({
          ticker: p.symbol,
          currency: p.currency,
          exchange: p.exchange,
          instrumentType: p.instrument_type,
        }));

        // Call refresh-prices function
        const { data, error } = await supabase.functions.invoke("refresh-prices", {
          body: { tickers },
        });

        if (error) {
          console.error(`Price refresh error for user ${u.id}:`, error);
          priceResults.push({ userId: u.id, error: error.message });
          continue;
        }

        // Update positions with new prices
        const prices = data?.prices ?? [];
        let updated = 0;
        for (const price of prices) {
          const { error: updateErr } = await supabase
            .from("ib_positions")
            .update({
              market_price: price.current_price,
              market_value: null, // will be recalculated
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", u.id)
            .eq("symbol", price.ticker);

          if (!updateErr) updated++;
        }

        // Record snapshot
        const { data: positionsUpdated } = await supabase
          .from("ib_positions")
          .select("position_value, instrument_type")
          .eq("user_id", u.id);

        const { data: account } = await supabase
          .from("ib_accounts")
          .select("cash_balance")
          .eq("user_id", u.id)
          .maybeSingle();

        const totalMV = (positionsUpdated ?? []).reduce((s: number, p: any) => s + (p.position_value ?? 0), 0);
        const stocksVal = (positionsUpdated ?? []).filter((p: any) => p.instrument_type === "STK").reduce((s: number, p: any) => s + (p.position_value ?? 0), 0);
        const etfsVal = totalMV - stocksVal;
        const cashBal = account?.cash_balance ?? 0;

        await supabase.from("portfolio_snapshots").insert({
          user_id: u.id,
          total_value: totalMV,
          stocks_percent: totalMV > 0 ? (stocksVal / totalMV) * 100 : 0,
          etfs_percent: totalMV > 0 ? (etfsVal / totalMV) * 100 : 0,
          cash_balance: cashBal,
          data_json: { cron: true, updated_count: updated, fetched_at: new Date().toISOString() },
        });

        priceResults.push({ userId: u.id, updated, total: tickers.length });
      }

      results["refresh-prices"] = priceResults;
    }

    // TASK 2: Process unprocessed newsletters
    if (task === "all" || task === "process-newsletters") {
      const { data: unprocessed, error: fetchErr } = await supabase
        .from("newsletters")
        .select("id, raw_text")
        .eq("processed", false)
        .order("received_at", { ascending: true })
        .limit(10);

      if (fetchErr) {
        results["process-newsletters"] = { error: fetchErr.message };
      } else {
        const processed: string[] = [];
        for (const nl of unprocessed ?? []) {
          if (!nl.raw_text) continue;
          const { error } = await supabase.functions.invoke("process-newsletter", {
            body: { newsletterId: nl.id, rawText: nl.raw_text },
          });
          if (error) {
            console.error(`Process newsletter ${nl.id} error:`, error);
          } else {
            processed.push(nl.id);
          }
        }
        results["process-newsletters"] = { processed: processed.length, pending: (unprocessed?.length ?? 0) - processed.length };
      }
    }

    // TASK 3: Check philosophy rule violations
    if (task === "all" || task === "check-rules") {
      const ruleResults: any[] = [];

      for (const u of users) {
        const { data: rules } = await supabase
          .from("philosophy_rules")
          .select("id, metric, threshold_min, threshold_max, is_active")
          .eq("user_id", u.id)
          .eq("is_active", true);

        if (!rules?.length) continue;

        const { data: positions } = await supabase
          .from("ib_positions")
          .select("symbol, position_value, instrument_type, percent_of_nav")
          .eq("user_id", u.id);

        const { data: account } = await supabase
          .from("ib_accounts")
          .select("cash_balance, net_liquidation")
          .eq("user_id", u.id)
          .maybeSingle();

        if (!positions?.length || !account) continue;

        const totalValue = account.net_liquidation ?? positions.reduce((s: number, p: any) => s + (p.position_value ?? 0), 0) + (account.cash_balance ?? 0);
        if (totalValue === 0) continue;

        const cashPct = ((account.cash_balance ?? 0) / totalValue) * 100;
        const stocksVal = positions.filter((p: any) => p.instrument_type === "STK").reduce((s: number, p: any) => s + (p.position_value ?? 0), 0);
        const equityPct = (stocksVal / totalValue) * 100;

        const metrics: Record<string, number> = {
          cash_percent: cashPct,
          equity_percent: equityPct,
          max_position_percent: Math.max(...positions.map((p: any) => ((p.position_value ?? 0) / totalValue) * 100), 0),
        };

        let alertsCreated = 0;
        for (const rule of rules) {
          const value = metrics[rule.metric];
          if (value === undefined) continue;

          const min = rule.threshold_min ?? -Infinity;
          const max = rule.threshold_max ?? Infinity;
          const violated = value < min || value > max;

          if (violated) {
            const direction = value < min ? "below minimum" : "above maximum";
            const message = `${rule.metric.replace(/_/g, " ")} is ${value.toFixed(1)}%, ${direction} (${min === -Infinity ? "—" : min.toFixed(0)}–${max === Infinity ? "—" : max.toFixed(0)}%)`;

            // Check if this alert already exists (avoid duplicates)
            const { data: existing } = await supabase
              .from("alerts")
              .select("id")
              .eq("user_id", u.id)
              .eq("rule_id", rule.id)
              .eq("resolved", false)
              .limit(1)
              .maybeSingle();

            if (!existing) {
              await supabase.from("alerts").insert({
                user_id: u.id,
                rule_id: rule.id,
                alert_type: "portfolio",
                severity: "warning",
                message,
                resolved: false,
              });
              alertsCreated++;
            }
          } else {
            // Auto-resolve if condition is no longer violated
            await supabase
              .from("alerts")
              .update({ resolved: true })
              .eq("user_id", u.id)
              .eq("rule_id", rule.id)
              .eq("resolved", false);
          }
        }

        ruleResults.push({ userId: u.id, rulesChecked: rules.length, alertsCreated });
      }

      results["check-rules"] = ruleResults;
    }

    // TASK 4: Generate weekly intelligence brief (if needed)
    if (task === "all" || task === "summarize") {
      for (const u of users) {
        // Check if a brief was generated in the last 6 days
        const sixDaysAgo = new Date();
        sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

        const { data: recentBrief } = await supabase
          .from("intelligence_briefs")
          .select("id")
          .eq("user_id", u.id)
          .gte("created_at", sixDaysAgo.toISOString())
          .limit(1)
          .maybeSingle();

        if (recentBrief) {
          results["summarize"] = { skipped: true, reason: "Brief generated within last 6 days" };
          continue;
        }

        const { error } = await supabase.functions.invoke("summarize-insights", {
          body: { userId: u.id },
        });

        results["summarize"] = error
          ? { error: error.message }
          : { generated: true };
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Cron task error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
