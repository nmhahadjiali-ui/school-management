// Money in the browser/server is only DISPLAYED or passed through as decimal
// strings. All arithmetic that matters (balances, allocations, totals) is done
// by PostgreSQL in numeric(12,2); JavaScript floats are never authoritative.

/** A decimal money string with at most 2 decimals, e.g. "1500" or "1500.50". */
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/

/** Normalise user input ("1,500.5" -> "1500.5"); returns null when not a valid amount. */
export function parseMoney(input: string | null | undefined): string | null {
  const v = (input ?? "").replace(/[,\s]/g, "")
  return MONEY_PATTERN.test(v) ? v : null
}

/** Format for display, e.g. ₱1,500.00. Values come from numeric columns. */
export function formatMoney(value: number | string | null | undefined, currency = "PHP"): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0)
  try {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
  } catch {
    return `${currency} ${n.toFixed(2)}`
  }
}

/** Exact cents of a numeric(12,2) value (for display-only comparisons). */
export const cents = (value: number | string | null | undefined) => Math.round(Number(value ?? 0) * 100)

export const PAYMENT_METHODS = ["cash", "bank_transfer", "check", "card", "e_wallet", "other"] as const
export const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  check: "Check",
  card: "Card (in person)",
  e_wallet: "E-wallet",
  online: "Online",
  other: "Other",
}
