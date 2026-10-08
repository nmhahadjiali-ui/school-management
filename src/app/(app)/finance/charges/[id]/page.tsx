import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { DescriptionList } from "@/components/data/list"
import { PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { Amount, studentLabel } from "@/components/finance/finance-ui"
import { ChargeAdminActions, RevokeDiscountButton } from "@/components/finance/finance-actions"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { formatDateTime } from "@/lib/dates"
import { isUuid } from "@/lib/list-params"
import { METHOD_LABELS } from "@/lib/money"
import { actorNames, chargeHistory, getCharge, getChargeRecord, listDiscountTypes, studentsById } from "@/services/finance"

export const metadata: Metadata = { title: "Charge" }

const ADJ_LABELS: Record<string, string> = { discount: "Discount", waiver: "Waiver", penalty: "Penalty", credit: "Credit", debit: "Debit", correction: "Correction" }

export default async function ChargePage({ params }: PageProps<"/finance/charges/[id]">) {
  const ctx = await requireFinance("view")
  const { id } = await params
  if (!isUuid(id)) notFound()
  const [{ data: c }, { data: record }] = await Promise.all([getCharge(id), getChargeRecord(id)])
  if (!c || !record) notFound()
  const [history, students, { data: discountTypes }] = await Promise.all([chargeHistory(id), studentsById([c.student_id!]), listDiscountTypes(ctx.schoolId, true)])
  const names = await actorNames([
    record.created_by,
    record.cancelled_by,
    ...history.discounts.flatMap((d) => [d.created_by, d.revoked_by]),
    ...history.adjustments.map((a) => a.created_by),
  ])
  const cur = ctx.currency
  const tz = ctx.school?.timezone
  const isAdmin = atLeast(ctx.level, "admin")
  const cancelled = c.effective_status === "cancelled"
  const by = (uid: string | null) => (uid ? (names.get(uid) ?? "Staff member") : "System")

  const summary: [string, React.ReactNode][] = [
    ["Status", <StatusBadge key="s" status={c.effective_status ?? "pending"} />],
    ["Fee type", record.fee_type?.name ?? "—"],
    ["Due date", c.due_date ?? "—"],
    ["Original amount", <Amount key="a" value={c.amount} currency={cur} />],
    ["Discounts", <Amount key="d" value={-Number(c.discounts ?? 0)} currency={cur} />],
    ["Adjustments", <Amount key="j" value={c.adjustments} currency={cur} />],
    ["Net amount", <Amount key="n" value={c.net_amount} currency={cur} className="font-semibold" />],
    ["Paid", <Amount key="p" value={c.paid} currency={cur} />],
    ["Balance", <Amount key="b" value={c.remaining} currency={cur} className="font-semibold" />],
    ["Source", record.fee_structure_item_id ? `Fee structure (installment ${record.installment_no})` : "Individual charge"],
    ["Created", `${formatDateTime(record.created_at, tz)} by ${by(record.created_by)}`],
  ]
  if (record.cancelled_at) summary.push(["Cancelled", `${formatDateTime(record.cancelled_at, tz)} by ${by(record.cancelled_by)}: ${record.cancel_reason}`])

  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/finance/students/${c.student_id}`} className="hover:underline">{studentLabel(students.get(c.student_id!))}</Link>}
        title={c.description ?? "Charge"}
        actions={
          isAdmin &&
          !cancelled && (
            <ChargeAdminActions
              chargeId={id}
              discountTypes={(discountTypes ?? []).map((d) => ({ value: d.id, label: `${d.name} (${d.calculation_type === "percentage" ? `${d.value}%` : d.value})` }))}
              cancellable={Number(c.paid) === 0}
            />
          )
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Summary" />
          <CardBody>
            <DescriptionList items={summary} />
          </CardBody>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Payments applied" />
            <Table label="Payments applied">
              <thead><tr><Th>Date</Th><Th>Receipt</Th><Th>Method</Th><Th className="text-right">Amount</Th><Th>State</Th></tr></thead>
              <tbody>
                {history.allocations.length === 0 && <tr><Td className="text-muted">No payments applied yet.</Td></tr>}
                {history.allocations.map((a) => {
                  const receipt = a.payment?.receipts?.[0]
                  return (
                    <tr key={a.id}>
                      <Td><Link href={`/finance/payments/${a.payment_id}`} className="text-brand hover:underline">{a.payment?.payment_date}</Link></Td>
                      <Td className="font-mono text-xs">{receipt?.receipt_number ?? "—"}</Td>
                      <Td>{METHOD_LABELS[a.payment?.payment_method ?? ""] ?? "—"}</Td>
                      <Td className="text-right"><Amount value={a.amount} currency={cur} /></Td>
                      <Td>{a.released_at ? <span className="text-muted">Released: {a.release_reason}</span> : <StatusBadge status={a.payment?.status === "reversed" ? "reversed" : "active"} />}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Discounts" description="Recorded separately; the original charge never changes." />
            <Table label="Discounts">
              <thead><tr><Th>Discount</Th><Th>Reason</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {history.discounts.length === 0 && <tr><Td className="text-muted">No discounts.</Td></tr>}
                {history.discounts.map((d) => (
                  <tr key={d.id}>
                    <Td>
                      {d.discount_type?.name}
                      {d.percentage ? ` (${d.percentage}%)` : ""}
                      <span className="block text-xs text-muted">by {by(d.created_by)}, {formatDateTime(d.created_at, tz)}</span>
                    </Td>
                    <Td className="text-muted">
                      {d.reason}
                      {d.revoke_reason && <span className="block text-xs">Revoked by {by(d.revoked_by)}: {d.revoke_reason}</span>}
                    </Td>
                    <Td className="text-right"><Amount value={d.amount} currency={cur} /></Td>
                    <Td><StatusBadge status={d.status} /></Td>
                    <Td className="text-right">{isAdmin && d.status === "active" && <RevokeDiscountButton discountId={d.id} />}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          <Card>
            <CardHeader title="Adjustments" description="Append-only; a mistaken adjustment is corrected by another adjustment." />
            <Table label="Adjustments">
              <thead><tr><Th>Type</Th><Th>Reason</Th><Th>By</Th><Th className="text-right">Amount</Th></tr></thead>
              <tbody>
                {history.adjustments.length === 0 && <tr><Td className="text-muted">No adjustments.</Td></tr>}
                {history.adjustments.map((a) => (
                  <tr key={a.id}>
                    <Td>{ADJ_LABELS[a.adjustment_type]}</Td>
                    <Td className="text-muted">{a.reason}</Td>
                    <Td className="text-xs">{by(a.created_by)}<span className="block text-muted">{formatDateTime(a.created_at, tz)}</span></Td>
                    <Td className="text-right"><Amount value={a.signed_amount} currency={cur} /></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </div>
      </div>
    </>
  )
}
