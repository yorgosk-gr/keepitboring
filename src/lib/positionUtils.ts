// Shared position type derivation utility
export function derivePositionType(
  assetClass: string | null,
  subCategory: string | null,
  hasEtfMetadata: boolean
): string {
  if (hasEtfMetadata) return "etf";
  const ac = (assetClass || "").toUpperCase();
  const sc = (subCategory || "").toUpperCase();
  if (ac === "STK") {
    if (sc.includes("ETF") || sc.includes("ETC")) return "etf";
    return "stock";
  }
  if (ac === "FND" || ac === "ETF") return "etf";
  if (ac === "BOND" || ac === "BILL" || ac === "FI") return "bond";
  if (ac === "CMDTY") return "commodity";
  return "stock";
}

export function deriveCategory(
  assetClass: string | null,
  etfCategory: string | null,
  description?: string | null
): string {
  if (etfCategory) {
    const lower = etfCategory.toLowerCase();
    if (lower.includes("bond") || lower.includes("fixed")) return "bond";
    if (lower.includes("commodity") || lower.includes("gold")) return "commodity";
    return "equity";
  }
  const ac = (assetClass || "").toUpperCase();
  if (ac === "BOND" || ac === "BILL" || ac === "FI") return "bond";
  if (ac === "CMDTY") return "commodity";
  const desc = (description || "").toUpperCase();
  if (desc.includes("BND") || desc.includes("BOND") || desc.includes("TREASURY") || desc.includes("FIXED INCOME")) return "bond";
  return "equity";
}
