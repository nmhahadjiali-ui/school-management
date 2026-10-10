// Student / employee number formats. The database assigns the numbers
// (private.format_record_number); this mirror is only for previews.

export const NUMBER_FORMAT_HELP = "Use {YYYY} for the year, {YY} for a 2-digit year and {####} for the counter (one # per digit)."

const FORMAT_RE = /^([A-Za-z0-9 ._/-]|\{YYYY\}|\{YY\}|\{#{1,8}\})+$/

/** Same rules as private.valid_number_format. */
export function numberFormatProblem(format: string): string | null {
  if (format.length < 3 || format.length > 40) return "Use 3–40 characters."
  if (!FORMAT_RE.test(format)) return "Use letters, numbers, spaces, . _ / - and the tokens {YYYY}, {YY}, {####}."
  if ((format.match(/\{#+\}/g) ?? []).length !== 1) return "Include the counter exactly once, e.g. {####}."
  return null
}

export function formatRecordNumber(format: string, n: number, year: number): string {
  return format
    .replace(/\{(#+)\}/, (_, hashes: string) => String(n).padStart(hashes.length, "0"))
    .replace("{YYYY}", String(year))
    .replace("{YY}", String(year).slice(-2))
}

/** Current year in the school's time zone. */
export function schoolYearNow(timezone: string): number {
  try {
    return Number(new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric" }).format(new Date()))
  } catch {
    return new Date().getFullYear()
  }
}
