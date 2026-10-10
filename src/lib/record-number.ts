// Student / employee number formats. The database assigns the numbers
// (private.format_record_number); this mirror is only for previews.

export const NUMBER_FORMAT_HELP =
  "Type anything, e.g. ISF-2026- . Optional: {YYYY} = year, {YY} = 2-digit year, {####} = counter with leading zeros (one # per digit). Without {####} the counter is added at the end."

// Any printable character except braces, plus the tokens (same as private.valid_number_format).
const FORMAT_RE = /^([^{}\u0000-\u001f\u007f]|\{YYYY\}|\{YY\}|\{#{1,8}\})+$/

export function numberFormatProblem(format: string): string | null {
  if (format.length < 1 || format.length > 40) return "Use 1–40 characters."
  if (!FORMAT_RE.test(format)) return "Curly braces { } are only allowed in {YYYY}, {YY} and {####}."
  if ((format.match(/\{#+\}/g) ?? []).length > 1) return "Use the counter {####} at most once."
  return null
}

export function formatRecordNumber(format: string, n: number, year: number): string {
  const counted = /\{#+\}/.test(format) ? format : `${format}{#}`
  return counted
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
