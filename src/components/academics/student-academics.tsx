import Link from "next/link"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { Badge, EmptyState, StatusBadge } from "@/components/ui/misc"
import { Timetable } from "@/components/academics/timetable"
import { formatDateTime, isoWeekday, todayIn } from "@/lib/dates"
import { studentEnrollments } from "@/services/academic"
import { listGradingPeriods, listGradingScales, listSchedules, scaleFor, studentAttendanceSummary, studentGrades, upcomingCoursework } from "@/services/operations"
import type { UserContext } from "@/types/domain"

type Student = { id: string; school_id: string; first_name: string }

/**
 * A student's academic picture for the current year: attendance, grades,
 * schedule and upcoming work. Each section queries as the viewer, so RLS
 * decides what appears (students/parents: published grades only; teachers:
 * their own grades; admins: everything). Sections hide when a module is off.
 */
export async function StudentAcademics({ student, ctx }: { student: Student; ctx: UserContext }) {
  const year = ctx.current_academic_year
  if (!year) return null
  const on = (f: string) => ctx.features.includes(f)
  const { data: enrollments } = await studentEnrollments(student.id)
  const current = (enrollments ?? []).find((e) => e.enrollment_status === "enrolled" && e.academic_year_id === year.id)

  const [attendance, grades, periods, scales, schedule, upcoming] = await Promise.all([
    on("attendance") ? studentAttendanceSummary(student.id, year.id) : null,
    on("grades") ? studentGrades(student.id, year.id) : null,
    on("grades") ? listGradingPeriods(student.school_id, year.id) : null,
    on("grades") ? listGradingScales(student.school_id) : null,
    on("schedules") && current?.section ? listSchedules({ yearId: year.id, sectionId: current.section.id }) : null,
    on("coursework") && current?.section ? upcomingCoursework({ sectionIds: [current.section.id] }, 21) : null,
  ])

  const a = attendance?.data
  const pct = a && Number(a.total) ? Math.round(((Number(a.present) + Number(a.late)) / Number(a.total)) * 100) : null
  const subjects = [...new Map((grades?.data ?? []).map((g) => [g.subject.id, g.subject])).values()].sort((x, y) => x.name.localeCompare(y.name))
  const scaleRows = (scales?.data ?? []).map((s) => ({ ...s, minimum_score: Number(s.minimum_score) }))
  const isViewerFamily = ctx.profile.role === "student" || ctx.profile.role === "parent"

  return (
    <>
      {attendance && (
        <Card>
          <CardHeader title="Attendance" description={`${year.name} · daily attendance`} />
          <CardBody>
            {!a || Number(a.total) === 0 ? (
              <p className="text-sm text-muted">No attendance recorded yet this year.</p>
            ) : (
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                {[
                  ["Attendance", pct === null ? "—" : `${pct}%`],
                  ["Present", a.present],
                  ["Absent", a.absent],
                  ["Late", a.late],
                  ["Excused", a.excused],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <dt className="text-xs text-muted">{label}</dt>
                    <dd className="text-2xl font-semibold tabular-nums">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {a && Number(a.total) > 0 && <p className="mt-3 text-xs text-muted">{a.total} school days recorded.</p>}
          </CardBody>
        </Card>
      )}

      {grades && (
        <Card>
          <CardHeader title="Grades" description={isViewerFamily ? `${year.name} · published grades` : year.name} />
          {subjects.length === 0 ? (
            <EmptyState title={isViewerFamily ? "No published grades yet" : "No grades yet"} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Grades by subject and period">
                <thead>
                  <tr className="border-b border-border bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                    <th scope="col" className="px-4 py-2.5">Subject</th>
                    {(periods?.data ?? []).map((p) => <th key={p.id} scope="col" className="px-4 py-2.5 text-right">{p.code}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {subjects.map((s) => (
                    <tr key={s.id} className="border-b border-border">
                      <td className="px-4 py-2.5 font-medium">{s.name}</td>
                      {(periods?.data ?? []).map((p) => {
                        const g = grades.data.find((x) => x.subject.id === s.id && x.period.id === p.id)
                        const band = g ? scaleFor(scaleRows, Number(g.score)) : null
                        return (
                          <td key={p.id} className="px-4 py-2.5 text-right">
                            {g ? (
                              <span title={band ? `${band.name}${band.equivalent ? ` (${band.equivalent})` : ""}` : undefined}>
                                <span className={band && !band.is_passing ? "font-semibold text-red-700" : "font-semibold"}>{Number(g.score)}</span>
                                {!isViewerFamily && g.status !== "approved" && g.status !== "locked" && <span className="ml-1"><StatusBadge status={g.status} /></span>}
                                {band && <span className="block text-xs text-muted">{band.equivalent ?? band.name}</span>}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {schedule && (
        <Card>
          <CardHeader title="Class schedule" description={current?.section ? `${current.grade_level.name} – ${current.section.name}` : undefined} />
          <Timetable rows={schedule.data} show="teacher" highlightDay={isoWeekday(todayIn(ctx.school?.timezone))} />
        </Card>
      )}

      {upcoming && (
        <Card>
          <CardHeader title="Upcoming assignments" description="Due in the next three weeks" />
          {upcoming.data.length === 0 ? (
            <EmptyState title="Nothing due soon" />
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.data.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                  <Link href={`/coursework/${w.id}`} className="font-medium text-brand hover:underline">{w.title}</Link>
                  <span className="text-muted">
                    <Badge>{w.subject.code}</Badge> due {formatDateTime(w.due_at, ctx.school?.timezone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  )
}
