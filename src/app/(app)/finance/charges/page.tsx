import type { Metadata } from "next"
import { Suspense } from "react"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { EmptyState, PageHeader } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, TableSkeleton } from "@/components/data/list"
import { ChargesTable } from "@/components/finance/finance-ui"
import { NewChargeDialog } from "@/components/finance/finance-actions"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { isUuid, parseListParams, type SearchParams } from "@/lib/list-params"
import { yearOptions } from "@/lib/options"
import { listAcademicYears } from "@/services/academic"
import { CHARGE_SORTS, CHARGE_STATUSES, listCharges, listFeeTypes, searchStudentIds, studentsById } from "@/services/finance"

export const metadata: Metadata = { title: "Charges" }

export default async function ChargesPage({ searchParams }: PageProps<"/finance/charges">) {
  const ctx = await requireFinance("view")
  const sp = await searchParams
  const [{ data: feeTypes }, { data: years }] = await Promise.all([listFeeTypes(ctx.schoolId), listAcademicYears(ctx.schoolId)])
  const activeTypes = (feeTypes ?? []).filter((t) => t.status === "active").map((t) => ({ value: t.id, label: t.name }))
  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Charges"
        description="What students owe. Charges are never edited or deleted: discounts, adjustments and cancellations are recorded on top."
        actions={atLeast(ctx.level, "admin") && activeTypes.length > 0 && <NewChargeDialog feeTypes={activeTypes} />}
      />
      <Card>
        <ListToolbar
          searchPlaceholder="Search student name or number…"
          filters={[
            { name: "status", label: "Statuses", options: CHARGE_STATUSES.map((s) => ({ value: s, label: (s[0].toUpperCase() + s.slice(1)).replace("_", " ") })) },
            { name: "year", label: "Years", options: yearOptions(years ?? []) },
            { name: "fee_type", label: "Fee types", options: (feeTypes ?? []).map((t) => ({ value: t.id, label: t.name })) },
          ]}
        />
        <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
          <ChargesList schoolId={ctx.schoolId} currency={ctx.currency} sp={sp} />
        </Suspense>
      </Card>
    </>
  )
}

async function ChargesList({ schoolId, currency, sp }: { schoolId: string; currency: string; sp: SearchParams }) {
  const p = parseListParams(sp, { sorts: CHARGE_SORTS, defaultSort: "due_date", filters: ["status", "year", "fee_type", "student"] })
  for (const k of ["year", "fee_type", "student"]) if (p.filters[k] && !isUuid(p.filters[k])) delete p.filters[k]
  if (p.filters.status && !(CHARGE_STATUSES as readonly string[]).includes(p.filters.status)) delete p.filters.status
  // The search box matches students (name / number).
  const q = p.q
  p.q = ""
  const studentIds = q ? await searchStudentIds(schoolId, q) : undefined
  if (studentIds && studentIds.length === 0) return <EmptyState title="No matching students" description="Try a different name or student number." />
  const page = await listCharges(schoolId, p, { studentIds })
  if (page.error) return <Alert tone="error" className="m-4">Charges could not be loaded. Please refresh the page.</Alert>
  const students = await studentsById(page.rows.map((c) => c.student_id!))
  return (
    <>
      <ChargesTable rows={page.rows} currency={currency} students={students} chargeHref={(id) => `/finance/charges/${id}`} />
      <Pagination pathname="/finance/charges" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
