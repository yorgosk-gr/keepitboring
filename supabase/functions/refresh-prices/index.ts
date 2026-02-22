import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Mapping from raw ticker to the full Yahoo Finance symbol.
// Without these, Yahoo matches the wrong security.
const EXCHANGE_SUFFIXES: Record<string, string> = {
  // LSE-listed ETFs (trade in USD on London Stock Exchange)
  'IB01': 'IB01.L',
  'IDTM': 'IDTM.L',
  'IGLN': 'IGLN.L',
  'IMEU': 'IMEU.L',
  'IJPA': 'IJPA.L',
  'IUQA': 'IUQA.L',
  'EIMI': 'EIMI.L',
  'CBUX': 'CBUX.L',
  'CMOD': 'CMOD.L',
  'COPX': 'COPX.L',
  // Euronext
  'GRE': 'GRE.PA',
  // ASX
  'TEA': 'TEA.AX',
  // GBP stocks on LSE
  'III': 'III.L',
  'KLAR': 'KLAR.L',
};

function getYahooTicker(ticker: string): string {
  const upper = ticker.toUpperCase();
  if (EXCHANGE_SUFFIXES[upper]) return EXCHANGE_SUFFIXES[upper];
  return upper; // US-listed stocks need no suffix
}

interface PriceResult {
  ticker: string;
  current_price: number;
  currency: string;
  price_date: string;
  source: string;
}

async function fetchYahooPrice(ticker: string): Promise<PriceResult | null> {
  const yahooTicker = getYahooTicker(ticker);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooTicker)}?range=1d&interval=1d`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) {
      console.error(`Yahoo error for ${yahooTicker}: ${response.status}`);
      return null;
    }
    const data = await response.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const price = meta.regularMarketPrice ?? meta.previousClose;
    if (!price || price === 0) return null;

    // Auto-convert GBP pence to pounds. Yahoo returns "GBp" for pence-priced LSE securities.
    let finalPrice = price;
    let finalCurrency = meta.currency || "USD";
    if (finalCurrency === "GBp") {
      finalPrice = price / 100;
      finalCurrency = "GBP";
    }

    return {
      ticker: ticker.toUpperCase(),
      current_price: Math.round(finalPrice * 100) / 100,
      currency: finalCurrency,
      price_date: meta.regularMarketTime
        ? new Date(meta.regularMarketTime * 1000).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
      source: `Yahoo Finance (${yahooTicker})`,
    };
  } catch (error) {
    console.error(`Fetch error for ${yahooTicker}:`, error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const { tickers } = await req.json() as { tickers: string[] };
    if (!tickers?.length) {
      return new Response(
        JSON.stringify({ error: "No tickers provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.log(`Yahoo Finance: fetching ${tickers.length} tickers`);
    const results = await Promise.allSettled(tickers.map(t => fetchYahooPrice(t)));
    const prices: PriceResult[] = [];
    const notFound: string[] = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled" && r.value) prices.push(r.value);
      else notFound.push(tickers[i]);
    });
    console.log(`Done: ${prices.length} found, ${notFound.length} not found`);
    return new Response(
      JSON.stringify({ success: true, prices, not_found: notFound, fetched_at: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Price fetch error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
