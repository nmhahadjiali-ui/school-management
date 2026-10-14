// Timetable time slots (the bell schedule): parsing typed ranges, built-in
// templates and short previews. Times are "HH:MM" (24-hour). No imports, so
// the unit tests can load this file directly.

export type SlotItem = { day_of_week: number; start_time: string; end_time: string }

const pad = (n: number) => String(n).padStart(2, "0")
const RANGE = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|—|to)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i

function toTime(h: number, m: number, suffix: string | undefined): string | null {
  if (suffix) {
    if (h < 1 || h > 12) return null
    h = (h % 12) + (suffix.toLowerCase() === "pm" ? 12 : 0)
  }
  if (h > 23 || m > 59) return null
  return `${pad(h)}:${pad(m)}`
}

/**
 * "8:00-9:30, 9:30-11:00" (commas, semicolons or new lines; 24-hour, or with
 * am/pm) -> [{start, end}]. Unreadable parts are returned as errors.
 */
export function parseTimeRanges(input: string): { ranges: { start_time: string; end_time: string }[]; errors: string[] } {
  const ranges: { start_time: string; end_time: string }[] = []
  const errors: string[] = []
  for (const part of input.split(/[,;\n]+/).map((p) => p.trim()).filter(Boolean)) {
    const m = RANGE.exec(part)
    const end = m && toTime(Number(m[4]), Number(m[5] ?? 0), m[6])
    let start = m && toTime(Number(m[1]), Number(m[2] ?? 0), m[3] ?? m[6])
    // "11:00-12:30pm": a suffix on the end only also fits the start when it keeps start < end.
    if (m && !m[3] && m[6] && start && end && start >= end) start = toTime(Number(m[1]), Number(m[2] ?? 0), m[6].toLowerCase() === "pm" ? "am" : "pm")
    if (!start || !end) errors.push(`Could not read “${part}”. Use a range like 8:00-9:30.`)
    else if (start >= end) errors.push(`“${part}”: the end time must be after the start time.`)
    else if (!ranges.some((r) => r.start_time === start && r.end_time === end)) ranges.push({ start_time: start, end_time: end })
  }
  return { ranges, errors }
}

const week = (days: number[], ranges: [string, string][]): SlotItem[] =>
  days.flatMap((day_of_week) => ranges.map(([start_time, end_time]) => ({ day_of_week, start_time, end_time })))

const MON_FRI = [1, 2, 3, 4, 5]

export const SLOT_PRESETS: { key: string; name: string; items: SlotItem[] }[] = [
  {
    key: "builtin:blocks-90",
    name: "Monday–Friday · 90-minute blocks",
    items: week(MON_FRI, [["08:00", "09:30"], ["09:30", "11:00"], ["11:00", "12:30"], ["13:30", "15:00"], ["15:00", "16:30"]]),
  },
  {
    key: "builtin:periods-60",
    name: "Monday–Friday · 60-minute periods",
    items: week(MON_FRI, [["07:30", "08:30"], ["08:30", "09:30"], ["09:45", "10:45"], ["10:45", "11:45"], ["13:00", "14:00"], ["14:00", "15:00"], ["15:00", "16:00"]]),
  },
  {
    key: "builtin:mon-sat-90",
    name: "Monday–Saturday · 90-minute blocks (half-day Saturday)",
    items: [
      ...week(MON_FRI, [["08:00", "09:30"], ["09:30", "11:00"], ["11:00", "12:30"], ["13:30", "15:00"], ["15:00", "16:30"]]),
      ...week([6], [["08:00", "09:30"], ["09:30", "11:00"], ["11:00", "12:30"]]),
    ],
  },
]

export function slotsAddedMessage(added: number, total: number) {
  if (!added) return "All of these time slots already exist."
  const kept = total - added
  return `Added ${added} time slot${added === 1 ? "" : "s"}${kept ? `; ${kept} already existed` : ""}.`
}

const short = (t: string) => t.slice(0, 5)
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

/** One line per group of days with the same times, Sunday first: "Mon–Fri: 08:00–09:30, 09:30–11:00". */
export function slotPreview(items: SlotItem[]): string[] {
  const byDay = new Map<number, string>()
  for (const day of [...new Set(items.map((i) => i.day_of_week))].sort((a, b) => (a % 7) - (b % 7))) {
    const times = items
      .filter((i) => i.day_of_week === day)
      .map((i) => `${short(i.start_time)}–${short(i.end_time)}`)
      .sort()
    byDay.set(day, times.join(", "))
  }
  const lines: string[] = []
  const days = [...byDay.keys()]
  for (let i = 0; i < days.length; ) {
    let j = i
    while (j + 1 < days.length && days[j + 1] % 7 === (days[j] % 7) + 1 && byDay.get(days[j + 1]) === byDay.get(days[i])) j++
    const label = i === j ? DAY_SHORT[days[i] - 1] : `${DAY_SHORT[days[i] - 1]}–${DAY_SHORT[days[j] - 1]}`
    lines.push(`${label}: ${byDay.get(days[i])}`)
    i = j + 1
  }
  return lines
}
