import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { FileSpreadsheet, Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, SortTh, TableSkeleton } from "@/components/data/list"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { isUuid, parseListParams, type SearchParams } from "@/lib/list-params"
import { gradeOptions } from "@/lib/options"
import { currentPlacements, listGradeLevels } from "@/services/academic"
import { listStudents, STUDENT_SORTS } from "@/services/people"

export const metadata: Metadata = { title: "Students" }

const STATUSES = ["active", "inactive", "graduated", "transferred", "withdrawn"]

export default async function StudentsPage({ searchParams }: PageProps<"/students">) {
  const ctx = await requireSchoolAdmin()
  const sp = await searchParams
  const { data: grades } = await listGradeLevels(ctx.schoolId)
  const year = ctx.current_academic_year

  return (
    <>
      <PageHeader
        title="Students"
        description="Student records are kept permanently; use the status instead of deleting."
        actions={
          <>
            <LinkButton href="/students/import" variant="secondary"><FileSpreadsheet className="size-4" aria-hidden /> Import from Excel</LinkButton>
            <LinkButton href="/students/new"><Plus className="size-4" aria-hidden /> New student</LinkButton>
          </>
        }
      />
      <Card>
        <ListToolbar
          searchPlaceholder="Search name, student number or email…"
          filters={[
            { name: "status", label: "Statuses", options: STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) },
            ...(year ? [{ name: "grade", label: "Grade levels", options: gradeOptions(grades ?? []), allLabel: `All grades (${year.name})` }] : []),
          ]}
        />
        <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
          <StudentsTable schoolId={ctx.schoolId} yearId={year?.id ?? null} sp={sp} />
        </Suspense>
      </Card>
    </>
  )
}

async function StudentsTable({ schoolId, yearId, sp }: { schoolId: string; yearId: string | null; sp: SearchParams }) {
  const p = parseListParams(sp, { sorts: STUDENT_SORTS, defaultSort: "last_name", filters: ["status", "grade"] })
  if (p.filters.grade && !isUuid(p.filters.grade)) delete p.filters.grade
  if (p.filters.status && !STATUSES.includes(p.filters.status)) delete p.filters.status
  const page = await listStudents(schoolId, p, yearId ?? undefined)
  if (page.error) return <Alert tone="error" className="m-4">Students could not be loaded. Please refresh the page.</Alert>
  if (page.total === 0) {
    return <EmptyState title={p.q || Object.keys(p.filters).length ? "No matching students" : "No students yet"} description={p.q ? "Try a different search." : "Add your first student record."} />
  }
  const placements = await currentPlacements(page.rows.map((s) => s.id), yearId)
  const sort = { pathname: "/students", searchParams: sp, current: p }
  return (
    <>
      <Table label="Students">
        <thead>
          <tr>
            <SortTh label="Name" sortKey="last_name" {...sort} />
            <SortTh label="Student no." sortKey="student_number" {...sort} />
            <Th>Current placement</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((s) => {
            const placement = placements.get(s.id)
            return (
              <tr key={s.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/students/${s.id}`} className="font-medium text-brand hover:underline">
                    {s.last_name}, {s.first_name} {s.middle_name ? `${s.middle_name.charAt(0)}.` : ""} {s.suffix ?? ""}
                  </Link>
                </Td>
                <Td className="font-mono text-xs">{s.student_number}</Td>
                <Td>{placement ? `${placement.grade}${placement.section ? ` – ${placement.section}` : " (no section)"}` : <span className="text-muted">Not enrolled</span>}</Td>
                <Td><StatusBadge status={s.status} /></Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
      <Pagination pathname="/students" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
