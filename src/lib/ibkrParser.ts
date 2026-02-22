// ============================================================
// IBKR Activity Statement Parser
// For use in your Lovable/InvestAgent project
// ============================================================
// Handles the IBKR multi-section CSV format.
// Call parseIBKRStatement(csvText) to get a clean portfolio object.
// ============================================================

export type AssetClass = "Equities" | "Bonds" | "Commodities" | "Unknown";

export type InstrumentType = "Stock" | "ETF" | "ETC" | "Unknown";

export interface Position {
  ticker: string;
  description: string;
  currency: string;
  quantity: number;
  costPrice: number;
  closePrice: number;
  valueLocal: number;
  valueUSD: number;
  unrealizedPL: number;
  instrumentType: InstrumentType;
  assetClass: AssetClass;
  yahooTicker: string;
}

function deriveYahooTicker(ticker: string, currency: string, instrumentType: InstrumentType): string {
  switch (currency) {
    case "AUD": return `${ticker}.AX`;
    case "EUR": return `${ticker}.PA`;
    case "GBP": return `${ticker}.L`;
    case "USD":
      if (instrumentType === "ETF" || instrumentType === "ETC") return `${ticker}.L`;
      return ticker;
    default: return ticker;
  }
}

export interface ParsedPortfolio {
  accountId: string;
  accountName: string;
  statementDate: string;
  baseCurrency: string;
  totalNAV: number;
  cashUSD: number;
  securitiesUSD: number;
  positions: Position[];
  fxRates: Record<string, number>;
  cashByCurrency: Record<string, number>;
  warnings: string[];
}

// ── Asset class inference ─────────────────────────────────────────────────────

const KNOWN_CLASSIFICATIONS: Record<string, { instrumentType: InstrumentType; assetClass: AssetClass }> = {
  // Bond ETFs
  IB01:  { instrumentType: "ETF", assetClass: "Bonds" },
  IDTM:  { instrumentType: "ETF", assetClass: "Bonds" },
  IBTG:  { instrumentType: "ETF", assetClass: "Bonds" },
  IEF:   { instrumentType: "ETF", assetClass: "Bonds" },
  SGOV:  { instrumentType: "ETF", assetClass: "Bonds" },
  TLT:   { instrumentType: "ETF", assetClass: "Bonds" },
  BND:   { instrumentType: "ETF", assetClass: "Bonds" },
  AGG:   { instrumentType: "ETF", assetClass: "Bonds" },
  // Commodity ETFs / ETCs
  IGLN:  { instrumentType: "ETC", assetClass: "Commodities" },
  GLD:   { instrumentType: "ETF", assetClass: "Commodities" },
  IAU:   { instrumentType: "ETF", assetClass: "Commodities" },
  SLV:   { instrumentType: "ETF", assetClass: "Commodities" },
  CMOD:  { instrumentType: "ETF", assetClass: "Commodities" },
  COPX:  { instrumentType: "ETF", assetClass: "Commodities" },
  // Crypto ETFs
  IBIT:  { instrumentType: "ETF", assetClass: "Commodities" },
  // Equity ETFs
  IUQA:  { instrumentType: "ETF", assetClass: "Equities" },
  IJPA:  { instrumentType: "ETF", assetClass: "Equities" },
  IMEU:  { instrumentType: "ETF", assetClass: "Equities" },
  EIMI:  { instrumentType: "ETF", assetClass: "Equities" },
  GRE:   { instrumentType: "ETF", assetClass: "Equities" },
  CSPX:  { instrumentType: "ETF", assetClass: "Equities" },
  CBUX:  { instrumentType: "ETF", assetClass: "Equities" },
  IBZL:  { instrumentType: "ETF", assetClass: "Equities" },
};

const BOND_KEYWORDS = [
  "treasury", "treas", "bond", "gilt", "ibond", "iboxx",
  "fixed income", "iboxx", "ibonds", "0-1yr", "7-10y", "10y",
];

const COMMODITY_KEYWORDS = [
  "gold", "silver", "commodity", "commodit", "copper", "oil",
  "physical gold", "physical silver", "bitcoin", "crypto",
];

const ETF_KEYWORDS = [
  "ishares", "vanguard", "invesco", "spdr", "xtrackers", "amundi",
  "wisdomtree", "lyxor", "ucits etf", "etf", "etc", "etn",
];

