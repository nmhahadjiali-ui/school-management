import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { FormDialog } from "@/components/ui/form-dialog"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, SortTh, TableSkeleton } from "@/components/data/list"
import { SectionFields } from "@/components/school/fields"
import { createSection } from "@/lib/actions/academic"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { isUuid, parseListParams, type SearchParams } from "@/lib/list-params"
import { gradeOptions, teacherOptions, yearOptions } from "@/lib/options"
import { listAcademicYears, listGradeLevels, listSections, pickYear, SECTION_SORTS } from "@/services/academic"
import { listActiveTeachers } from "@/services/people"

export const metadata: Metadata = { title: "Sections" }

export default async function SectionsPage({ searchParams }: PageProps<"/sections">) {
  const ctx = await requireSchoolAdmin()
  const sp = await searchParams
  const [years, grades, teachers] = await Promise.all([
    listAcademicYears(ctx.schoolId),
    listGradeLevels(ctx.schoolId),
    listActiveTeachers(ctx.schoolId),
  ])
  const yearList = years.data ?? []
  const year = pickYear(yearList, typeof sp.year === "string" ? sp.year : undefined)
  const openYears = yearList.filter((y) => y.status !== "archived")
  // New sections default to the year shown in the table (else the current / first open year).
  const formYear = openYears.find((y) => y.id === year?.id) ?? openYears.find((y) => y.is_current) ?? openYears[0]

  return (
    <>
      <PageHeader
        title="Sections"
        description="Classes for each academic year and grade level."
        actions={
          openYears.length > 0 && (grades.data ?? []).length > 0 ? (
            <FormDialog trigger={<><Plus className="size-4" aria-hidden /> New section</>} title="New section" action={createSection} submitLabel="Create">
              <SectionFields years={yearOptions(openYears)} defaultYearId={formYear?.id} grades={gradeOptions((grades.data ?? []).filter((g) => g.status === "active"))} teachers={teacherOptions(teachers.data ?? [])} />
            </FormDialog>
          ) : null
        }
      />
      {!year && <Alert tone="info" className="mb-4">Create an academic year and grade levels before adding sections.</Alert>}
      <Card>
        <ListToolbar
          searchPlaceholder="Search name, code or room…"
          filters={[
            { name: "year", label: "Academic year", options: yearOptions(yearList), allLabel: year ? `${year.name} (default)` : "Year" },
            { name: "grade", label: "Grade levels", options: gradeOptions(grades.data ?? []) },
            { name: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
          ]}
        />
        {year && (
          <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
            <SectionsTable schoolId={ctx.schoolId} yearId={year.id} yearName={year.name} otherYears={yearList.length > 1} sp={sp} />
          </Suspense>
        )}
      </Card>
    </>
  )
}

async function SectionsTable({ schoolId, yearId, yearName, otherYears, sp }: { schoolId: string; yearId: string; yearName: string; otherYears: boolean; sp: SearchParams }) {
  const p = parseListParams(sp, { sorts: SECTION_SORTS, defaultSort: "grade", filters: ["grade", "status"] })
  if (p.filters.grade && !isUuid(p.filters.grade)) delete p.filters.grade
  p.filters.year = yearId
  const page = await listSections(schoolId, p)
  if (page.error) return <Alert tone="error" className="m-4">Sections could not be loaded. Please refresh the page.</Alert>
  if (page.total === 0) {
    return (
      <EmptyState
        title={`No sections found in ${yearName}`}
        description={otherYears ? "Sections belong to one academic year. Create sections for this year, or choose another year in the Academic year filter." : "Create sections for this academic year."}
      />
    )
  }
  const sort = { pathname: "/sections", searchParams: sp, current: p }
  return (
    <>
      <Table label="Sections">
        <thead>
          <tr>
            <SortTh label="Grade" sortKey="grade" {...sort} />
            <SortTh label="Section" sortKey="name" {...sort} />
            <Th>Adviser</Th>
            <Th className="text-right">Enrolled</Th>
            <Th>Room</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((s) => (
            <tr key={s.id} className="hover:bg-slate-50">
              <Td>{s.grade_level.name}</Td>
              <Td>
                <Link href={`/sections/${s.id}`} className="font-medium text-brand hover:underline">{s.name}</Link>
                {s.code && <span className="ml-2 font-mono text-xs text-muted">{s.code}</span>}
              </Td>
              <Td>{s.adviser ? `${s.adviser.first_name} ${s.adviser.last_name}` : <span className="text-muted">—</span>}</Td>
              <Td className="text-right tabular-nums">
                {s.enrolled}
                {s.capacity ? <span className="text-muted"> / {s.capacity}</span> : null}
              </Td>
              <Td className="text-muted">{s.room}</Td>
              <Td><StatusBadge status={s.status} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination pathname="/sections" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
