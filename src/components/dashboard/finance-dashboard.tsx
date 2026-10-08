import Link from "next/link"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card, CardHeader } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { MoneyStat, PaymentsTable } from "@/components/finance/finance-ui"
import { atLeast, myFinanceLevel, schoolCurrency } from "@/lib/finance/access"
import { fullName } from "@/lib/utils"
import { financeOverview, pendingRefundCount, recentPayments, studentsById } from "@/services/finance"
import type { UserContext } from "@/types/domain"

/** Home for finance admins / staff: today's collections and what needs attention. */
export async function FinanceDashboard({ ctx }: { ctx: UserContext }) {
  const schoolId = ctx.profile.school_id
  const level = await myFinanceLevel()
  const header = <PageHeader eyebrow={ctx.school?.name} title={`Welcome, ${ctx.profile.first_name || fullName(ctx.profile)}`} />
  if (!schoolId || level === "none") {
    return (
      <>
        {header}
        <Alert tone="info">Billing is not enabled for your school yet. Please ask the platform administrator to turn on the Billing module.</Alert>
      </>
    )
  }
  const [currency, { data: o }, recent, refunds] = await Promise.all([
    schoolCurrency(schoolId),
    financeOverview(schoolId, { year: ctx.current_academic_year?.id }),
    recentPayments(schoolId, 5),
    ctx.features.includes("refunds") ? pendingRefundCount(schoolId) : Promise.resolve(0),
  ])
  const students = await studentsById((recent.data ?? []).map((p) => p.student_id))
  return (
    <>
      {header}
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          {atLeast(level, "staff") && <LinkButton href="/finance/payments/new">Record payment</LinkButton>}
          <LinkButton href="/finance" variant="secondary">Finance overview</LinkButton>
        </div>
        {o && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MoneyStat label="Collected today" value={o.today} currency={currency} tone="green" />
            <MoneyStat label="This month" value={o.this_month} currency={currency} />
            <MoneyStat label="Outstanding" value={o.outstanding} currency={currency} hint={ctx.current_academic_year ? `Academic year ${ctx.current_academic_year.name}` : undefined} />
            <MoneyStat label="Overdue" value={o.overdue} currency={currency} tone={Number(o.overdue) > 0 ? "red" : undefined} />
          </div>
        )}
        {refunds > 0 && <Alert tone="warning">{refunds} refund{refunds === 1 ? " needs" : "s need"} attention. <Link href="/finance/refunds" className="font-medium underline">Open refunds</Link></Alert>}
        <Card>
          <CardHeader title="Latest payments" />
          <PaymentsTable rows={recent.data ?? []} students={students} paymentHref={(id) => `/finance/payments/${id}`} />
        </Card>
      </div>
    </>
  )
}
