import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { DescriptionList } from "@/components/data/list"
import { PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { Amount, studentLabel } from "@/components/finance/finance-ui"
import { ApplyCreditButton, RefundActions, ReleaseAllocationButton, RequestRefundButton, ReversePaymentButton } from "@/components/finance/finance-actions"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { formatDateTime } from "@/lib/dates"
import { isUuid } from "@/lib/list-params"
import { METHOD_LABELS } from "@/lib/money"
import { actorNames, getPayment, openCharges, paymentDetails, studentsById } from "@/services/finance"

export const metadata: Metadata = { title: "Payment" }

export default async function PaymentPage({ params, searchParams }: PageProps<"/finance/payments/[id]">) {
  const ctx = await requireFinance("view")
  const { id } = await params
  const { recorded } = await searchParams
  if (!isUuid(id)) notFound()
  const { data: p } = await getPayment(id)
  if (!p) notFound()
  const [details, students, open] = await Promise.all([paymentDetails(id), studentsById([p.student_id]), openCharges(p.student_id)])
  const names = await actorNames([p.received_by, p.reversed_by, ...details.refunds.flatMap((r) => [r.requested_by, r.approved_by, r.processed_by])])
  const receipt = p.receipts?.[0] ?? null
  const cur = p.currency.trim()
  const tz = ctx.school?.timezone
  const completed = p.status === "completed"
  const credit = Number(details.unallocated ?? 0)
  const canCollect = atLeast(ctx.level, "staff")
  const canManage = atLeast(ctx.level, "admin")
  const by = (uid: string | null) => (uid ? (names.get(uid) ?? "Staff member") : "—")

  const info: [string, React.ReactNode][] = [
    ["Status", <StatusBadge key="s" status={p.status} />],
    ["Student", <Link key="st" href={`/finance/students/${p.student_id}`} className="text-brand hover:underline">{studentLabel(students.get(p.student_id))}</Link>],
    ["Amount", <Amount key="a" value={p.amount} currency={cur} className="font-semibold" />],
    ["Method", METHOD_LABELS[p.payment_method] ?? p.payment_method],
    ["Reference", p.reference_number ?? "—"],
    ["Payment date", p.payment_date],
    ["Receipt", receipt ? <Link key="r" href={`/receipts/${receipt.id}`} className="font-mono text-brand hover:underline">{receipt.receipt_number}{receipt.status === "voided" ? " (void)" : ""}</Link> : "—"],
    ["Recorded", p.payment_method === "online" ? `${formatDateTime(p.created_at, tz)} — confirmed by the payment provider` : `${formatDateTime(p.created_at, tz)} by ${by(p.received_by)}`],
    ["Unapplied credit", <Amount key="c" value={credit} currency={cur} />],
    ["Notes", p.notes ?? "—"],
  ]
  if (p.transaction) info.push(["Provider reference", `${p.transaction.provider} · ${p.transaction.provider_transaction_id ?? "—"}`])
  if (p.reversed_at) info.push(["Reversed", `${formatDateTime(p.reversed_at, tz)} by ${by(p.reversed_by)}: ${p.reversal_reason}`])

  return (
    <>
      <PageHeader
        eyebrow="Payment"
        title={receipt ? `Receipt ${receipt.receipt_number}` : "Payment"}
        actions={
          <div className="flex flex-wrap gap-2">
            {receipt && <LinkButton href={`/receipts/${receipt.id}`} variant="secondary" size="sm">View receipt</LinkButton>}
            {completed && canCollect && credit > 0 && ctx.features.includes("refunds") && <RequestRefundButton paymentId={id} max={credit} currency={cur} />}
            {completed && canManage && <ReversePaymentButton paymentId={id} />}
          </div>
        }
      />
      {recorded && <Alert tone="success" className="mb-6">Payment recorded{receipt ? ` — receipt ${receipt.receipt_number} issued` : ""}.</Alert>}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Details" />
          <CardBody><DescriptionList items={info} /></CardBody>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Applied to charges"
              action={completed && canCollect && credit > 0 && (
                <ApplyCreditButton paymentId={id} max={credit} currency={cur} charges={(open.data ?? []).map((c) => ({ id: c.id!, label: c.description ?? "", remaining: Number(c.remaining) }))} />
              )}
            />
            <Table label="Allocations">
              <thead><tr><Th>Charge</Th><Th>Due</Th><Th className="text-right">Applied</Th><Th>State</Th><Th /></tr></thead>
              <tbody>
                {details.allocations.length === 0 && <tr><Td className="text-muted">Not applied to any charge — the full amount is credit.</Td></tr>}
                {details.allocations.map((a) => (
                  <tr key={a.id}>
                    <Td><Link href={`/finance/charges/${a.student_charge_id}`} className="text-brand hover:underline">{a.charge?.description}</Link></Td>
                    <Td>{a.charge?.due_date ?? "—"}</Td>
                    <Td className="text-right"><Amount value={a.amount} currency={cur} /></Td>
                    <Td>{a.released_at ? <span className="text-xs text-muted">Released: {a.release_reason}</span> : <StatusBadge status="active" />}</Td>
                    <Td className="text-right">{completed && canManage && !a.released_at && <ReleaseAllocationButton allocationId={a.id} />}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          {details.refunds.length > 0 && (
            <Card>
              <CardHeader title="Refunds" />
              <Table label="Refunds">
                <thead><tr><Th>Requested</Th><Th>Reason</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th /></tr></thead>
                <tbody>
                  {details.refunds.map((r) => (
                    <tr key={r.id}>
                      <Td className="text-xs">{formatDateTime(r.created_at, tz)}<span className="block text-muted">by {by(r.requested_by)}</span></Td>
                      <Td className="text-muted">{r.reason}{r.decision_note && <span className="block text-xs">Note: {r.decision_note}</span>}</Td>
                      <Td className="text-right"><Amount value={r.amount} currency={cur} /></Td>
                      <Td><StatusBadge status={r.status} /></Td>
                      <Td>{canCollect && <RefundActions refundId={r.id} status={r.status} canManage={canManage} />}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
