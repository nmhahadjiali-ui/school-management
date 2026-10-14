"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { CheckboxField, useFieldError, useFieldErrors } from "@/components/ui/form"
import { DAY_OPTIONS } from "@/components/academics/fields"
import { rangesOverlap, type SlotItem } from "@/lib/schedule-slots"
import { cn } from "@/lib/utils"

type Row = { start: string; end: string }
type Break = { after: number; minutes: number }

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}
const toTime = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`
const LENGTHS = [45, 50, 60, 90]
const input = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm shadow-sm"

/** First start + period length + number of periods + breaks -> rows (stops at midnight). */
function generate(start: string, length: number, count: number, breaks: Break[]): Row[] {
  if (!/^\d{2}:\d{2}$/.test(start) || length < 5 || count < 1) return []
  const rows: Row[] = []
  let t = toMin(start)
  for (let i = 1; i <= Math.min(count, 20) && t + length <= 24 * 60 - 1; i++) {
    rows.push({ start: toTime(t), end: toTime(t + length) })
    t += length + breaks.filter((b) => b.after === i).reduce((sum, b) => sum + Math.max(0, b.minutes), 0)
  }
  return rows
}

/**
 * "Add time slots": pick days, then build the day's periods from a first
 * start time, a period length, how many periods and optional breaks. The
 * resulting slots are listed and can still be edited one by one. Submits
 * `days`, `times` ("08:00-09:30,09:30-11:00") and `no_overlap`.
 * `existing`: the year's slots, to flag overlaps before saving.
 */
export function TimeSlotFields({ defaultDays = [7, 1, 2, 3, 4], existing = [] }: { defaultDays?: number[]; existing?: SlotItem[] }) {
  const [days, setDays] = useState<number[]>(defaultDays)
  const [noOverlap, setNoOverlap] = useState(true)
  const [start, setStart] = useState("08:00")
  const [length, setLength] = useState(60)
  const [count, setCount] = useState(5)
  const [breaks, setBreaks] = useState<Break[]>([{ after: 2, minutes: 15 }])
  const [rows, setRows] = useState<Row[]>(() => generate("08:00", 60, 5, [{ after: 2, minutes: 15 }]))
  const daysError = useFieldError("days")
  const timesErrors = useFieldErrors("times")

  // Changing the pattern rebuilds the list (row edits apply on top of it).
  const rebuild = (next: Partial<{ start: string; length: number; count: number; breaks: Break[] }>) => {
    const s = next.start ?? start, l = next.length ?? length, c = next.count ?? count, b = next.breaks ?? breaks
    setStart(s); setLength(l); setCount(c); setBreaks(b)
    setRows(generate(s, l, c, b))
  }
  const setRow = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)))
  const addRow = () =>
    setRows((r) => {
      const last = r.at(-1)
      const from = last ? toMin(last.end) : toMin(start)
      return from + length < 24 * 60 ? [...r, { start: toTime(from), end: toTime(from + length) }] : r
    })

  const sorted = rows.map((r, i) => ({ ...r, i })).sort((a, b) => a.start.localeCompare(b.start))
  const bad = new Set(rows.flatMap((r, i) => (!r.start || !r.end || r.start >= r.end ? [i] : [])))
  const overlaps = new Set(sorted.flatMap((r, k) => (k > 0 && r.start < sorted[k - 1].end ? [r.i, sorted[k - 1].i] : [])))
  // Days (short names, Sunday first) on which a row overlaps an existing slot; exact duplicates are skipped, not conflicts.
  const clashDays = (r: Row) =>
    DAY_OPTIONS.filter((d) => days.includes(Number(d.value)))
      .filter((d) => existing.some((e) => e.day_of_week === Number(d.value) && !(e.start_time.slice(0, 5) === r.start && e.end_time.slice(0, 5) === r.end) && rangesOverlap(e, { start_time: r.start, end_time: r.end })))
      .map((d) => d.label.slice(0, 3))
  const rowProblem = (r: Row, i: number) => {
    if (bad.has(i)) return { text: "End must be after start", block: true }
    if (overlaps.has(i)) return { text: "Overlaps another slot", block: noOverlap }
    const clash = r.start && r.end ? clashDays(r) : []
    if (clash.length) return { text: `Overlaps an existing slot (${clash.join(", ")})`, block: noOverlap }
    return null
  }

  return (
    <>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">
          Days <span className="text-red-600">*</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {DAY_OPTIONS.map((d) => (
            <label key={d.value} className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand/10">
              <input
                type="checkbox"
                name="days"
                value={d.value}
                checked={days.includes(Number(d.value))}
                onChange={(e) => setDays((ds) => (e.target.checked ? [...ds, Number(d.value)] : ds.filter((x) => x !== Number(d.value))))}
                className="size-4 accent-[var(--brand)]"
              />
              {d.label.slice(0, 3)}
            </label>
          ))}
        </div>
        {daysError && <p className="text-sm text-red-600">{daysError}</p>}
      </fieldset>

      <fieldset className="space-y-3 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Pattern</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            <span className="block text-muted">First period starts</span>
            <input type="time" value={start} onChange={(e) => rebuild({ start: e.target.value })} className={cn(input, "w-full")} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-muted">Each period (minutes)</span>
            <input type="number" min={5} max={600} step={5} value={length} onChange={(e) => rebuild({ length: Number(e.target.value) })} className={cn(input, "w-full")} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="block text-muted">Number of periods</span>
            <input type="number" min={1} max={20} value={count} onChange={(e) => rebuild({ count: Number(e.target.value) })} className={cn(input, "w-full")} />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Quick length:</span>
          {LENGTHS.map((l) => (
            <button key={l} type="button" onClick={() => rebuild({ length: l })} className={cn("rounded-full border px-2 py-0.5", l === length ? "border-brand bg-brand/10 text-brand" : "border-border hover:bg-slate-50")}>
              {l} min
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {breaks.map((b, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">Break after period</span>
              <input type="number" min={1} max={20} value={b.after} aria-label="Break after period" onChange={(e) => rebuild({ breaks: breaks.map((x, j) => (j === i ? { ...x, after: Number(e.target.value) } : x)) })} className={cn(input, "w-16")} />
              <span className="text-muted">for</span>
              <input type="number" min={5} max={240} step={5} value={b.minutes} aria-label="Break length in minutes" onChange={(e) => rebuild({ breaks: breaks.map((x, j) => (j === i ? { ...x, minutes: Number(e.target.value) } : x)) })} className={cn(input, "w-20")} />
              <span className="text-muted">min</span>
              <button type="button" onClick={() => rebuild({ breaks: breaks.filter((_, j) => j !== i) })} className="rounded p-1 text-muted hover:bg-slate-100 hover:text-red-700" aria-label="Remove break">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => rebuild({ breaks: [...breaks, { after: Math.min(count, (breaks.at(-1)?.after ?? 0) + 2), minutes: 60 }] })}>
            <Plus className="size-4" aria-hidden /> Add a break (recess, lunch…)
          </Button>
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">
          Time slots <span className="font-normal text-muted">({rows.length}) · adjust any row if needed</span>
        </p>
        <ol className="divide-y divide-border rounded-md border border-border">
          {rows.map((r, i) => {
            const problem = rowProblem(r, i)
            return (
            <li key={i} className={cn("flex items-center gap-2 px-3 py-1.5 text-sm", problem && (problem.block ? "bg-red-50" : "bg-amber-50"))}>
              <span className="w-6 text-xs text-muted tabular-nums">{i + 1}.</span>
              <input type="time" value={r.start} aria-label={`Slot ${i + 1} start`} onChange={(e) => setRow(i, { start: e.target.value })} className={input} />
              <span className="text-muted">–</span>
              <input type="time" value={r.end} aria-label={`Slot ${i + 1} end`} onChange={(e) => setRow(i, { end: e.target.value })} className={input} />
              <span className={cn("flex-1 text-xs", problem?.block ? "text-red-700" : "text-amber-800")}>{problem?.text}</span>
              <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="rounded p-1 text-muted hover:bg-slate-100 hover:text-red-700" aria-label={`Remove slot ${i + 1}`}>
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
            )
          })}
          {rows.length === 0 && <li className="px-3 py-3 text-sm text-muted">No slots. Set a pattern above or add one.</li>}
        </ol>
        <Button size="sm" variant="ghost" onClick={addRow}>
          <Plus className="size-4" aria-hidden /> Add one more slot
        </Button>
        {timesErrors.map((e) => (
          <p key={e} className="text-sm text-red-600">{e}</p>
        ))}
        <p className="text-xs text-muted">Slots that already exist on a chosen day are skipped.</p>
      </div>
      <div className="rounded-md border border-border bg-slate-50 p-3" onChange={(e) => { const t = e.target as HTMLInputElement; if (t.name === "no_overlap") setNoOverlap(t.checked) }}>
        <CheckboxField name="no_overlap" label="Don't allow overlapping time slots" defaultChecked hint="Blocks slots that overlap each other or a slot the chosen days already have. Untick to allow overlaps, for example different bell times for different grade levels." />
      </div>
      <input type="hidden" name="times" value={rows.map((r) => `${r.start}-${r.end}`).join(",")} />
    </>
  )
}
