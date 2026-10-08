import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, SortTh, TableSkeleton } from "@/components/data/list"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { parseListParams, type SearchParams } from "@/lib/list-params"
import { GUARDIAN_SORTS, listGuardians } from "@/services/people"

export const metadata: Metadata = { title: "Parents & guardians" }

export default async function GuardiansPage({ searchParams }: PageProps<"/guardians">) {
  const ctx = await requireSchoolAdmin()
  const sp = await searchParams
  return (
    <>
      <PageHeader
        title="Parents & guardians"
        description="One record per person; link them to each of their children."
        actions={<LinkButton href="/guardians/new"><Plus className="size-4" aria-hidden /> New parent / guardian</LinkButton>}
      />
      <Card>
        <ListToolbar searchPlaceholder="Search name, email or phone…" filters={[{ name: "status", label: "Statuses", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] }]} />
        <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
          <GuardiansTable schoolId={ctx.schoolId} sp={sp} />
        </Suspense>
      </Card>
    </>
  )
}

async function GuardiansTable({ schoolId, sp }: { schoolId: string; sp: SearchParams }) {
  const p = parseListParams(sp, { sorts: GUARDIAN_SORTS, defaultSort: "last_name", filters: ["status"] })
  if (p.filters.status && !["active", "inactive"].includes(p.filters.status)) delete p.filters.status
  const page = await listGuardians(schoolId, p)
  if (page.error) return <Alert tone="error" className="m-4">Parents and guardians could not be loaded. Please refresh the page.</Alert>
  if (page.total === 0) return <EmptyState title={p.q || p.filters.status ? "No matches" : "No parents or guardians yet"} />
  const sort = { pathname: "/guardians", searchParams: sp, current: p }
  return (
    <>
      <Table label="Parents and guardians">
        <thead>
          <tr>
            <SortTh label="Name" sortKey="last_name" {...sort} />
            <Th>Email</Th>
            <Th>Phone</Th>
            <Th>App access</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((g) => (
            <tr key={g.id} className="hover:bg-slate-50">
              <Td><Link href={`/guardians/${g.id}`} className="font-medium text-brand hover:underline">{g.last_name}, {g.first_name}</Link></Td>
              <Td className="text-muted">{g.email}</Td>
              <Td className="text-muted">{g.phone}</Td>
              <Td>{g.user_id ? <Badge tone="green">Linked</Badge> : <Badge>None</Badge>}</Td>
              <Td><StatusBadge status={g.status} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination pathname="/guardians" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
