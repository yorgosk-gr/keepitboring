import { KNOWN_ETFS, SP500_STOCKS } from "./tickerReference";

/** Derive position type from all available signals */
export function derivePositionType(
  assetClass: string | null,
  subCategory: string | null,
  hasEtfMetadata: boolean,
  ticker?: string | null
): string {
  // 1. ETF metadata table (from DB) takes priority
  if (hasEtfMetadata) return "etf";

  // 2. Local reference database
  if (ticker) {
    const upper = ticker.toUpperCase();
    if (upper in KNOWN_ETFS) return "etf";
    if (upper in SP500_STOCKS) return "stock";
  }

  // 3. IB asset class fields
  const ac = (assetClass || "").toUpperCase();
  const sc = (subCategory || "").toUpperCase();
  if (ac === "CASH" || ac === "FX" || ac === "FXCONV") return "cash";
  if (ac === "STK") {
    if (sc.includes("ETF") || sc.includes("ETC")) return "etf";
    return "stock";
  }
  if (ac === "FND" || ac === "ETF") return "etf";
  if (ac === "BOND" || ac === "BILL" || ac === "FI") return "bond";
  if (ac === "CMDTY") return "commodity";
  return "stock";
}

/** Derive category from all available signals */
export function deriveCategory(
  assetClass: string | null,
  etfCategory: string | null,
  description?: string | null,
  ticker?: string | null
): string {
  // 1. ETF metadata category (from DB)
  if (etfCategory) {
    const lower = etfCategory.toLowerCase();
    if (lower.includes("bond") || lower.includes("fixed")) return "bond";
    if (lower.includes("commodity") || lower.includes("gold")) return "commodity";
    return "equity";
  }

  // 2. Local reference database
  if (ticker) {
    const etfInfo = KNOWN_ETFS[ticker.toUpperCase()];
    if (etfInfo) return etfInfo.category;
    if (ticker.toUpperCase() in SP500_STOCKS) return "equity";
  }

  // 3. IB asset class
  const ac = (assetClass || "").toUpperCase();
  if (ac === "BOND" || ac === "BILL" || ac === "FI") return "bond";
  if (ac === "CMDTY") return "commodity";

  // 4. Description keywords
  const desc = (description || "").toUpperCase();
  if (desc.includes("BND") || desc.includes("BOND") || desc.includes("TREASURY") || desc.includes("FIXED INCOME")) return "bond";
  return "equity";
}

/** Get name from local reference if available */
export function getReferenceName(ticker: string): string | null {
  const upper = ticker.toUpperCase();
  const etf = KNOWN_ETFS[upper];
  if (etf) return etf.name;
  const stock = SP500_STOCKS[upper];
  if (stock) return stock;
  return null;
}
