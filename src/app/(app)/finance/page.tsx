import type { Metadata } from "next"
import Link from "next/link"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { PageHeader, Table, Td, Th } from "@/components/ui/misc"
import { Amount, MoneyStat, PaymentsTable } from "@/components/finance/finance-ui"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { isIsoDate, todayIn } from "@/lib/dates"
import { isUuid } from "@/lib/list-params"
import { METHOD_LABELS } from "@/lib/money"
import { gradeOptions, sectionOptions, yearOptions } from "@/lib/options"
import { listAcademicYears, listGradeLevels, listSectionOptions } from "@/services/academic"
import { financeOverview, listFeeTypes, pendingRefundCount, recentPayments, studentsById } from "@/services/finance"

export const metadata: Metadata = { title: "Finance" }

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""
const METHODS = ["cash", "bank_transfer", "check", "card", "e_wallet", "online", "other"]

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const ctx = await requireFinance("view")
  const sp = await searchParams
  const tz = ctx.school?.timezone ?? "UTC"
  const [{ data: years }, { data: grades }, { data: feeTypes }] = await Promise.all([listAcademicYears(ctx.schoolId), listGradeLevels(ctx.schoolId), listFeeTypes(ctx.schoolId)])

  // Every filter is whitelisted; the database function re-checks the school.
  const f = {
    year: isUuid(one(sp.year)) ? one(sp.year) : (one(sp.year) === "all" ? undefined : ctx.current_academic_year?.id),
    grade: isUuid(one(sp.grade)) ? one(sp.grade) : undefined,
    section: isUuid(one(sp.section)) ? one(sp.section) : undefined,
    feeType: isUuid(one(sp.fee_type)) ? one(sp.fee_type) : undefined,
    method: METHODS.includes(one(sp.method)) ? one(sp.method) : undefined,
    from: isIsoDate(one(sp.from)) ? one(sp.from) : undefined,
    to: isIsoDate(one(sp.to)) ? one(sp.to) : undefined,
  }
  const [{ data: o, error }, recent, pendingRefunds, sections] = await Promise.all([
    financeOverview(ctx.schoolId, f),
    recentPayments(ctx.schoolId),
    ctx.features.includes("refunds") ? pendingRefundCount(ctx.schoolId) : Promise.resolve(0),
    f.year ? listSectionOptions(ctx.schoolId, f.year) : Promise.resolve({ data: [] }),
  ])
  const students = await studentsById((recent.data ?? []).map((p) => p.student_id))
  const typeName = new Map((feeTypes ?? []).map((t) => [t.id, t.name]))
  const cur = ctx.currency
  const select = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm"

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Finance overview"
        description={`All amounts in ${cur}. Totals are computed by the database from charges, discounts, adjustments and payments.`}
        actions={atLeast(ctx.level, "staff") && <LinkButton href="/finance/payments/new"><Plus className="size-4" aria-hidden /> Record payment</LinkButton>}
      />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3 text-sm" aria-label="Filters">
        <label className="space-y-1">
          <span className="block text-xs text-muted">Academic year</span>
          <select name="year" defaultValue={f.year ?? "all"} className={select}>
            <option value="all">All years</option>
            {yearOptions(years ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Grade</span>
          <select name="grade" defaultValue={f.grade ?? ""} className={select}>
            <option value="">All grades</option>
            {gradeOptions(grades ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Section</span>
          <select name="section" defaultValue={f.section ?? ""} className={select}>
            <option value="">All sections</option>
            {sectionOptions((sections.data ?? []) as never).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Fee type</span>
          <select name="fee_type" defaultValue={f.feeType ?? ""} className={select}>
            <option value="">All fee types</option>
            {(feeTypes ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">Method</span>
          <select name="method" defaultValue={f.method ?? ""} className={select}>
            <option value="">All methods</option>
            {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="block text-xs text-muted">Paid from</span><input type="date" name="from" defaultValue={f.from} className={select} /></label>
        <label className="space-y-1"><span className="block text-xs text-muted">to</span><input type="date" name="to" defaultValue={f.to} className={select} /></label>
        <button type="submit" className="rounded-md bg-brand px-3 py-1.5 font-medium text-white">Apply</button>
        <Link href="/finance" className="px-2 py-1.5 text-muted hover:underline">Reset</Link>
      </form>

      {error || !o ? (
        <Alert tone="error">The overview could not be loaded. Please refresh the page.</Alert>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MoneyStat label="Total charges" value={o.total_charges} currency={cur} hint="Net of discounts and adjustments" />
            <MoneyStat label="Collected (applied)" value={o.total_collected} currency={cur} tone="green" />
            <MoneyStat label="Outstanding" value={o.outstanding} currency={cur} tone={Number(o.outstanding) > 0 ? "red" : undefined} />
            <MoneyStat label="Overdue" value={o.overdue} currency={cur} tone={Number(o.overdue) > 0 ? "red" : undefined} />
            <MoneyStat label="Payments today" value={o.today} currency={cur} hint={todayIn(tz)} />
            <MoneyStat label="Payments this month" value={o.this_month} currency={cur} />
            <MoneyStat label={f.from || f.to ? "Payments in period" : "All payments received"} value={o.payments_in_range} currency={cur} />
            <MoneyStat label="Unapplied credit" value={o.credits} currency={cur} hint="Overpayments not yet applied or refunded" />
          </div>
          {pendingRefunds > 0 && (
            <Alert tone="warning">{pendingRefunds} refund{pendingRefunds === 1 ? " is" : "s are"} waiting for approval or payout. <Link href="/finance/refunds" className="font-medium underline">Review refunds</Link></Alert>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="By fee type" />
              <Table label="By fee type">
                <thead><tr><Th>Fee type</Th><Th className="text-right">Charged</Th><Th className="text-right">Collected</Th><Th className="text-right">Outstanding</Th></tr></thead>
                <tbody>
                  {o.by_fee_type.length === 0 && <tr><Td className="text-muted">No charges match these filters.</Td></tr>}
                  {o.by_fee_type.map((r) => (
                    <tr key={r.fee_type_id}>
                      <Td>{typeName.get(r.fee_type_id) ?? "—"}</Td>
                      <Td className="text-right"><Amount value={r.charged} currency={cur} /></Td>
                      <Td className="text-right"><Amount value={r.collected} currency={cur} /></Td>
                      <Td className="text-right"><Amount value={r.outstanding} currency={cur} /></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
            <Card>
              <CardHeader title="Payments by method" />
              <CardBody>
                {Object.keys(o.by_method).length === 0 ? <p className="text-sm text-muted">No payments in this period.</p> : (
                  <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
                    {Object.entries(o.by_method).map(([m, v]) => (
                      <div key={m} className="contents"><dt>{METHOD_LABELS[m] ?? m}</dt><dd className="text-right font-medium"><Amount value={v} currency={cur} /></dd></div>
                    ))}
                  </dl>
                )}
              </CardBody>
            </Card>
          </div>
          <Card>
            <CardHeader title="Recent payments" action={<Link href="/finance/payments" className="text-sm font-medium text-brand hover:underline">All payments</Link>} />
            <PaymentsTable rows={recent.data ?? []} students={students} paymentHref={(id) => `/finance/payments/${id}`} />
          </Card>
        </div>
      )}
    </>
  )
}
