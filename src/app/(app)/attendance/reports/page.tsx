import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { TableSkeleton } from "@/components/data/list"
import { DateFilter } from "@/components/academics/date-filter"
import { requireAcademicActor } from "@/lib/auth/session"
import { isIsoDate, todayIn } from "@/lib/dates"
import { isUuid, listHref, type SearchParams } from "@/lib/list-params"
import { gradeOptions, sectionOptions, yearOptions } from "@/lib/options"
import { cn, formatDate } from "@/lib/utils"
import { listAcademicYears, listGradeLevels, listSectionOptions, myTeachingSections, pickYear } from "@/services/academic"
import { attendanceByDate, sectionAttendanceSummary } from "@/services/operations"

export const metadata: Metadata = { title: "Attendance reports" }

type SectionOpt = { id: string; name: string; grade_level_id?: string; grade_level: { name: string } | null }

export default async function AttendanceReportsPage({ searchParams }: PageProps<"/attendance/reports">) {
  const actor = await requireAcademicActor("attendance")
  const sp = await searchParams
  const view = sp.view === "date" && actor.isAdmin ? "date" : "section"
  const today = todayIn(actor.school?.timezone)
  const { data: years } = await listAcademicYears(actor.schoolId)
  const year = pickYear(years ?? [], typeof sp.year === "string" ? sp.year : undefined)
  if (!year) return <Alert tone="info">Create an academic year first.</Alert>

  const [grades, sectionsRaw] = await Promise.all([
    listGradeLevels(actor.schoolId),
    actor.isAdmin
      ? listSectionOptions(actor.schoolId, year.id).then((r) => (r.data ?? []) as SectionOpt[])
      : myTeachingSections(actor.teacherId!, year.id).then((r) => r.data as SectionOpt[]),
  ])
  const grade = typeof sp.grade === "string" && isUuid(sp.grade) ? sp.grade : undefined
  const sections = grade ? sectionsRaw.filter((s) => !s.grade_level_id || s.grade_level_id === grade) : sectionsRaw
  const tab = (v: string, label: string) => (
    <Link
      href={listHref("/attendance/reports", sp, { view: v === "section" ? null : v })}
      aria-current={view === v ? "page" : undefined}
      className={cn("rounded-md px-3 py-1.5 text-sm font-medium", view === v ? "bg-brand/10 text-brand" : "text-slate-600 hover:bg-slate-100")}
    >
      {label}
    </Link>
  )

  return (
    <>
      <PageHeader title="Attendance reports" description={actor.isAdmin ? "School-wide attendance summaries." : "Attendance summaries for your sections."} />
      <Card>
        {actor.isAdmin && <nav aria-label="Report type" className="flex gap-1 border-b border-border px-3 py-2">{tab("section", "By section")}{tab("date", "By date")}</nav>}
        <div className="flex flex-wrap items-center border-b border-border">
          <div className="flex-1">
            <ListToolbar
              filters={[
                { name: "year", label: "Academic year", options: yearOptions(years ?? []), allLabel: `${year.name} (default)` },
                { name: "grade", label: "Grade levels", options: gradeOptions(grades.data ?? []) },
                ...(view === "section" ? [{ name: "section", label: "Section", options: sectionOptions(sections), allLabel: "Choose a section…" }] : []),
              ]}
            />
          </div>
          <div className="flex flex-wrap gap-3 px-4 py-3">
            {view === "section" ? (
              <>
                <DateFilter name="from" label="From" value={isIsoDate(sp.from) ? sp.from : year.start_date} min={year.start_date} max={today} />
                <DateFilter name="to" label="To" value={isIsoDate(sp.to) ? sp.to : today} min={year.start_date} max={today} />
              </>
            ) : (
              <DateFilter value={isIsoDate(sp.date) ? sp.date : today} max={today} min={year.start_date} />
            )}
          </div>
        </div>
        <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
          {view === "section" ? (
            <SectionReport sp={sp} sections={sections} defaults={{ from: year.start_date, to: today }} />
          ) : (
            <DateReport schoolId={actor.schoolId} yearId={year.id} date={isIsoDate(sp.date) ? sp.date : today} grade={grade} />
          )}
        </Suspense>
      </Card>
    </>
  )
}

