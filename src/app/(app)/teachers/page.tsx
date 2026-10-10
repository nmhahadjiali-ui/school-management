import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { FileSpreadsheet, Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, SortTh, TableSkeleton } from "@/components/data/list"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { parseListParams, type SearchParams } from "@/lib/list-params"
import { listTeachers, TEACHER_SORTS } from "@/services/people"

export const metadata: Metadata = { title: "Teachers" }

const STATUSES = ["active", "inactive", "resigned", "retired"]

export default async function TeachersPage({ searchParams }: PageProps<"/teachers">) {
  const ctx = await requireSchoolAdmin()
  const sp = await searchParams
  return (
    <>
      <PageHeader
        title="Teachers"
        description="Teaching staff records. Invite a teacher to give them access to their classes."
        actions={
          <>
            <LinkButton href="/teachers/import" variant="secondary"><FileSpreadsheet className="size-4" aria-hidden /> Import from Excel</LinkButton>
            <LinkButton href="/teachers/new"><Plus className="size-4" aria-hidden /> New teacher</LinkButton>
          </>
        }
      />
      <Card>
        <ListToolbar
          searchPlaceholder="Search name, employee number or email…"
          filters={[{ name: "status", label: "Statuses", options: STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) }]}
        />
        <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
          <TeachersTable schoolId={ctx.schoolId} sp={sp} />
        </Suspense>
      </Card>
    </>
  )
}

async function TeachersTable({ schoolId, sp }: { schoolId: string; sp: SearchParams }) {
  const p = parseListParams(sp, { sorts: TEACHER_SORTS, defaultSort: "last_name", filters: ["status"] })
  if (p.filters.status && !STATUSES.includes(p.filters.status)) delete p.filters.status
  const page = await listTeachers(schoolId, p)
  if (page.error) return <Alert tone="error" className="m-4">Teachers could not be loaded. Please refresh the page.</Alert>
  if (page.total === 0) return <EmptyState title={p.q || p.filters.status ? "No matching teachers" : "No teachers yet"} />
  const sort = { pathname: "/teachers", searchParams: sp, current: p }
  return (
    <>
      <Table label="Teachers">
        <thead>
          <tr>
            <SortTh label="Name" sortKey="last_name" {...sort} />
            <SortTh label="Employee no." sortKey="employee_number" {...sort} />
            <Th>Specialization</Th>
            <Th>App access</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((t) => (
            <tr key={t.id} className="hover:bg-slate-50">
              <Td>
                <Link href={`/teachers/${t.id}`} className="font-medium text-brand hover:underline">{t.last_name}, {t.first_name}</Link>
                {t.email && <p className="text-xs text-muted">{t.email}</p>}
              </Td>
              <Td className="font-mono text-xs">{t.employee_number}</Td>
              <Td className="text-muted">{t.specialization}</Td>
              <Td>{t.user_id ? <Badge tone="green">Linked</Badge> : <Badge>None</Badge>}</Td>
              <Td><StatusBadge status={t.status} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination pathname="/teachers" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
