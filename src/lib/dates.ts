// Date helpers that respect the school's time zone (no external dependencies).

/** YYYY-MM-DD for "now" in an IANA time zone. */
export function todayIn(timeZone = "UTC") {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

/** ISO weekday (1 = Monday … 7 = Sunday) of a YYYY-MM-DD date. */
export function isoWeekday(date: string) {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay()
  return d === 0 ? 7 : d
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const

/** Sort ISO weekdays for display: Sunday first, then Monday … Saturday. */
export const sundayFirst = (a: number, b: number) => (a % 7) - (b % 7)

/** "08:00:00" -> "8:00 AM" */
export function formatTime(t: string) {
  const [h, m] = t.split(":").map(Number)
  const suffix = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`
}

export function formatDateTime(value: string | null | undefined, timeZone?: string) {
  if (!value) return "—"
  try {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  }
}

export const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))

/** Offset (minutes) of `timeZone` from UTC at instant `at`. */
function offsetMinutes(timeZone: string, at: Date) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value ?? "GMT"
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/)
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0
}

/** "2026-10-15T23:59" wall-clock time in `timeZone` -> ISO instant (UTC). */
export function zonedToIso(local: string, timeZone = "UTC") {
  const guess = new Date(`${local}:00Z`)
  return new Date(guess.getTime() - offsetMinutes(timeZone, guess) * 60_000).toISOString()
}

/** ISO instant -> "YYYY-MM-DDTHH:MM" wall-clock time in `timeZone` (for datetime-local inputs). */
export function isoToZonedInput(iso: string | null, timeZone = "UTC") {
  if (!iso) return ""
  const d = new Date(iso)
  return new Date(d.getTime() + offsetMinutes(timeZone, d) * 60_000).toISOString().slice(0, 16)
}

/** Has an ISO instant already passed (evaluated at request time on the server)? */
export function isPast(iso: string | null | undefined) {
  return iso ? new Date(iso).getTime() < Date.now() : false
}

/** School setting for how dates are shown (school_settings.date_format). */
export const DATE_FORMATS = [
  { value: "medium", label: "Mar 30, 2026" },
  { value: "long", label: "March 30, 2026" },
  { value: "iso", label: "2026-03-30" },
] as const
export type DateFormat = (typeof DATE_FORMATS)[number]["value"]

/**
 * A date ("2026-03-30") or timestamp in the school's date format. Plain dates
 * are calendar days and never shift with the time zone; timestamps are shown
 * in `timeZone`. `withTime` adds the time of day to timestamps.
 */
export function displayDate(value: string | null | undefined, format: DateFormat = "medium", timeZone?: string, withTime = false) {
  if (!value) return "—"
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const at = new Date(dateOnly ? `${value}T00:00:00Z` : value)
  if (Number.isNaN(at.getTime())) return value
  const fmt = (locale: string, opts: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(locale, { ...opts, timeZone: dateOnly ? "UTC" : timeZone }).format(at)
    } catch {
      return new Intl.DateTimeFormat(locale, { ...opts, timeZone: dateOnly ? "UTC" : undefined }).format(at)
    }
  }
  // en-CA formats as YYYY-MM-DD.
  const date = format === "iso" ? (dateOnly ? value : fmt("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" })) : fmt("en-US", { dateStyle: format })
  return withTime && !dateOnly ? `${date}, ${fmt("en-US", { timeStyle: "short" })}` : date
}
