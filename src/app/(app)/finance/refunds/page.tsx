import type { Metadata } from "next"
import Link from "next/link"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { Amount, studentLabel } from "@/components/finance/finance-ui"
import { RefundActions } from "@/components/finance/finance-actions"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { formatDateTime } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { actorNames, financeSettings, listRefunds, studentsById } from "@/services/finance"

export const metadata: Metadata = { title: "Refunds" }

const TABS = [
  { value: "open", label: "Needs action" },
  { value: "processed", label: "Paid out" },
  { value: "all", label: "All" },
]

export default async function RefundsPage({ searchParams }: PageProps<"/finance/refunds">) {
  const ctx = await requireFinance("view", "refunds")
  const { tab: rawTab } = await searchParams
  const tab = TABS.some((t) => t.value === rawTab) ? (rawTab as string) : "open"
  const [{ data, error }, { data: settings }] = await Promise.all([listRefunds(ctx.schoolId, tab === "processed" ? "processed" : undefined), financeSettings(ctx.schoolId)])
  const rows = (data ?? []).filter((r) => tab !== "open" || r.status === "requested" || r.status === "approved")
  const [students, names] = await Promise.all([studentsById(rows.map((r) => r.student_id)), actorNames(rows.flatMap((r) => [r.requested_by, r.approved_by, r.processed_by]))])
  const tz = ctx.school?.timezone
  const by = (uid: string | null) => (uid ? (names.get(uid) ?? "Staff member") : null)

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Refunds"
        description={`Refunds come only from a payment's unapplied credit, need approval${settings?.refunds_require_second_approver ? " by a second person" : ""}, and are then paid out. The original payment is never changed.`}
      />
      <nav className="mb-4 flex gap-1 text-sm" aria-label="Refund filters">
        {TABS.map((t) => (
          <Link key={t.value} href={`/finance/refunds?tab=${t.value}`} aria-current={tab === t.value ? "page" : undefined} className={cn("rounded-md px-3 py-1.5 font-medium", tab === t.value ? "bg-brand/10 text-brand" : "text-muted hover:bg-slate-100")}>
            {t.label}
          </Link>
        ))}
      </nav>
      <Card>
        {error ? (
          <Alert tone="error" className="m-4">Refunds could not be loaded. Please refresh the page.</Alert>
        ) : rows.length === 0 ? (
          <EmptyState title={tab === "open" ? "No refunds waiting" : "No refunds"} />
        ) : (
          <Table label="Refunds">
            <thead><tr><Th>Student</Th><Th>Payment</Th><Th>Reason</Th><Th className="text-right">Amount</Th><Th>Status</Th><Th>History</Th><Th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <Td><Link href={`/finance/students/${r.student_id}`} className="font-medium text-brand hover:underline">{studentLabel(students.get(r.student_id))}</Link></Td>
                  <Td><Link href={`/finance/payments/${r.payment_id}`} className="text-brand hover:underline">{r.payment?.receipts?.[0]?.receipt_number ?? r.payment?.payment_date}</Link></Td>
                  <Td className="max-w-xs text-muted">{r.reason}{r.decision_note && <span className="block text-xs">Note: {r.decision_note}</span>}</Td>
                  <Td className="text-right"><Amount value={r.amount} currency={ctx.currency} /></Td>
                  <Td><StatusBadge status={r.status} /></Td>
                  <Td className="text-xs text-muted">
                    Requested {formatDateTime(r.created_at, tz)}{by(r.requested_by) && ` by ${by(r.requested_by)}`}
                    {r.decided_at && <span className="block">{r.status === "rejected" ? "Rejected" : "Approved"} {formatDateTime(r.decided_at, tz)}{by(r.approved_by) && ` by ${by(r.approved_by)}`}</span>}
                    {r.processed_at && <span className="block">Paid out {formatDateTime(r.processed_at, tz)}{r.refund_reference && ` · ${r.refund_reference}`}</span>}
                  </Td>
                  <Td>{atLeast(ctx.level, "staff") && <RefundActions refundId={r.id} status={r.status} canManage={atLeast(ctx.level, "admin")} />}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  )
}
