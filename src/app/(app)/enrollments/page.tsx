import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { FileSpreadsheet, Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FormDialog } from "@/components/ui/form-dialog"
import { Badge, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, SortTh, TableSkeleton } from "@/components/data/list"
import { AssignSectionFields, EnrollmentFields } from "@/components/school/fields"
import { assignEnrollmentSection, enrollStudent } from "@/lib/actions/academic"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { isUuid, parseListParams, type SearchParams } from "@/lib/list-params"
import { gradeOptions, sectionOptions, yearOptions } from "@/lib/options"
import { formatDate } from "@/lib/utils"
import { ENROLLMENT_SORTS, listAcademicYears, listEnrollments, listGradeLevels, listSectionOptions, pickYear } from "@/services/academic"

export const metadata: Metadata = { title: "Enrollments" }

type SectionOpt = { id: string; name: string; grade_level_id: string; grade_level: { name: string } | null }
const STATUSES = ["enrolled", "completed", "transferred", "withdrawn"]

export default async function EnrollmentsPage({ searchParams }: PageProps<"/enrollments">) {
  const ctx = await requireSchoolAdmin()
  const sp = await searchParams
  const [years, grades] = await Promise.all([listAcademicYears(ctx.schoolId), listGradeLevels(ctx.schoolId)])
  const year = pickYear(years.data ?? [], typeof sp.year === "string" ? sp.year : undefined)
  const { data: sections } = year ? await listSectionOptions(ctx.schoolId, year.id) : { data: [] }
  const sectionList = (sections ?? []) as SectionOpt[]
  const open = year && year.status !== "archived"

  return (
    <>
      <PageHeader
        title="Enrollments"
        description="Each student's placement per academic year. Closed placements are kept as history."
        actions={
          open ? (
            <>
              <LinkButton href={`/enrollments/import?year=${year.id}`} variant="secondary"><FileSpreadsheet className="size-4" aria-hidden /> Import from Excel</LinkButton>
              <FormDialog trigger={<><Plus className="size-4" aria-hidden /> Enroll student</>} title={`Enroll a student in ${year.name}`} action={enrollStudent} submitLabel="Enroll">
                <EnrollmentFields yearId={year.id} grades={gradeOptions((grades.data ?? []).filter((g) => g.status === "active"))} sections={sectionOptions(sectionList)} />
              </FormDialog>
            </>
          ) : null
        }
      />
      {!year && <Alert tone="info" className="mb-4">Create an academic year first.</Alert>}
      {year?.status === "archived" && <Alert tone="info" className="mb-4">{year.name} is archived; its enrollments are read-only.</Alert>}
      {year && (
        <Card>
          <ListToolbar
            searchPlaceholder="Search student name or number…"
            filters={[
              { name: "year", label: "Academic year", options: yearOptions(years.data ?? []), allLabel: `${year.name} (default)` },
              { name: "grade", label: "Grade levels", options: gradeOptions(grades.data ?? []) },
              { name: "section", label: "Sections", options: [{ value: "none", label: "No section yet" }, ...sectionOptions(sectionList)] },
              { name: "status", label: "Statuses", options: STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
            ]}
          />
          <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
            <EnrollmentsTable schoolId={ctx.schoolId} yearId={year.id} editable={Boolean(open)} sections={sectionList} sp={sp} />
          </Suspense>
        </Card>
      )}
    </>
  )
}

async function EnrollmentsTable({ schoolId, yearId, editable, sections, sp }: { schoolId: string; yearId: string; editable: boolean; sections: SectionOpt[]; sp: SearchParams }) {
  const p = parseListParams(sp, { sorts: ENROLLMENT_SORTS, defaultSort: "student", filters: ["grade", "section", "status"] })
  if (p.filters.grade && !isUuid(p.filters.grade)) delete p.filters.grade
  if (p.filters.section && p.filters.section !== "none" && !isUuid(p.filters.section)) delete p.filters.section
  if (p.filters.status && !STATUSES.includes(p.filters.status)) delete p.filters.status
  p.filters.year = yearId
  const page = await listEnrollments(schoolId, p)
  if (page.error) return <Alert tone="error" className="m-4">Enrollments could not be loaded. Please refresh the page.</Alert>
  if (page.total === 0) return <EmptyState title="No enrollments found" description={p.q ? "Try a different search." : "Enroll students into this academic year."} />
  const sort = { pathname: "/enrollments", searchParams: sp, current: p }
  return (
    <>
      <Table label="Enrollments">
        <thead>
          <tr>
            <SortTh label="Student" sortKey="student" {...sort} />
            <SortTh label="Grade" sortKey="grade" {...sort} />
            <Th>Section</Th>
            <Th>Status</Th>
            <SortTh label="Enrolled" sortKey="enrollment_date" {...sort} />
          </tr>
        </thead>
        <tbody>
          {page.rows.map((e) => (
            <tr key={e.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/students/${e.student.id}`} className="font-medium text-brand hover:underline">{e.student.last_name}, {e.student.first_name}</Link>
                <p className="font-mono text-xs text-muted">{e.student.student_number}</p>
              </Td>
              <Td>{e.grade_level.name}</Td>
              <Td>
                {e.section ? (
                  <Link href={`/sections/${e.section.id}`} className="hover:underline">{e.section.name}</Link>
                ) : editable && e.enrollment_status === "enrolled" ? (
                  <FormDialog trigger="Assign section" variant="secondary" size="sm" title={`Assign a section to ${e.student.first_name}`} action={assignEnrollmentSection.bind(null, e.id)}>
                    <AssignSectionFields sections={sectionOptions(sections.filter((s) => s.grade_level_id === e.grade_level_id))} />
                  </FormDialog>
                ) : (
                  <Badge tone="amber">None</Badge>
                )}
              </Td>
              <Td><StatusBadge status={e.enrollment_status} /></Td>
              <Td className="text-muted">{formatDate(e.enrollment_date, "UTC")}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination pathname="/enrollments" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
