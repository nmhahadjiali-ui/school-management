import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, SortTh, TableSkeleton } from "@/components/data/list"
import { AssignmentFields } from "@/components/school/fields"
import { createAssignment, deleteAssignment } from "@/lib/actions/academic"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { isUuid, parseListParams, type SearchParams } from "@/lib/list-params"
import { sectionOptions, subjectOptions, teacherOptions, yearOptions } from "@/lib/options"
import { ASSIGNMENT_SORTS, listAcademicYears, listActiveSubjects, listAssignments, listSectionOptions, pickYear } from "@/services/academic"
import { listActiveTeachers } from "@/services/people"

export const metadata: Metadata = { title: "Teaching loads" }

export default async function AssignmentsPage({ searchParams }: PageProps<"/teaching-loads">) {
  const ctx = await requireSchoolAdmin()
  const sp = await searchParams
  const [years, teachers, subjects] = await Promise.all([
    listAcademicYears(ctx.schoolId),
    listActiveTeachers(ctx.schoolId),
    listActiveSubjects(ctx.schoolId),
  ])
  const year = pickYear(years.data ?? [], typeof sp.year === "string" ? sp.year : undefined)
  const { data: sections } = year ? await listSectionOptions(ctx.schoolId, year.id) : { data: [] }
  const sectionOpts = sectionOptions((sections ?? []) as { id: string; name: string; grade_level: { name: string } | null }[])
  const open = year && year.status !== "archived"

  return (
    <>
      <PageHeader
        title="Teaching loads"
        description="Who teaches which subject in which section, per academic year."
        actions={
          open ? (
            <FormDialog trigger={<><Plus className="size-4" aria-hidden /> Assign teacher</>} title={`Assign a teacher (${year.name})`} action={createAssignment} submitLabel="Assign">
              <AssignmentFields yearId={year.id} teachers={teacherOptions(teachers.data ?? [])} subjects={subjectOptions(subjects.data ?? [])} sections={sectionOpts} />
            </FormDialog>
          ) : null
        }
      />
      {!year && <Alert tone="info" className="mb-4">Create an academic year first.</Alert>}
      {year && (
        <Card>
          <ListToolbar
            filters={[
              { name: "year", label: "Academic year", options: yearOptions(years.data ?? []), allLabel: `${year.name} (default)` },
              { name: "teacher", label: "Teachers", options: teacherOptions(teachers.data ?? []) },
              { name: "subject", label: "Subjects", options: subjectOptions(subjects.data ?? []) },
              { name: "section", label: "Sections", options: sectionOpts },
            ]}
          />
          <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
            <AssignmentsTable schoolId={ctx.schoolId} yearId={year.id} editable={Boolean(open)} sp={sp} />
          </Suspense>
        </Card>
      )}
    </>
  )
}

async function AssignmentsTable({ schoolId, yearId, editable, sp }: { schoolId: string; yearId: string; editable: boolean; sp: SearchParams }) {
  const p = parseListParams(sp, { sorts: ASSIGNMENT_SORTS, defaultSort: "teacher", filters: ["teacher", "subject", "section"] })
  for (const f of ["teacher", "subject", "section"]) if (p.filters[f] && !isUuid(p.filters[f])) delete p.filters[f]
  p.filters.year = yearId
  const page = await listAssignments(schoolId, p)
  if (page.error) return <Alert tone="error" className="m-4">Assignments could not be loaded. Please refresh the page.</Alert>
  if (page.total === 0) return <EmptyState title="No assignments found" description="Assign teachers to subjects and sections for this year." />
  const sort = { pathname: "/teaching-loads", searchParams: sp, current: p }
  return (
    <>
      <Table label="Teacher assignments">
        <thead>
          <tr>
            <SortTh label="Teacher" sortKey="teacher" {...sort} />
            <SortTh label="Subject" sortKey="subject" {...sort} />
            <Th>Section</Th>
            {editable && <Th className="text-right"><span className="sr-only">Actions</span></Th>}
          </tr>
        </thead>
        <tbody>
          {page.rows.map((a) => (
            <tr key={a.id}>
              <Td><Link href={`/teachers/${a.teacher.id}`} className="font-medium text-brand hover:underline">{a.teacher.last_name}, {a.teacher.first_name}</Link></Td>
              <Td>{a.subject.name} <Badge>{a.subject.code}</Badge></Td>
              <Td><Link href={`/sections/${a.section.id}`} className="hover:underline">{a.section.grade_level.name} – {a.section.name}</Link></Td>
              {editable && (
                <Td className="text-right">
                  <ConfirmAction destructive trigger="Remove" title="Remove this assignment?" description={`${a.teacher.first_name} ${a.teacher.last_name} will no longer teach ${a.subject.name} in ${a.section.grade_level.name} – ${a.section.name}.`} confirmLabel="Remove" onConfirm={deleteAssignment.bind(null, a.id)} />
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination pathname="/teaching-loads" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
