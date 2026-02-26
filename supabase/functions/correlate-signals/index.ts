// supabase/functions/correlate-signals/index.ts
// ================================================================
// Correlates user trades with market events to generate
// behavioral signals for the risk profile system
// ================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EVENT_WINDOW_DAYS = 7;

function isAligned(
  profile: string,
  event: { severity: number; index_move_pct: number },
  trade: { buy_sell: string; asset_class: string }
): boolean {
  const isSell = trade.buy_sell === "SELL";
  const isBuy  = trade.buy_sell === "BUY";
  const isNegativeEvent = (event.index_move_pct ?? 0) < 0;

  switch (profile) {
    case "aggressive":
      if (isNegativeEvent && isSell) return false;
      if (isNegativeEvent && isBuy)  return true;
      return true;
    case "growth":
      if (isNegativeEvent && event.severity === 3 && isSell) return true;
      if (isNegativeEvent && event.severity <= 2 && isSell)  return false;
      if (isNegativeEvent && isBuy) return true;
      return true;
    case "balanced":
      if (isNegativeEvent && event.severity === 1 && isSell) return false;
      if (isNegativeEvent && event.severity >= 2 && isSell)  return true;
      return true;
    case "cautious":
      if (isNegativeEvent && isSell) return true;
      if (isNegativeEvent && isBuy && event.severity === 3) return false;
      return true;
    default:
      return true;
  }
}

function describeAction(trade: {
  buy_sell: string;
  symbol: string;
  quantity: number;
  asset_class: string;
}): string {
  const direction = trade.buy_sell === "BUY" ? "Added to" : "Reduced";
  const qty = Math.abs(trade.quantity);
  const assetType = trade.asset_class === "STK" ? "stock position" :
                    trade.asset_class === "OPT" ? "options position" :
                    trade.asset_class === "ETF" ? "ETF position" : "position";
  return `${direction} ${trade.symbol} ${assetType} (${qty} shares)`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { data: profileData } = await supabase
      .from("risk_profiles")
      .select("profile, applied_at")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    const currentProfile = profileData?.profile ?? "balanced";

    const { data: events } = await supabase
      .from("market_events")
      .select("*")
      .order("event_date", { ascending: false });

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ success: true, signals: 0, message: "No market events to correlate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const { data: trades } = await supabase
      .from("ib_trades")
      .select("*")
      .eq("user_id", user.id)
      .eq("level_of_detail", "EXECUTION")
      .order("trade_date", { ascending: false });

    if (!trades || trades.length === 0) {
      return new Response(JSON.stringify({ success: true, signals: 0, message: "No trades to correlate" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    await supabase.from("behavioral_signals").delete().eq("user_id", user.id);

    const signals: any[] = [];

    for (const event of events) {
      const eventDate = new Date(event.event_date);
      const windowStart = new Date(eventDate);
      const windowEnd   = new Date(eventDate);
      windowStart.setDate(windowStart.getDate() - EVENT_WINDOW_DAYS);
      windowEnd.setDate(windowEnd.getDate() + EVENT_WINDOW_DAYS);

      const nearbyTrades = trades.filter((t: any) => {
        if (!t.trade_date) return false;
        const td = new Date(t.trade_date);
        return td >= windowStart && td <= windowEnd;
      });

      const bySymbol: Record<string, any[]> = {};
      for (const trade of nearbyTrades) {
        if (!trade.symbol) continue;
        if (!bySymbol[trade.symbol]) bySymbol[trade.symbol] = [];
        bySymbol[trade.symbol].push(trade);
      }

      for (const [symbol, symbolTrades] of Object.entries(bySymbol)) {
        const totalNetCash = symbolTrades.reduce((sum: number, t: any) => sum + (t.net_cash ?? 0), 0);
        if (Math.abs(totalNetCash) < 500) continue;

        const sells = symbolTrades.filter((t: any) => t.buy_sell === "SELL");
        const buys  = symbolTrades.filter((t: any) => t.buy_sell === "BUY");
        const dominantTrade = sells.length >= buys.length ? sells[0] : buys[0];
        if (!dominantTrade) continue;

        const profileAtTime = currentProfile;
        const aligned = isAligned(profileAtTime, event, dominantTrade);

        signals.push({
          user_id: user.id,
          trade_id: dominantTrade.id,
          market_event_id: event.id,
          symbol,
          action: describeAction({
            buy_sell: dominantTrade.buy_sell,
            symbol,
            quantity: dominantTrade.quantity,
            asset_class: dominantTrade.asset_class,
          }),
          aligned,
          profile_at_time: profileAtTime,
          signal_date: event.event_date,
          notes: `${event.title} · ${Math.abs(totalNetCash).toFixed(0)} USD moved`,
        });
      }
    }

    if (signals.length > 0) {
      const { error: insertError } = await supabase
        .from("behavioral_signals")
        .insert(signals);
      if (insertError) throw insertError;
    }

    const totalSignals = signals.length;
    const alignedCount = signals.filter(s => s.aligned).length;
    const alignmentRate = totalSignals > 0 ? alignedCount / totalSignals : 1;
    const hasMismatch = alignmentRate < 0.6 && totalSignals >= 3;

    await supabase
      .from("ib_accounts")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return new Response(JSON.stringify({
      success: true,
      signals: signals.length,
      aligned: alignedCount,
      alignment_rate: Math.round(alignmentRate * 100),
      has_mismatch: hasMismatch,
      current_profile: currentProfile,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (err) {
    console.error("Correlation error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
