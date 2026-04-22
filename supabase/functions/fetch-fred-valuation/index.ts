import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// FRED series to track as valuation anchors. Each is fetched with ~10y of
// history; we compute current-vs-history context and upsert the latest obs.
interface SeriesConfig {
  key: string;           // series_key stored in DB
  fred_id: string;       // FRED series id (null for derived series)
  label: string;         // human-readable label
  extended_when: "high" | "low"; // which direction = extended/expensive
  extended_pctile: number;       // percentile threshold (top/bottom N% = extended)
  cheap_pctile: number;          // percentile threshold for cheap
  interpret: (current: number, stats: SeriesStats) => string;
}

interface SeriesStats {
  mean: number;
  stdev: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
  n: number;
  percentile: number; // where current sits, 0-100
}

const SERIES: SeriesConfig[] = [
  {
    key: "us_10y_yield",
    fred_id: "DGS10",
    label: "US 10-Year Treasury Yield",
    extended_when: "low", // low yields = expensive bonds / TINA for equities
    extended_pctile: 20,
    cheap_pctile: 80,
    interpret: (cur, s) =>
      `Current ${cur.toFixed(2)}% (10y range ${s.min.toFixed(2)}–${s.max.toFixed(2)}%, median ${s.p50.toFixed(2)}%, percentile ${s.percentile.toFixed(0)}).`,
  },
  {
    key: "us_hy_spread",
    fred_id: "BAMLH0A0HYM2",
    label: "US High-Yield Option-Adjusted Spread",
    extended_when: "low", // tight spreads = complacent credit = equities likely extended
    extended_pctile: 15,
    cheap_pctile: 85,
    interpret: (cur, s) =>
      `Current ${cur.toFixed(2)}pp (10y range ${s.min.toFixed(2)}–${s.max.toFixed(2)}pp, median ${s.p50.toFixed(2)}pp, percentile ${s.percentile.toFixed(0)}). Low spreads signal complacency; high spreads signal stress/opportunity.`,
  },
  {
    key: "us_10y_breakeven",
    fred_id: "T10YIE",
    label: "10-Year Breakeven Inflation",
    extended_when: "high",
    extended_pctile: 85,
    cheap_pctile: 15,
    interpret: (cur, s) =>
      `Current ${cur.toFixed(2)}% (10y range ${s.min.toFixed(2)}–${s.max.toFixed(2)}%, median ${s.p50.toFixed(2)}%, percentile ${s.percentile.toFixed(0)}).`,
  },
  {
    key: "us_2y_yield",
    fred_id: "DGS2",
    label: "US 2-Year Treasury Yield",
    extended_when: "low",
    extended_pctile: 20,
    cheap_pctile: 80,
    interpret: (cur, s) =>
      `Current ${cur.toFixed(2)}% (10y range ${s.min.toFixed(2)}–${s.max.toFixed(2)}%, percentile ${s.percentile.toFixed(0)}).`,
  },
];

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function computeStats(values: number[], current: number): SeriesStats {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, v) => s + v, 0) / n;
  const variance = sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stdev = Math.sqrt(variance);
  // Current percentile = fraction of observations at or below current
  const rank = sorted.filter((v) => v <= current).length;
  const pctile = (rank / n) * 100;
  return {
    mean,
    stdev,
    p10: percentile(sorted, 10),
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    min: sorted[0],
    max: sorted[n - 1],
    n,
    percentile: pctile,
  };
}

function classifyLevel(stats: SeriesStats, cfg: SeriesConfig): "extended" | "cheap" | "neutral" {
  if (cfg.extended_when === "high") {
    if (stats.percentile >= 100 - cfg.extended_pctile) return "extended";
    if (stats.percentile <= 100 - cfg.cheap_pctile) return "cheap";
  } else {
    if (stats.percentile <= cfg.extended_pctile) return "extended";
    if (stats.percentile >= cfg.cheap_pctile) return "cheap";
  }
  return "neutral";
}

