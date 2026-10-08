import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { Alert } from "@/components/ui/alert"
import { ChargesTable, LedgerTable, MoneyStat, PaymentsTable } from "@/components/finance/finance-ui"
import { studentBalances, studentCredits, studentLedger, studentPayments } from "@/services/finance"

/**
 * One student's account: totals, charges, payments and the full statement.
 * Everything is read through RLS, so the same component serves finance users
 * (any student of their school) and families (own / verified children only).
 */
export async function StudentFinance({
  studentId,
  currency,
  chargeHref,
  paymentHref,
  actions,
}: {
  studentId: string
  currency: string
  chargeHref?: (id: string) => string
  paymentHref?: (id: string) => string
  /** Extra content under the summary (e.g. the online payment card). */
  actions?: React.ReactNode
}) {
  const [balances, credits, payments, ledger] = await Promise.all([studentBalances(studentId), studentCredits(studentId), studentPayments(studentId), studentLedger(studentId)])
  if (balances.error || payments.error || ledger.error) return <Alert tone="error">The account could not be loaded. Please refresh the page.</Alert>

  // Totals are summed in integer cents from database-computed values (display only).
  const sum = (rows: { [k: string]: unknown }[], key: string) => rows.reduce((s, r) => s + Math.round(Number(r[key] ?? 0) * 100), 0) / 100
  const live = (balances.data ?? []).filter((c) => c.effective_status !== "cancelled")
  const due = sum(live, "remaining")
  const overdue = sum(live.filter((c) => c.effective_status === "overdue"), "remaining")
  const credit = sum(credits.data ?? [], "unallocated")

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyStat label="Total billed" value={sum(live, "net_amount")} currency={currency} hint="After discounts and adjustments" />
        <MoneyStat label="Paid" value={sum(live, "paid")} currency={currency} tone="green" />
        <MoneyStat label="Balance due" value={due} currency={currency} tone={due > 0 ? "red" : undefined} hint={overdue > 0 ? `Overdue: ${overdue.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : undefined} />
        <MoneyStat label="Credit" value={credit} currency={currency} hint="Paid but not applied to a charge" />
      </div>
      {actions}
      <Card>
        <CardHeader title="Charges" />
        <ChargesTable rows={balances.data ?? []} currency={currency} chargeHref={chargeHref} />
      </Card>
      <Card>
        <CardHeader title="Payments" description="Each payment has its own receipt. Reversed payments stay listed." />
        <PaymentsTable rows={payments.data ?? []} paymentHref={paymentHref} />
      </Card>
      <Card>
        <CardHeader title="Statement of account" description="Every charge, discount, adjustment, payment, reversal and refund in order." />
        <CardBody className="p-0">
          <LedgerTable rows={ledger.data ?? []} currency={currency} />
        </CardBody>
      </Card>
    </div>
  )
}
