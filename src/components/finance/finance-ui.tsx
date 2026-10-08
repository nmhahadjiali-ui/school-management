import Link from "next/link"
import { EmptyState, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { formatMoney, METHOD_LABELS } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { ChargeBalance, LedgerEntry, StudentRef } from "@/services/finance"

// Read-only finance building blocks shared by the finance area and the
// student / parent pages. Values are displayed exactly as PostgreSQL computed them.

export function MoneyStat({ label, value, currency, hint, tone }: { label: string; value: number | string | null | undefined; currency: string; hint?: string; tone?: "red" | "green" }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
      <p className="text-sm text-muted">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", tone === "red" && "text-red-700", tone === "green" && "text-green-700")}>{formatMoney(value, currency)}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  )
}

export const Amount = ({ value, currency, className }: { value: number | string | null | undefined; currency: string; className?: string }) => (
  <span className={cn("tabular-nums", className)}>{formatMoney(value, currency)}</span>
)

export const studentLabel = (s: StudentRef | undefined) => (s ? `${s.last_name}, ${s.first_name}` : "Student")

export function ChargesTable({
  rows,
  currency,
  students,
  chargeHref,
}: {
  rows: ChargeBalance[]
  currency: string
  /** When given, a Student column is shown. */
  students?: Map<string, StudentRef>
  chargeHref?: (id: string) => string
}) {
  if (rows.length === 0) return <EmptyState title="No charges" description="Nothing has been billed yet." />
  return (
    <Table label="Charges">
      <thead>
        <tr>
          {students && <Th>Student</Th>}
          <Th>Description</Th>
          <Th>Due</Th>
          <Th className="text-right">Amount</Th>
          <Th className="text-right">Discounts / adj.</Th>
          <Th className="text-right">Paid</Th>
          <Th className="text-right">Balance</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((c) => {
          const adj = Number(c.adjustments ?? 0) - Number(c.discounts ?? 0)
          return (
            <tr key={c.id} className="hover:bg-slate-50">
              {students && (
                <Td>
                  <Link href={`/finance/students/${c.student_id}`} className="font-medium text-brand hover:underline">{studentLabel(students.get(c.student_id!))}</Link>
                </Td>
              )}
              <Td>{chargeHref ? <Link href={chargeHref(c.id!)} className="text-brand hover:underline">{c.description}</Link> : c.description}</Td>
              <Td className="whitespace-nowrap">{c.due_date ?? "—"}</Td>
              <Td className="text-right"><Amount value={c.amount} currency={currency} /></Td>
              <Td className="text-right text-muted">{adj === 0 ? "—" : <Amount value={adj} currency={currency} />}</Td>
              <Td className="text-right"><Amount value={c.paid} currency={currency} /></Td>
              <Td className="text-right font-medium"><Amount value={c.remaining} currency={currency} /></Td>
              <Td><StatusBadge status={c.effective_status ?? "pending"} /></Td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}

type PaymentListRow = {
  id: string
  student_id: string
  amount: number
  currency: string
  payment_method: string
  payment_date: string
  reference_number: string | null
  status: string
  receipts: { id: string; receipt_number: string; status: string }[] | { id: string; receipt_number: string; status: string } | null
}

const firstReceipt = (r: PaymentListRow["receipts"]) => (Array.isArray(r) ? r[0] : r) ?? null

export function PaymentsTable({
  rows,
  students,
  paymentHref,
}: {
  rows: PaymentListRow[]
  students?: Map<string, StudentRef>
  paymentHref?: (id: string) => string
}) {
  if (rows.length === 0) return <EmptyState title="No payments" description="No payments have been recorded." />
  return (
    <Table label="Payments">
      <thead>
        <tr>
          <Th>Date</Th>
          {students && <Th>Student</Th>}
          <Th>Receipt</Th>
          <Th>Method</Th>
          <Th>Reference</Th>
          <Th className="text-right">Amount</Th>
          <Th>Status</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const receipt = firstReceipt(p.receipts)
          return (
            <tr key={p.id} className="hover:bg-slate-50">
              <Td className="whitespace-nowrap">{paymentHref ? <Link href={paymentHref(p.id)} className="text-brand hover:underline">{p.payment_date}</Link> : p.payment_date}</Td>
              {students && <Td>{studentLabel(students.get(p.student_id))}</Td>}
              <Td className="font-mono text-xs">
                {receipt ? <Link href={`/receipts/${receipt.id}`} className="text-brand hover:underline">{receipt.receipt_number}</Link> : "—"}
                {receipt?.status === "voided" && <span className="ml-1 text-red-700">(void)</span>}
              </Td>
              <Td>{METHOD_LABELS[p.payment_method] ?? p.payment_method}</Td>
              <Td className="text-muted">{p.reference_number ?? "—"}</Td>
              <Td className="text-right"><Amount value={p.amount} currency={p.currency.trim()} /></Td>
              <Td><StatusBadge status={p.status} /></Td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}

const LEDGER_LABELS: Record<string, string> = {
  charge: "Charge",
  charge_cancelled: "Charge cancelled",
  discount: "Discount",
  discount_revoked: "Discount revoked",
  adjustment: "Adjustment",
  payment: "Payment",
  payment_reversed: "Payment reversed",
  refund: "Refund paid out",
}

/**
 * Chronological statement. Positive = owed by the student, negative = paid /
 * credited. The running balance is accumulated in integer cents (display only;
 * the authoritative balances come from student_charge_balances).
 */
export function LedgerTable({ rows, currency }: { rows: LedgerEntry[]; currency: string }) {
  if (rows.length === 0) return <EmptyState title="No transactions yet" />
  const amounts = rows.map((e) => Math.round(Number(e.amount ?? 0) * 100))
  const balances = amounts.reduce<number[]>((acc, c) => [...acc, (acc.at(-1) ?? 0) + c], [])
  return (
    <Table label="Statement of account">
      <thead>
        <tr>
          <Th>Date</Th>
          <Th>Entry</Th>
          <Th>Description</Th>
          <Th className="text-right">Debit</Th>
          <Th className="text-right">Credit</Th>
          <Th className="text-right">Balance</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((e, i) => {
          const c = amounts[i]
          return (
            <tr key={`${e.entity_id}-${e.entry_type}-${i}`}>
              <Td className="whitespace-nowrap">{e.entry_date}</Td>
              <Td>{LEDGER_LABELS[e.entry_type ?? ""] ?? e.entry_type}</Td>
              <Td className="text-muted">{e.description}</Td>
              <Td className="text-right">{c > 0 ? <Amount value={c / 100} currency={currency} /> : ""}</Td>
              <Td className="text-right text-green-700">{c < 0 ? <Amount value={-c / 100} currency={currency} /> : ""}</Td>
              <Td className="text-right font-medium"><Amount value={balances[i] / 100} currency={currency} /></Td>
            </tr>
          )
        })}
      </tbody>
    </Table>
  )
}
