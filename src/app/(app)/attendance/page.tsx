import type { Metadata } from "next"
import Link from "next/link"
import { BarChart3, Lock } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { EmptyState, PageHeader } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { AttendanceSheet } from "@/components/academics/attendance-sheet"
import { DateFilter } from "@/components/academics/date-filter"
import { setAttendanceLock } from "@/lib/actions/operations"
import { requireAcademicActor } from "@/lib/auth/session"
import { isIsoDate, todayIn } from "@/lib/dates"
import { isUuid } from "@/lib/list-params"
import { sectionOptions } from "@/lib/options"
import { formatDate } from "@/lib/utils"
import { listSectionOptions, myTeachingSections } from "@/services/academic"
import { attendanceSession, editableForTeacher, rosterOn } from "@/services/operations"
import { getSchoolSettings } from "@/services/settings"

export const metadata: Metadata = { title: "Attendance" }

/**
 * Teacher: select one of their sections + a date, mark, save.
 * School admin: any section; can edit past the window, lock and unlock.
 */
export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const actor = await requireAcademicActor("attendance")
  const sp = await searchParams
  const year = actor.current_academic_year
  const today = todayIn(actor.school?.timezone)
  if (!year) {
    return (
      <>
        <PageHeader title="Attendance" />
        <Alert tone="info">Set a current academic year to take attendance.</Alert>
      </>
    )
  }

  const sections = actor.isAdmin
    ? ((await listSectionOptions(actor.schoolId, year.id)).data ?? []) as { id: string; name: string; grade_level: { name: string } | null }[]
    : (await myTeachingSections(actor.teacherId!, year.id)).data.map((s) => ({ id: s.id, name: s.name, grade_level: s.grade_level }))
  const date = isIsoDate(sp.date) && sp.date <= today ? sp.date : today
  const sectionId = typeof sp.section === "string" && isUuid(sp.section) && sections.some((s) => s.id === sp.section) ? sp.section : sections.length === 1 ? sections[0].id : undefined
  const section = sections.find((s) => s.id === sectionId)

  return (
    <>
      <PageHeader
        title="Attendance"
        description={actor.isAdmin ? "Record, review, lock or unlock daily attendance for any section." : "Daily attendance for your sections."}
        actions={<LinkButton href="/attendance/reports" variant="secondary"><BarChart3 className="size-4" aria-hidden /> Reports</LinkButton>}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-border">
          <div className="flex-1">
            <ListToolbar filters={[{ name: "section", label: "Section", options: sectionOptions(sections), allLabel: "Choose a section…" }]} />
          </div>
          <div className="px-4 py-3 sm:pl-0">
            <DateFilter value={date} max={today} min={year.start_date} />
          </div>
        </div>
        {sections.length === 0 ? (
          <EmptyState title="No sections" description={actor.isAdmin ? "Create sections for the current year first." : "You are not assigned to any section this year."} />
        ) : !section ? (
          <p className="px-5 py-10 text-center text-sm text-muted">Choose a section to take attendance.</p>
        ) : (
          <SheetFor actor={actor} sectionId={section.id} sectionLabel={`${section.grade_level?.name ?? ""} – ${section.name}`} date={date} today={today} />
        )}
      </Card>
    </>
  )
}

async function SheetFor({
  actor,
  sectionId,
  sectionLabel,
  date,
  today,
}: {
  actor: Awaited<ReturnType<typeof requireAcademicActor>>
  sectionId: string
  sectionLabel: string
  date: string
  today: string
}) {
  const [roster, session, settings] = await Promise.all([rosterOn(sectionId, date), attendanceSession(sectionId, date), getSchoolSettings(actor.schoolId)])
  const s = session.data
  const editDays = settings.data?.attendance_edit_days ?? null
  const editable = actor.isAdmin || editableForTeacher(s, editDays, today)
  const byEnrollment = new Map((s?.records ?? []).map((r) => [r.enrollment_id, r]))

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 px-4 py-2.5 text-sm">
        <p>
          <span className="font-semibold">{sectionLabel}</span> · {formatDate(date, "UTC")}
          {s ? (
            <span className="ml-2 text-muted">
              {s.status === "locked" ? <><Lock className="inline size-3.5" aria-hidden /> Locked</> : "Recorded"} · last saved {formatDate(s.updated_at)}
            </span>
          ) : (
            <span className="ml-2 text-muted">Not recorded yet</span>
          )}
        </p>
        {actor.isAdmin && s && (
          s.status === "locked" ? (
            <ConfirmAction trigger="Unlock" title="Unlock this attendance?" description="Teachers will be able to edit it again (within the school's editing window)." confirmLabel="Unlock" onConfirm={setAttendanceLock.bind(null, s.id, false)} />
          ) : (
            <ConfirmAction destructive trigger="Lock" title="Lock this attendance?" description="Teachers can no longer change it. Administrators can still correct or unlock it." confirmLabel="Lock" onConfirm={setAttendanceLock.bind(null, s.id, true)} />
          )
        )}
      </div>
      {!editable && (
        <Alert tone="info" className="m-4">
          {s?.status === "locked" ? "This attendance is locked." : `Attendance older than ${editDays} day${editDays === 1 ? "" : "s"} can only be changed by a school administrator.`}
        </Alert>
      )}
      {roster.data.length === 0 ? (
        <EmptyState title="No students enrolled on this date" description="Enrollment dates decide who appears on each day's list." />
      ) : (
        <AttendanceSheet
          key={`${sectionId}-${date}-${s?.updated_at ?? "new"}`}
          sectionId={sectionId}
          date={date}
          editable={editable}
          recorded={Boolean(s)}
          students={roster.data.map((r) => {
            const rec = byEnrollment.get(r.enrollment_id)
            return { enrollment_id: r.enrollment_id, name: `${r.student.last_name}, ${r.student.first_name}`, number: r.student.student_number, status: rec?.status ?? null, remarks: rec?.remarks ?? null }
          })}
        />
      )}
      {!actor.isAdmin && editDays !== null && (
        <p className="border-t border-border px-4 py-2 text-xs text-muted">
          Your school allows teachers to edit attendance up to {editDays} day{editDays === 1 ? "" : "s"} back. <Link href="/attendance/reports" className="text-brand hover:underline">View reports</Link>
        </p>
      )}
    </>
  )
}