async function fetchFredSeries(
  seriesId: string,
  apiKey: string,
  startYearsAgo: number = 10
): Promise<{ date: string; value: number }[]> {
  const start = new Date();
  start.setFullYear(start.getFullYear() - startYearsAgo);
  const startStr = start.toISOString().substring(0, 10);
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${apiKey}&file_type=json&observation_start=${startStr}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FRED ${seriesId} fetch failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  const obs = data.observations ?? [];
  return obs
    .filter((o: any) => o.value !== "." && o.value !== null && o.value !== "")
    .map((o: any) => ({ date: o.date, value: parseFloat(o.value) }))
    .filter((o: any) => !Number.isNaN(o.value));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const FRED_API_KEY = Deno.env.get("FRED_API_KEY");
    if (!FRED_API_KEY) {
      return new Response(
        JSON.stringify({ error: "FRED_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results: any[] = [];
    const errors: any[] = [];

    for (const cfg of SERIES) {
      try {
        const obs = await fetchFredSeries(cfg.fred_id, FRED_API_KEY);
        if (obs.length < 30) {
          errors.push({ key: cfg.key, error: `insufficient history (${obs.length} obs)` });
          continue;
        }
        const latest = obs[obs.length - 1];
        const values = obs.map((o) => o.value);
        const stats = computeStats(values, latest.value);
        const level = classifyLevel(stats, cfg);
        const interpretation = `${cfg.interpret(latest.value, stats)} Level: ${level}.`;

        const { error } = await supabase
          .from("valuation_context")
          .upsert(
            {
              series_key: cfg.key,
              value: latest.value,
              value_text: null,
              as_of: latest.date,
              source: "fred",
              label: cfg.label,
              interpretation,
              metadata: {
                fred_id: cfg.fred_id,
                level,
                percentile: stats.percentile,
                stats_10y: {
                  min: stats.min,
                  max: stats.max,
                  mean: stats.mean,
                  stdev: stats.stdev,
                  p10: stats.p10,
                  p50: stats.p50,
                  p90: stats.p90,
                  n: stats.n,
                },
              },
            },
            { onConflict: "series_key,as_of" }
          );
        if (error) throw error;
        results.push({ key: cfg.key, as_of: latest.date, value: latest.value, level, percentile: stats.percentile });
      } catch (err) {
        errors.push({ key: cfg.key, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Derived: term spread (10y - 2y)
    try {
      const { data: tenY } = await supabase
        .from("valuation_context")
        .select("value, as_of")
        .eq("series_key", "us_10y_yield")
        .order("as_of", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { data: twoY } = await supabase
        .from("valuation_context")
        .select("value, as_of")
        .eq("series_key", "us_2y_yield")
        .order("as_of", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (tenY && twoY && tenY.as_of === twoY.as_of) {
        const spread = Number(tenY.value) - Number(twoY.value);
        const interp = spread < 0
          ? `Current ${spread.toFixed(2)}pp — inverted (recession signal historically).`
          : spread < 0.5
          ? `Current ${spread.toFixed(2)}pp — flat curve (late-cycle).`
          : `Current ${spread.toFixed(2)}pp — positive slope (normal).`;
        await supabase.from("valuation_context").upsert(
          {
            series_key: "us_term_spread_10y_2y",
            value: spread,
            as_of: tenY.as_of,
            source: "derived",
            label: "US Term Spread (10y − 2y)",
            interpretation: interp,
            metadata: { derived_from: ["us_10y_yield", "us_2y_yield"] },
          },
          { onConflict: "series_key,as_of" }
        );
        results.push({ key: "us_term_spread_10y_2y", value: spread, as_of: tenY.as_of });
      }
    } catch (err) {
      errors.push({ key: "us_term_spread_10y_2y", error: err instanceof Error ? err.message : String(err) });
    }

    return new Response(
      JSON.stringify({ ok: true, updated: results.length, results, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("fetch-fred-valuation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
