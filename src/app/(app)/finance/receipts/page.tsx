import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, TableSkeleton } from "@/components/data/list"
import { Amount, studentLabel } from "@/components/finance/finance-ui"
import { requireFinance } from "@/lib/finance/access"
import { formatDateTime } from "@/lib/dates"
import { parseListParams, type SearchParams } from "@/lib/list-params"
import { METHOD_LABELS } from "@/lib/money"
import { listReceipts, studentsById } from "@/services/finance"

export const metadata: Metadata = { title: "Receipts" }

export default async function ReceiptsPage({ searchParams }: PageProps<"/finance/receipts">) {
  const ctx = await requireFinance("view")
  const sp = await searchParams
  return (
    <>
      <PageHeader eyebrow="Finance" title="Receipts" description="Receipt numbers are issued by the database, unique per school and never reused. Reversed payments' receipts are voided, not deleted." />
      <Card>
        <ListToolbar searchPlaceholder="Search receipt number…" filters={[{ name: "status", label: "Statuses", options: [{ value: "issued", label: "Issued" }, { value: "voided", label: "Voided" }] }]} />
        <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
          <ReceiptsList schoolId={ctx.schoolId} tz={ctx.school?.timezone} sp={sp} />
        </Suspense>
      </Card>
    </>
  )
}

async function ReceiptsList({ schoolId, tz, sp }: { schoolId: string; tz?: string; sp: SearchParams }) {
  const p = parseListParams(sp, { sorts: ["issued_at", "receipt_number"] as const, defaultSort: "issued_at", defaultDir: "desc", filters: ["status"] })
  if (p.filters.status && !["issued", "voided"].includes(p.filters.status)) delete p.filters.status
  const page = await listReceipts(schoolId, p)
  if (page.error) return <Alert tone="error" className="m-4">Receipts could not be loaded. Please refresh the page.</Alert>
  if (page.total === 0) return <EmptyState title="No receipts" />
  const students = await studentsById(page.rows.map((r) => r.payment?.student_id ?? ""))
  return (
    <>
      <Table label="Receipts">
        <thead><tr><Th>Receipt no.</Th><Th>Issued</Th><Th>Student</Th><Th>Method</Th><Th className="text-right">Amount</Th><Th>Status</Th></tr></thead>
        <tbody>
          {page.rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <Td><Link href={`/receipts/${r.id}`} className="font-mono text-brand hover:underline">{r.receipt_number}</Link></Td>
              <Td className="whitespace-nowrap">{formatDateTime(r.issued_at, tz)}</Td>
              <Td>{studentLabel(students.get(r.payment?.student_id ?? ""))}</Td>
              <Td>{METHOD_LABELS[r.payment?.payment_method ?? ""] ?? "—"}</Td>
              <Td className="text-right"><Amount value={r.payment?.amount} currency={r.payment?.currency.trim() ?? "PHP"} /></Td>
              <Td><StatusBadge status={r.status} /></Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Pagination pathname="/finance/receipts" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