const rate = (present: number, late: number, total: number) => (total ? Math.round(((present + late) / total) * 100) : null)

async function SectionReport({ sp, sections, defaults }: { sp: SearchParams; sections: SectionOpt[]; defaults: { from: string; to: string } }) {
  const sectionId = typeof sp.section === "string" && sections.some((s) => s.id === sp.section) ? sp.section : undefined
  if (!sectionId) return <p className="px-5 py-10 text-center text-sm text-muted">Choose a section to see each student&apos;s attendance.</p>
  const from = isIsoDate(sp.from) ? sp.from : defaults.from
  const to = isIsoDate(sp.to) ? sp.to : defaults.to
  const { data, error } = await sectionAttendanceSummary(sectionId, from, to)
  if (error) return <Alert tone="error" className="m-4">The report could not be loaded.</Alert>
  if (!data?.length) return <EmptyState title="No attendance recorded in this period" />
  return (
    <Table label="Attendance by student">
      <thead>
        <tr>
          <Th>Student</Th>
          <Th className="text-right">Present</Th>
          <Th className="text-right">Absent</Th>
          <Th className="text-right">Late</Th>
          <Th className="text-right">Excused</Th>
          <Th className="text-right">Days</Th>
          <Th className="text-right">Attendance</Th>
        </tr>
      </thead>
      <tbody>
        {data.map((r) => {
          const pct = rate(Number(r.present), Number(r.late), Number(r.total))
          return (
            <tr key={r.student_id}>
              <Td><Link href={`/students/${r.student_id}`} className="font-medium text-brand hover:underline">{r.last_name}, {r.first_name}</Link></Td>
              <Td className="text-right tabular-nums">{r.present}</Td>
              <Td className="text-right tabular-nums">{r.absent}</Td>
              <Td className="text-right tabular-nums">{r.late}</Td>
              <Td className="text-right tabular-nums">{r.excused}</Td>
              <Td className="text-right tabular-nums">{r.total}</Td>
              <Td className="text-right">{pct === null ? "—" : <Badge tone={pct >= 90 ? "green" : pct >= 75 ? "amber" : "red"}>{pct}%</Badge>}</Td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}

async function DateReport({ schoolId, yearId, date, grade }: { schoolId: string; yearId: string; date: string; grade?: string }) {
  const { data, error } = await attendanceByDate(schoolId, yearId, date, grade)
  if (error) return <Alert tone="error" className="m-4">The report could not be loaded.</Alert>
  if (!data.length) return <EmptyState title="No sections" />
  const taken = data.filter((r) => r.sessionId).length
  return (
    <>
      <p className="px-4 py-3 text-sm text-muted">
        {formatDate(date, "UTC")}: attendance taken in <span className="font-semibold text-foreground">{taken}</span> of {data.length} sections.
      </p>
      <Table label="Attendance by section">
        <thead>
          <tr>
            <Th>Section</Th>
            <Th>Status</Th>
            <Th className="text-right">Present</Th>
            <Th className="text-right">Absent</Th>
            <Th className="text-right">Late</Th>
            <Th className="text-right">Excused</Th>
          </tr>
        </thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.section.id}>
              <Td>
                <Link href={`/attendance?section=${r.section.id}&date=${date}`} className="font-medium text-brand hover:underline">
                  {r.section.grade_level.name} – {r.section.name}
                </Link>
              </Td>
              <Td>{r.sessionId ? <Badge tone={r.locked ? "gray" : "green"}>{r.locked ? "Locked" : "Taken"}</Badge> : <Badge tone="amber">Not taken</Badge>}</Td>
              <Td className="text-right tabular-nums">{r.present}</Td>
              <Td className="text-right tabular-nums">{r.absent}</Td>
              <Td className="text-right tabular-nums">{r.late}</Td>
              <Td className="text-right tabular-nums">{r.excused}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  )
}
