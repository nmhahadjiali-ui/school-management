import { EmptyState } from "@/components/ui/misc"
import { formatTime, WEEKDAYS } from "@/lib/dates"
import { cn } from "@/lib/utils"
import type { ScheduleRow } from "@/services/operations"

/**
 * Weekly timetable grouped by day (responsive: stacked on phones, columns on
 * wide screens). `show` picks the secondary line: the section (teacher view)
 * or the teacher (student/section view).
 */
export function Timetable({
  rows,
  show = "teacher",
  highlightDay,
  actions,
}: {
  rows: ScheduleRow[]
  show?: "teacher" | "section" | "both"
  highlightDay?: number
  actions?: (row: ScheduleRow) => React.ReactNode
}) {
  if (rows.length === 0) return <EmptyState title="No classes scheduled" />
  const days = [...new Set(rows.map((r) => r.day_of_week))].sort()
  return (
    <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))]">
      {days.map((day) => (
        <section key={day} aria-label={WEEKDAYS[day - 1]} className={cn("rounded-lg border border-border", day === highlightDay && "border-brand ring-1 ring-brand")}>
          <h3 className="border-b border-border bg-slate-50 px-3 py-2 text-sm font-semibold">
            {WEEKDAYS[day - 1]} {day === highlightDay && <span className="font-normal text-brand">(today)</span>}
          </h3>
          <ul className="divide-y divide-border">
            {rows
              .filter((r) => r.day_of_week === day)
              .map((r) => (
                <li key={r.id} className="px-3 py-2.5 text-sm">
                  <p className="tabular-nums text-xs text-muted">
                    {formatTime(r.start_time)} – {formatTime(r.end_time)}
                    {r.room && ` · Room ${r.room}`}
                  </p>
                  <p className="font-medium">{r.subject.name}</p>
                  <p className="text-muted">
                    {show !== "teacher" && `${r.section.grade_level.name} – ${r.section.name}`}
                    {show === "both" && " · "}
                    {show !== "section" && `${r.teacher.first_name} ${r.teacher.last_name}`}
                  </p>
                  {actions && <div className="mt-2 flex gap-2">{actions(r)}</div>}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
