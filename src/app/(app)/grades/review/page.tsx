import type { Metadata } from "next"
import { Suspense } from "react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { EmptyState, PageHeader } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, TableSkeleton } from "@/components/data/list"
import { GradeEditFields } from "@/components/academics/fields"
import { GradeReviewTable } from "@/components/academics/grade-review"
import { editGrade, reviewFiltered } from "@/lib/actions/operations"
import { requireFeatureFor } from "@/lib/auth/session"
import { isUuid, parseListParams, type SearchParams } from "@/lib/list-params"
import { sectionOptions, subjectOptions, yearOptions } from "@/lib/options"
import { listAcademicYears, listActiveSubjects, listSectionOptions, pickYear } from "@/services/academic"
import { GRADE_SORTS, listGradingPeriods, listGrades } from "@/services/operations"

export const metadata: Metadata = { title: "Grade review" }

const STATUSES = ["submitted", "approved", "locked", "draft"]

export default async function GradeReviewPage({ searchParams }: PageProps<"/grades/review">) {
  const ctx = await requireFeatureFor("school.records.manage", "grades")
  const schoolId = ctx.profile.school_id!
  const sp = await searchParams
  const { data: years } = await listAcademicYears(schoolId)
  const year = pickYear(years ?? [], typeof sp.year === "string" ? sp.year : undefined)
  if (!year) return <Alert tone="info">Create an academic year first.</Alert>
  const [periods, sections, subjects] = await Promise.all([listGradingPeriods(schoolId, year.id), listSectionOptions(schoolId, year.id), listActiveSubjects(schoolId)])
  const filters: Record<string, string> = { year: year.id }
  for (const f of ["period", "section", "subject"]) {
    const v = sp[f]
    if (typeof v === "string" && isUuid(v)) filters[f] = v
  }

  return (
    <>
      <PageHeader
        title="Grade review"
        description="Approve submitted grades to publish them to students and parents; lock approved grades to make them final."
        actions={
          <>
            <ConfirmAction size="md" trigger="Approve all submitted" title="Approve every submitted grade matching the filters?" description="They become visible to students and parents, who are notified." confirmLabel="Approve" onConfirm={reviewFiltered.bind(null, filters, "approve", undefined)} />
            <ConfirmAction destructive size="md" trigger="Lock all approved" title="Lock every approved grade matching the filters?" description="Locked grades are final; changing one later requires unlocking with a reason." confirmLabel="Lock" onConfirm={reviewFiltered.bind(null, filters, "lock", undefined)} />
          </>
        }
      />
      <Card>
        <ListToolbar
          searchPlaceholder="Search student…"
          filters={[
            { name: "year", label: "Academic year", options: yearOptions(years ?? []), allLabel: `${year.name} (default)` },
            { name: "period", label: "Periods", options: (periods.data ?? []).map((p) => ({ value: p.id, label: p.name })) },
            { name: "section", label: "Sections", options: sectionOptions((sections.data ?? []) as { id: string; name: string; grade_level: { name: string } | null }[]) },
            { name: "subject", label: "Subjects", options: subjectOptions(subjects.data ?? []) },
            { name: "status", label: "Status", options: STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), allLabel: "Submitted (default)" },
          ]}
        />
        <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
          <ReviewTable schoolId={schoolId} filters={filters} sp={sp} />
        </Suspense>
      </Card>
    </>
  )
}

async function ReviewTable({ schoolId, filters, sp }: { schoolId: string; filters: Record<string, string>; sp: SearchParams }) {
  const p = parseListParams(sp, { sorts: GRADE_SORTS, defaultSort: "student", filters: ["status"] })
  p.filters = { ...filters, status: p.filters.status && STATUSES.includes(p.filters.status) ? p.filters.status : "submitted" }
  const page = await listGrades(schoolId, p)
  if (page.error) return <Alert tone="error" className="m-4">Grades could not be loaded.</Alert>
  if (page.total === 0) return <EmptyState title={`No ${p.filters.status} grades`} description="Change the filters to see other grades." />
  const editSlot = Object.fromEntries(
    page.rows
      .filter((g) => g.status !== "locked")
      .map((g) => [
        g.id,
        <FormDialog key={g.id} trigger="Edit" variant="secondary" size="sm" title={`Edit grade: ${g.student.first_name} ${g.student.last_name}`} description={`${g.subject.name} · ${g.period.name}`} action={editGrade.bind(null, g.id)}>
          <GradeEditFields score={Number(g.score)} remarks={g.remarks} />
        </FormDialog>,
      ])
  )
  return (
    <>
      <GradeReviewTable
        key={JSON.stringify(sp)}
        editSlot={editSlot}
        rows={page.rows.map((g) => ({
          id: g.id,
          student: `${g.student.last_name}, ${g.student.first_name}`,
          studentId: g.student.id,
          number: g.student.student_number,
          klass: `${g.subject.name} · ${g.section.grade_level.name} – ${g.section.name}`,
          teacher: `${g.teacher.first_name} ${g.teacher.last_name}`,
          period: g.period.name,
          score: Number(g.score),
          status: g.status,
        }))}
      />
      <Pagination pathname="/grades/review" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
