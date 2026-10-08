import type { Metadata } from "next"
import Link from "next/link"
import { Download } from "lucide-react"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { atLeast, requireFinance } from "@/lib/finance/access"
import { isIsoDate } from "@/lib/dates"

export const metadata: Metadata = { title: "Finance reports" }

const REPORTS = [
  { key: "payments", title: "Payments (collections)", description: "Every payment with receipt number, method, reference and status. Date range = payment date." },
  { key: "balances", title: "Outstanding balances", description: "Charges with a balance due, per student. Date range = due date." },
  { key: "charges", title: "All charges", description: "Charges with discounts, adjustments, amount paid and balance. Date range = due date." },
  { key: "receipts", title: "Receipts", description: "Issued and voided receipts. Date range = issue date." },
  { key: "refunds", title: "Refunds", description: "Refund requests and payouts. Date range = request date." },
]

export default async function ReportsPage({ searchParams }: PageProps<"/finance/reports">) {
  const ctx = await requireFinance("view")
  const sp = await searchParams
  const from = typeof sp.from === "string" && isIsoDate(sp.from) ? sp.from : ""
  const to = typeof sp.to === "string" && isIsoDate(sp.to) ? sp.to : ""
  const qs = new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString()
  const input = "rounded-md border border-border bg-surface px-2 py-1.5 text-sm"

  return (
    <>
      <PageHeader eyebrow="Finance" title="Reports" description="CSV exports open in Excel or Google Sheets. Only your school's records are included." />
      <form method="get" className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3 text-sm">
        <label className="space-y-1"><span className="block text-xs text-muted">From</span><input type="date" name="from" defaultValue={from} className={input} /></label>
        <label className="space-y-1"><span className="block text-xs text-muted">To</span><input type="date" name="to" defaultValue={to} className={input} /></label>
        <button type="submit" className="rounded-md bg-brand px-3 py-1.5 font-medium text-white">Set date range</button>
        {(from || to) && <Link href="/finance/reports" className="px-2 py-1.5 text-muted hover:underline">Clear</Link>}
      </form>
      <div className="grid gap-4 md:grid-cols-2">
        {REPORTS.filter((r) => r.key !== "refunds" || ctx.features.includes("refunds")).map((r) => (
          <Card key={r.key}>
            <CardHeader title={r.title} description={r.description} />
            <CardBody>
              <a href={`/api/finance/export/${r.key}${qs ? `?${qs}` : ""}`} className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline" download>
                <Download className="size-4" aria-hidden /> Download CSV{from || to ? ` (${from || "…"} to ${to || "…"})` : ""}
              </a>
            </CardBody>
          </Card>
        ))}
      </div>
      <div className="mt-6 flex flex-wrap gap-4 text-sm">
        <Link href="/finance/receipts" className="font-medium text-brand hover:underline">Browse receipts</Link>
        {atLeast(ctx.level, "admin") && <Link href="/finance/audit" className="font-medium text-brand hover:underline">Financial audit log</Link>}
        {atLeast(ctx.level, "admin") && <Link href="/finance/settings" className="font-medium text-brand hover:underline">Finance settings</Link>}
      </div>
    </>
  )
}
