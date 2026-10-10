import type { Metadata } from "next"
import { Suspense } from "react"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { DeleteWithPassword } from "@/components/ui/delete-with-password"
import { FormDialog } from "@/components/ui/form-dialog"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, SortTh, TableSkeleton } from "@/components/data/list"
import { SubjectFields } from "@/components/school/fields"
import { createSubject, setSubjectStatus, updateSubject } from "@/lib/actions/academic"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { parseListParams, type SearchParams } from "@/lib/list-params"
import { listSubjects, SUBJECT_SORTS } from "@/services/academic"

export const metadata: Metadata = { title: "Subjects" }

const STATUS_FILTER = { name: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] }

export default async function SubjectsPage({ searchParams }: PageProps<"/subjects">) {
  const ctx = await requireSchoolAdmin()
  const sp = await searchParams
  return (
    <>
      <PageHeader
        title="Subjects"
        description="Subjects offered by your school. Teachers are assigned to subjects per section."
        actions={
          <FormDialog trigger={<><Plus className="size-4" aria-hidden /> New subject</>} title="New subject" action={createSubject} submitLabel="Create">
            <SubjectFields />
          </FormDialog>
        }
      />
      <Card>
        <ListToolbar searchPlaceholder="Search name or code…" filters={[STATUS_FILTER]} />
        <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
          <SubjectsTable schoolId={ctx.schoolId} sp={sp} />
        </Suspense>
      </Card>
    </>
  )
}

async function SubjectsTable({ schoolId, sp }: { schoolId: string; sp: SearchParams }) {
  const p = parseListParams(sp, { sorts: SUBJECT_SORTS, defaultSort: "name", filters: ["status"] })
  const page = await listSubjects(schoolId, p)
  if (page.error) return <Alert tone="error" className="m-4">Subjects could not be loaded. Please refresh the page.</Alert>
  if (page.total === 0) return <EmptyState title={p.q || p.filters.status ? "No matching subjects" : "No subjects yet"} description={p.q ? "Try a different search." : "Add the subjects your school teaches."} />
  const sort = { pathname: "/subjects", searchParams: sp, current: p }
  return (
    <>
      <Table label="Subjects">
        <thead>
          <tr>
            <SortTh label="Name" sortKey="name" {...sort} />
            <SortTh label="Code" sortKey="code" {...sort} />
            <Th>Description</Th>
            <Th>Status</Th>
            <Th className="text-right"><span className="sr-only">Actions</span></Th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((s) => (
            <tr key={s.id}>
              <Td className="font-medium">{s.name}</Td>
              <Td className="font-mono text-xs">{s.code}</Td>
              <Td className="max-w-md truncate text-muted">{s.description}</Td>
              <Td><StatusBadge status={s.status} /></Td>
              <Td>
                <div className="flex justify-end gap-2">
                  <FormDialog trigger="Edit" variant="secondary" size="sm" title={`Edit ${s.name}`} action={updateSubject.bind(null, s.id)}>
                    <SubjectFields subject={s} />
                  </FormDialog>
                  {s.status === "active" ? (
                    <ConfirmAction destructive trigger="Deactivate" title={`Deactivate ${s.name}?`} description="It will no longer be offered for new assignments. Existing assignments are kept." confirmLabel="Deactivate" onConfirm={setSubjectStatus.bind(null, s.id, "inactive")} />
                  ) : (
                    <ConfirmAction trigger="Reactivate" title={`Reactivate ${s.name}?`} description="It will be available for new assignments again." confirmLabel="Reactivate" onConfirm={setSubjectStatus.bind(null, s.id, "active")} />
                  )}
                  <DeleteWithPassword kind="subject" id={s.id} name={s.name} thing="subject" />
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination pathname="/subjects" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
