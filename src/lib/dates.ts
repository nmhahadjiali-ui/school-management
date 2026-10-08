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
