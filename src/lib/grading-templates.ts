// Grading period / grading scale templates: built-in presets and the date
// arithmetic for applying a template to an academic year. Pure functions.

export type PeriodItem = { name: string; code: string; sequence: number; start_offset: number; end_offset: number }
export type PeriodRow = { name: string; code: string; sequence: number; start_date: string; end_date: string }
export type BandItem = { name: string; minimum_score: number; maximum_score: number; equivalent: string | null; description: string | null; is_passing: boolean }

const DAY = 86_400_000
const toDay = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY)
const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`

export const PERIOD_PRESETS = [
  { key: "builtin:quarters", name: "4 Quarters", parts: 4, label: "Quarter", code: "Q" },
  { key: "builtin:semesters", name: "2 Semesters", parts: 2, label: "Semester", code: "S" },
  { key: "builtin:trimesters", name: "3 Trimesters", parts: 3, label: "Trimester", code: "T" },
] as const

/** A preset applied to a year: the year split into equal consecutive periods. */
export function presetPeriods(key: string, yearStart: string, yearEnd: string): PeriodRow[] | null {
  const preset = PERIOD_PRESETS.find((p) => p.key === key)
  if (!preset) return null
  const start = toDay(yearStart)
  const days = toDay(yearEnd) - start + 1
  return Array.from({ length: preset.parts }, (_, i) => ({
    name: `${ordinal(i + 1)} ${preset.label}`,
    code: `${preset.code}${i + 1}`,
    sequence: i + 1,
    start_date: fromDay(start + Math.floor((days * i) / preset.parts)),
    end_date: fromDay(start + Math.floor((days * (i + 1)) / preset.parts) - 1),
  }))
}

/** Save a year's periods as positions within the year (days from its start). */
export function periodsToItems(periods: PeriodRow[], yearStart: string): PeriodItem[] {
  const start = toDay(yearStart)
  return periods.map((p) => ({ name: p.name, code: p.code, sequence: p.sequence, start_offset: toDay(p.start_date) - start, end_offset: toDay(p.end_date) - start }))
}

/**
 * A saved template applied to a year. Periods keep their position from the
 * year's start; an end past the year's last day is moved to that day. Returns
 * an error when a period would start after the year ends.
 */
export function itemsToPeriods(items: PeriodItem[], yearStart: string, yearEnd: string): { rows: PeriodRow[] } | { error: string } {
  const start = toDay(yearStart)
  const end = toDay(yearEnd)
  const rows: PeriodRow[] = []
  for (const it of [...items].sort((a, b) => a.sequence - b.sequence)) {
    const s = start + it.start_offset
    if (s > end) return { error: `“${it.name}” would start after this academic year ends. Use a template made for a year of similar length, or a built-in one.` }
    rows.push({ name: it.name, code: it.code, sequence: it.sequence, start_date: fromDay(s), end_date: fromDay(Math.min(start + it.end_offset, end)) })
  }
  return { rows }
}

export const SCALE_PRESETS = [{ key: "builtin:deped", name: "DepEd K–12 (Philippines)" }] as const

/** DepEd K–12 descriptors, scaled to the school's maximum score (100 by default). */
export function presetBands(key: string, maxScore: number): BandItem[] | null {
  if (key !== "builtin:deped") return null
  const at = (pct: number) => Math.round(maxScore * pct) / 100
  return [
    { name: "Outstanding", minimum_score: at(90), maximum_score: maxScore, equivalent: "O", description: null, is_passing: true },
    { name: "Very Satisfactory", minimum_score: at(85), maximum_score: at(89), equivalent: "VS", description: null, is_passing: true },
    { name: "Satisfactory", minimum_score: at(80), maximum_score: at(84), equivalent: "S", description: null, is_passing: true },
    { name: "Fairly Satisfactory", minimum_score: at(75), maximum_score: at(79), equivalent: "FS", description: null, is_passing: true },
    { name: "Did Not Meet Expectations", minimum_score: 0, maximum_score: at(74), equivalent: "DNME", description: null, is_passing: false },
  ]
}

export const formatBand = (b: Pick<BandItem, "name" | "minimum_score" | "maximum_score">) => `${Number(b.minimum_score)}–${Number(b.maximum_score)} ${b.name}`
