import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Yahoo Finance exchange suffixes for UCITS ETFs and international stocks.
// Without these suffixes, Yahoo matches the wrong security.
// .L = London Stock Exchange, .DE = XETRA, .AX = ASX Australia
const EXCHANGE_SUFFIXES: Record<string, string> = {
  // Portfolio ETFs on LSE
  VWRA: ".L", CSPX: ".L", IDTM: ".L", IMID: ".L", NDIA: ".L",
  CMOD: ".L", IGLN: ".L", EIMI: ".L", IJPA: ".L", IMEU: ".L",
  IB01: ".L", CBUX: ".L",
  // Portfolio ETFs on XETRA
  XDWH: ".DE",
  // Irish-domiciled iShares on LSE
  IWDA: ".L", SWDA: ".L", IWDD: ".L", ISAC: ".L", SSAC: ".L",
  IUSA: ".L", IUIT: ".L", CSUS: ".L", CSUSS: ".L", ISF: ".L",
  EMIM: ".L", IEEM: ".L", CNYA: ".L", ISJP: ".L", IBZL: ".L",
  IUSP: ".L", LQDE: ".L", LQDA: ".L", AGGG: ".L", IEAC: ".L",
  IEGA: ".L", IBTS: ".L", IBTM: ".L", DTLA: ".L", IHYG: ".L",
  ITPS: ".L", SGLN: ".L", INRG: ".L", INFR: ".L", IQQI: ".L",
  RBOT: ".L", DGTL: ".L", HEAL: ".L", ISPY: ".L", AGED: ".L",
  IWDP: ".L", IPRP: ".L", IUKD: ".L",
  IUFS: ".L", IUES: ".L", IUMS: ".L", IUHE: ".L", ICUS: ".L",
  // iShares on XETRA
  EUNL: ".DE", SXR8: ".DE", CNDX: ".DE", CSNDX: ".DE",
  QDVE: ".DE", SMEA: ".DE", MEUD: ".DE", SXRZ: ".DE", IUSQ: ".DE",
  // Vanguard UCITS on LSE
  VWRD: ".L", VUAA: ".L", VUSA: ".L", VFEM: ".L", VFEA: ".L",
  VMID: ".L", VHYL: ".L", VEVE: ".L", VDEV: ".L", VECP: ".L",
  VGOV: ".L", V3AA: ".L", VDST: ".L",
  // Vanguard on XETRA
  VWCE: ".DE", VAGF: ".DE",
  // Xtrackers on XETRA
  XDWD: ".DE", XDEM: ".DE", XD9U: ".DE", XDWT: ".DE",
  XDWL: ".DE", XDWP: ".DE", XDWS: ".DE",
  // SPDR on LSE
  SWRD: ".L", ACWD: ".L", SPYY: ".L", SPYD: ".L",
  SPPE: ".DE",
  // Other UCITS ETFs
  EQQQ: ".L", PHAU: ".L", PHAG: ".L", PPFB: ".L", AIGC: ".L",
  EXSA: ".DE",
  // International stocks in portfolio
  GRE1: ".L",   // Greencoat Renewables
  III: ".L",     // 3i Group
  TEA: ".AX",    // Tasmea Ltd (ASX)
};

function getYahooTicker(ticker: string): string {
  const upper = ticker.toUpperCase();
  const suffix = EXCHANGE_SUFFIXES[upper];
  if (suffix) return upper + suffix;
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
    return {
      ticker: ticker.toUpperCase(),
      current_price: Math.round(price * 100) / 100,
      currency: meta.currency || "USD",
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