function inferClassification(
  ticker: string,
  description: string
): { instrumentType: InstrumentType; assetClass: AssetClass } {
  if (KNOWN_CLASSIFICATIONS[ticker]) {
    return KNOWN_CLASSIFICATIONS[ticker];
  }

  const desc = description.toLowerCase();

  let assetClass: AssetClass = "Equities";
  if (BOND_KEYWORDS.some((kw) => desc.includes(kw))) {
    assetClass = "Bonds";
  } else if (COMMODITY_KEYWORDS.some((kw) => desc.includes(kw))) {
    assetClass = "Commodities";
  }

  let instrumentType: InstrumentType = "Stock";
  if (ETF_KEYWORDS.some((kw) => desc.includes(kw))) {
    instrumentType = desc.includes("etc") ? "ETC" : "ETF";
  }

  return { instrumentType, assetClass };
}

// ── CSV parsing helpers ───────────────────────────────────────────────────────

function parseNumber(raw: string): number {
  if (!raw || raw === "--") return 0;
  return parseFloat(raw.replace(/,/g, "")) || 0;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseIBKRStatement(csvText: string): ParsedPortfolio {
  const warnings: string[] = [];

  const lines = csvText
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");

  // ── Pass 1: collect metadata and lookups ──────────────────────────────────

  let accountId = "";
  let accountName = "";
  let statementDate = "";
  let baseCurrency = "USD";
  let cashUSD = 0;
  let totalNAV = 0;

  const descriptionMap: Record<string, string> = {};
  const cashByCurrency: Record<string, number> = {};
  const fxRates: Record<string, number> = { USD: 1.0 };

  for (const line of lines) {
    const cols = parseCSVLine(line);
    if (cols.length < 2) continue;

    const section = cols[0];
    const rowType = cols[1];

    if (section === "Statement" && rowType === "Data") {
      if (cols[2] === "Period") statementDate = cols[3];
    }

    if (section === "Account Information" && rowType === "Data") {
      if (cols[2] === "Account") accountId = cols[3];
      if (cols[2] === "Name") accountName = cols[3];
      if (cols[2] === "Base Currency") baseCurrency = cols[3];
    }

    if (section === "Net Asset Value" && rowType === "Data") {
      if (cols[2] === "Cash ") cashUSD = parseNumber(cols[4]);
      if (cols[2] === "Total") totalNAV = parseNumber(cols[4]);
    }

    if (
      section === "Month & Year to Date Performance Summary" &&
      rowType === "Data"
    ) {
      const ticker = cols[4]?.trim();
      const desc = cols[5]?.trim();
      if (ticker && desc) descriptionMap[ticker] = desc;
    }

    // Cash Report: per-currency ending balances
    if (
      section === "Cash Report" &&
      rowType === "Data" &&
      cols[2] === "Ending Cash" &&
      cols[3] !== "Base Currency Summary"
    ) {
      const val = parseNumber(cols[4]);
      if (Math.abs(val) >= 0.01) {
        cashByCurrency[cols[3]] = val;
      }
    }
  }

  // ── Pass 2: FX rates from Mark-to-Market Forex section ───────────────────

  for (const line of lines) {
    const cols = parseCSVLine(line);
    if (cols.length < 6) continue;

    if (
      cols[0] === "Mark-to-Market Performance Summary" &&
      cols[1] === "Data" &&
      cols[2] === "Forex"
    ) {
      const ccy = cols[3]?.trim();
      const currentPrice = parseNumber(cols[7]);
      if (ccy && currentPrice > 0 && ccy !== "USD") {
        fxRates[ccy] = currentPrice;
      }
    }
  }

  const fallbacks: Record<string, number> = {
    EUR: 1.18, GBP: 1.35, AUD: 0.63, CAD: 0.73,
  };
  for (const [ccy, rate] of Object.entries(fallbacks)) {
    if (!fxRates[ccy]) {
      fxRates[ccy] = rate;
      warnings.push(
        `FX rate for ${ccy} not found in statement — using fallback ${rate}. Refresh rates for accuracy.`
      );
    }
  }

  // ── Pass 3: Open Positions ────────────────────────────────────────────────

  const positions: Position[] = [];

  for (const line of lines) {
    const cols = parseCSVLine(line);
    if (cols.length < 10) continue;

    if (
      cols[0] !== "Open Positions" ||
      cols[1] !== "Data" ||
      cols[2] !== "Summary"
    )
      continue;

    const currency   = cols[4]?.trim();
    const ticker     = cols[5]?.trim();
    const quantity   = parseNumber(cols[6]);
    const costPrice  = parseNumber(cols[8]);
    const closePrice = parseNumber(cols[10]);
    const valueLocal = parseNumber(cols[11]);
    const unrealizedPL = parseNumber(cols[12]);

    if (!ticker || quantity === 0) continue;

    const description = descriptionMap[ticker] || "";
    const { instrumentType, assetClass } = inferClassification(ticker, description);

    const fxRate = fxRates[currency] ?? 1;
    const valueUSD = valueLocal * fxRate;

    if (!fxRates[currency]) {
      warnings.push(`No FX rate found for ${currency} (${ticker}) — value may be inaccurate.`);
    }

    const yahooTicker = deriveYahooTicker(ticker, currency, instrumentType);

    positions.push({
      ticker,
      description,
      currency,
      quantity,
      costPrice,
      closePrice,
      valueLocal,
      valueUSD,
      unrealizedPL,
      instrumentType,
      assetClass,
      yahooTicker,
    });
  }

  const securitiesUSD = positions.reduce((sum, p) => sum + p.valueUSD, 0);

  return {
    accountId,
    accountName,
    statementDate,
    baseCurrency,
    totalNAV,
    cashUSD,
    securitiesUSD,
    positions,
    fxRates,
    cashByCurrency,
    warnings,
  };
}

// ── Allocation summary helper ─────────────────────────────────────────────────

export interface AllocationSummary {
  totalUSD: number;
  cashPct: number;
  equitiesPct: number;
  bondsPct: number;
  commoditiesPct: number;
  stocksWithinEquitiesPct: number;
  etfsWithinEquitiesPct: number;
  breaches: string[];
}

export function getAllocationSummary(portfolio: ParsedPortfolio): AllocationSummary {
  const total = portfolio.securitiesUSD + portfolio.cashUSD;

  const equitiesUSD = portfolio.positions
    .filter((p) => p.assetClass === "Equities")
    .reduce((s, p) => s + p.valueUSD, 0);

  const bondsUSD = portfolio.positions
    .filter((p) => p.assetClass === "Bonds")
    .reduce((s, p) => s + p.valueUSD, 0);

  const commoditiesUSD = portfolio.positions
    .filter((p) => p.assetClass === "Commodities")
    .reduce((s, p) => s + p.valueUSD, 0);

  const stocksUSD = portfolio.positions
    .filter((p) => p.assetClass === "Equities" && p.instrumentType === "Stock")
    .reduce((s, p) => s + p.valueUSD, 0);

  const etfsUSD = portfolio.positions
    .filter((p) => p.assetClass === "Equities" && p.instrumentType !== "Stock")
    .reduce((s, p) => s + p.valueUSD, 0);

  const pct = (v: number) => (v / total) * 100;

  const breaches: string[] = [];

  if (pct(equitiesUSD) > 70)
    breaches.push(`Equities ${pct(equitiesUSD).toFixed(1)}% exceeds 70% target`);
  if (pct(bondsUSD) > 20)
    breaches.push(`Bonds ${pct(bondsUSD).toFixed(1)}% exceeds 20% target`);
  if (pct(commoditiesUSD) > 10)
    breaches.push(`Commodities ${pct(commoditiesUSD).toFixed(1)}% exceeds 10% target`);

  const equityTotal = equitiesUSD || 1;
  const stocksOfEquities = (stocksUSD / equityTotal) * 100;
  if (stocksOfEquities < 15)
    breaches.push(`Stocks are ${stocksOfEquities.toFixed(1)}% of equities — below 15% floor`);
  if (stocksOfEquities > 25)
    breaches.push(`Stocks are ${stocksOfEquities.toFixed(1)}% of equities — above 25% ceiling`);

  for (const p of portfolio.positions) {
    if (p.instrumentType === "Stock" && pct(p.valueUSD) > 8) {
      breaches.push(`${p.ticker} is ${pct(p.valueUSD).toFixed(1)}% — exceeds 8% single stock limit`);
    }
    if (p.instrumentType === "ETF" && pct(p.valueUSD) > 15) {
      breaches.push(`${p.ticker} is ${pct(p.valueUSD).toFixed(1)}% — exceeds 15% themed ETF limit`);
    }
  }

  return {
    totalUSD: total,
    cashPct: pct(portfolio.cashUSD),
    equitiesPct: pct(equitiesUSD),
    bondsPct: pct(bondsUSD),
    commoditiesPct: pct(commoditiesUSD),
    stocksWithinEquitiesPct: pct(stocksUSD),
    etfsWithinEquitiesPct: pct(etfsUSD),
    breaches,
  };
}
