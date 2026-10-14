import { Plus, X } from "lucide-react"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { EmptyState } from "@/components/ui/misc"
import { DayCard } from "@/components/academics/day-card"
import { DayClassFields, ScheduleFields } from "@/components/academics/fields"
import { clearDayTimeSlots, createSchedule, deleteSchedule, deleteTimeSlot, updateSchedule } from "@/lib/actions/operations"
import { formatTime, sundayFirst, WEEKDAYS } from "@/lib/dates"
import type { ScheduleRow, TimeSlot } from "@/services/operations"

type Option = { value: string; label: string }
type Slot = { id: string | null; day_of_week: number; start_time: string; end_time: string; classes: ScheduleRow[] }

const key = (r: { day_of_week: number; start_time: string; end_time: string }) => `${r.day_of_week}|${r.start_time.slice(0, 5)}|${r.end_time.slice(0, 5)}`
/** Shown only while the day card is in edit mode (see DayCard). */
const EDIT_ONLY = "hidden group-data-[editing=true]:flex"

/**
 * Weekly board built from the year's time slots, Sunday first. Each day card
 * lists its slots and their classes; its Edit button reveals the class
 * Edit/Remove buttons, slot removal and "Add class" at the bottom. Classes at
 * a time that is not a saved slot still appear, marked "custom time".
 * `single` (a section or teacher is chosen): a slot holds at most one class.
 */
export function ScheduleBoard({
  yearId,
  slots,
  rows,
  loads,
  allLoads,
  loadId,
  show,
  single,
  editable,
}: {
  yearId: string
  slots: TimeSlot[]
  rows: ScheduleRow[]
  /** Loads offered by "Add class" (narrowed to the chosen section/teacher). */
  loads: Option[]
  /** Loads offered when editing a class. */
  allLoads: Option[]
  loadId: (r: ScheduleRow) => string
  show: "teacher" | "section" | "both"
  single: boolean
  editable: boolean
}) {
  const byKey = new Map<string, Slot>()
  for (const s of slots) byKey.set(key(s), { ...s, classes: [] })
  for (const r of rows) {
    const k = key(r)
    if (!byKey.has(k)) byKey.set(k, { id: null, day_of_week: r.day_of_week, start_time: r.start_time, end_time: r.end_time, classes: [] })
    byKey.get(k)!.classes.push(r)
  }
  const sectionLabel = (r: ScheduleRow) => `${r.section.grade_level.name} – ${r.section.name}`
  for (const s of byKey.values()) s.classes.sort((a, b) => sectionLabel(a).localeCompare(sectionLabel(b), undefined, { numeric: true }))
  const all = [...byKey.values()].sort((a, b) => a.start_time.localeCompare(b.start_time) || a.end_time.localeCompare(b.end_time))
  const days = [...new Set(all.map((s) => s.day_of_week))].sort(sundayFirst)
  if (days.length === 0) {
    return <EmptyState title="No time slots yet" description="Add time slots or use a template, then press Edit on a day to add classes." />
  }

  return (
    <div className="grid gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {days.map((day) => {
        const daySlots = all.filter((s) => s.day_of_week === day)
        const dayName = WEEKDAYS[day - 1]
        return (
          <DayCard key={day} title={dayName} editable={editable}>
            <ul className="flex-1 divide-y divide-border">
              {daySlots.map((s) => {
                const time = `${formatTime(s.start_time)} – ${formatTime(s.end_time)}`
                return (
                  <li key={key(s)} className="space-y-1.5 px-2 py-2 text-sm">
                    <div className="flex min-h-5 items-center justify-between gap-1">
                      <p className="tabular-nums text-[11px] font-medium text-muted">
                        {time}
                        {!s.id && <span className="font-normal"> · custom time</span>}
                        {s.classes.length > 1 && <span className="font-normal"> · {s.classes.length} classes</span>}
                      </p>
                      {editable && s.id && (
                        <div className={EDIT_ONLY}>
                          <ConfirmAction
                            destructive
                            trigger={<><X className="size-3.5" aria-hidden /><span className="sr-only">Remove time slot {time}</span></>}
                            title={`Remove the ${dayName} ${time} slot?`}
                            description={s.classes.length ? "The classes in this slot stay on the timetable (shown as custom time)." : "This empty time slot is removed."}
                            confirmLabel="Remove slot"
                            onConfirm={deleteTimeSlot.bind(null, s.id)}
                          />
                        </div>
                      )}
                    </div>
                    {s.classes.length === 0 && <p className="text-xs text-slate-400">Free</p>}
                    {s.classes.map((r) => (
                      <div key={r.id} className="rounded-md bg-brand/10 px-2 py-1.5">
                        {/* Overview (no section/teacher chosen): section first, so a busy slot reads as a list of sections. */}
                        <p className="text-[13px] font-medium leading-snug">{show === "both" ? sectionLabel(r) : r.subject.name}</p>
                        <p className="text-xs leading-snug text-muted">
                          {show === "both" ? `${r.subject.name} · ${r.teacher.first_name} ${r.teacher.last_name}` : show === "teacher" ? `${r.teacher.first_name} ${r.teacher.last_name}` : sectionLabel(r)}
                          {r.room && ` · Room ${r.room}`}
                        </p>
                        {editable && (
                          <div className={`${EDIT_ONLY} mt-1.5 flex-wrap gap-1.5`}>
                            <FormDialog trigger="Edit" variant="secondary" size="sm" title="Edit class" action={updateSchedule.bind(null, r.id)}>
                              <ScheduleFields loads={allLoads} value={{ ...r, teaching_load_id: loadId(r) }} />
                            </FormDialog>
                            <ConfirmAction destructive trigger="Remove" title="Remove this class from the schedule?" description={`${r.subject.name}, ${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}. Attendance and grades are not affected.`} confirmLabel="Remove" onConfirm={deleteSchedule.bind(null, r.id)} />
                          </div>
                        )}
                      </div>
                    ))}
                  </li>
                )
              })}
            </ul>
            {editable && (
              <div className={`${EDIT_ONLY} flex-wrap items-center justify-between gap-1.5 border-t border-border px-2 py-2`}>
                {loads.length > 0 && (
                  <FormDialog
                    trigger={<><Plus className="size-4" aria-hidden /> Add class</>}
                    size="sm"
                    title={`Add a class on ${dayName}`}
                    description="Choose the time slot, then the subject, section and teacher."
                    action={createSchedule}
                    submitLabel="Add class"
                  >
                    <DayClassFields
                      day={day}
                      loads={loads}
                      slots={daySlots.filter((s) => s.id).map((s) => ({ start_time: s.start_time, end_time: s.end_time, label: `${formatTime(s.start_time)} – ${formatTime(s.end_time)}`, taken: single && s.classes.length > 0 }))}
                    />
                  </FormDialog>
                )}
                {daySlots.some((s) => s.id) && (
                  <ConfirmAction
                    destructive
                    trigger="Clear slots"
                    title={`Remove all ${dayName} time slots?`}
                    description="Only the empty time grid is removed. Classes already scheduled stay on the timetable."
                    confirmLabel="Remove slots"
                    onConfirm={clearDayTimeSlots.bind(null, yearId, day)}
                  />
                )}
              </div>
            )}
          </DayCard>
        )
      })}
    </div>
  )
}
