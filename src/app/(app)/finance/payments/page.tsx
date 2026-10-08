import type { Metadata } from "next"
import { Suspense } from "react"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { EmptyState, PageHeader } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, TableSkeleton } from "@/components/data/list"
import { PaymentsTable } from "@/components/finance/finance-ui"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { isIsoDate } from "@/lib/dates"
import { isUuid, parseListParams, type SearchParams } from "@/lib/list-params"
import { METHOD_LABELS } from "@/lib/money"
import { listPayments, PAYMENT_SORTS, searchStudentIds, studentsById } from "@/services/finance"

export const metadata: Metadata = { title: "Payments" }

export default async function PaymentsPage({ searchParams }: PageProps<"/finance/payments">) {
  const ctx = await requireFinance("view")
  const sp = await searchParams
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Payments"
        description="Money received. A payment is never edited or deleted; incorrect payments are reversed."
        actions={atLeast(ctx.level, "staff") && <LinkButton href="/finance/payments/new"><Plus className="size-4" aria-hidden /> Record payment</LinkButton>}
      />
      <Card>
        <ListToolbar
          searchPlaceholder="Search student name or number…"
          filters={[
            { name: "status", label: "Statuses", options: [{ value: "completed", label: "Completed" }, { value: "reversed", label: "Reversed" }] },
            { name: "method", label: "Methods", options: Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label })) },
          ]}
        />
        <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
          <PaymentsList schoolId={ctx.schoolId} sp={sp} />
        </Suspense>
      </Card>
    </>
  )
}

async function PaymentsList({ schoolId, sp }: { schoolId: string; sp: SearchParams }) {
  const p = parseListParams(sp, { sorts: PAYMENT_SORTS, defaultSort: "payment_date", defaultDir: "desc", filters: ["status", "method", "from", "to", "student"] })
  if (p.filters.status && !["completed", "reversed"].includes(p.filters.status)) delete p.filters.status
  if (p.filters.method && !(p.filters.method in METHOD_LABELS)) delete p.filters.method
  for (const k of ["from", "to"]) if (p.filters[k] && !isIsoDate(p.filters[k])) delete p.filters[k]
  if (p.filters.student && !isUuid(p.filters.student)) delete p.filters.student
  const studentIds = p.q ? await searchStudentIds(schoolId, p.q) : undefined
  if (studentIds && studentIds.length === 0) return <EmptyState title="No matching students" description="Try a different name or student number." />
  const page = await listPayments(schoolId, p, { studentIds })
  if (page.error) return <Alert tone="error" className="m-4">Payments could not be loaded. Please refresh the page.</Alert>
  const students = await studentsById(page.rows.map((r) => r.student_id))
  return (
    <>
      <PaymentsTable rows={page.rows} students={students} paymentHref={(id) => `/finance/payments/${id}`} />
      <Pagination pathname="/finance/payments" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
