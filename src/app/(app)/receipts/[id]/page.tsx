import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Alert } from "@/components/ui/alert"
import { Amount } from "@/components/finance/finance-ui"
import { PrintButton } from "@/components/finance/finance-actions"
import { requireActiveUser } from "@/lib/auth/session"
import { myFinanceLevel } from "@/lib/finance/access"
import { formatDateTime } from "@/lib/dates"
import { isUuid } from "@/lib/list-params"
import { METHOD_LABELS } from "@/lib/money"
import { personName } from "@/lib/options"
import { createClient } from "@/lib/supabase/server"
import { actorNames, getReceipt, getStudentRef } from "@/services/finance"
import { getSchool } from "@/services/schools"

export const metadata: Metadata = { title: "Receipt" }

/**
 * Printable payment receipt. Visible to the school's finance users and to the
 * student / verified parents (RLS); anyone else gets "not found".
 * This is an acknowledgement of payment, NOT an official tax invoice.
 */
export default async function ReceiptPage({ params }: PageProps<"/receipts/[id]">) {
  const ctx = await requireActiveUser()
  const family = ["student", "parent"].includes(ctx.profile.role) && ctx.features.includes("student_finance")
  if (!ctx.features.includes("billing") || (!family && (await myFinanceLevel()) === "none")) redirect("/dashboard?denied=1")
  const { id } = await params
  if (!isUuid(id)) notFound()
  const { data: r } = await getReceipt(id)
  if (!r?.payment) notFound()
  const p = r.payment
  const supabase = await createClient()
  const [{ data: student }, { data: school }, { data: allocations }, names] = await Promise.all([
    getStudentRef(p.student_id),
    getSchool(r.school_id),
    supabase.from("payment_allocations").select("amount, released_at, charge:student_charges(description)").eq("payment_id", p.id).order("created_at"),
    family ? Promise.resolve(new Map<string, string>()) : actorNames([r.issued_by]),
  ])
  const cur = p.currency.trim()
  const tz = ctx.school?.timezone
  const applied = (allocations ?? []).filter((a) => !a.released_at)
  const appliedCents = applied.reduce((s, a) => s + Math.round(Number(a.amount) * 100), 0)
  const voided = r.status === "voided"

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex justify-end gap-2 print:hidden">
        <PrintButton />
      </div>
      {voided && <Alert tone="error" className="mb-4">This receipt was VOIDED on {formatDateTime(r.voided_at, tz)}: {r.void_reason}</Alert>}
      <article className="relative rounded-lg border border-border bg-surface p-8 shadow-sm print:border-0 print:shadow-none">
        {voided && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-7xl font-bold text-red-600/15 -rotate-12" aria-hidden>VOID</p>}
        <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="text-lg font-semibold">{school?.name ?? ctx.school?.name}</h1>
            {school?.address && <p className="text-sm text-muted">{school.address}</p>}
            {(school?.contact_phone || school?.contact_email) && <p className="text-sm text-muted">{[school.contact_phone, school.contact_email].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-muted">Payment receipt</p>
            <p className="font-mono text-lg font-semibold">{r.receipt_number}</p>
            <p className="text-sm text-muted">{formatDateTime(r.issued_at, tz)}</p>
          </div>
        </header>

        <dl className="mt-6 grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted">Received from</dt>
          <dd className="font-medium">{student ? `${personName(student)} (${student.student_number})` : "Student"}</dd>
          <dt className="text-muted">Payment date</dt>
          <dd>{p.payment_date}</dd>
          <dt className="text-muted">Method</dt>
          <dd>{METHOD_LABELS[p.payment_method] ?? p.payment_method}{p.reference_number && ` · Ref. ${p.reference_number}`}</dd>
          {!family && r.issued_by && (<><dt className="text-muted">Received by</dt><dd>{names.get(r.issued_by) ?? "Staff member"}</dd></>)}
        </dl>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted"><th className="py-2 font-medium">Applied to</th><th className="py-2 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody>
            {applied.map((a, i) => (
              <tr key={i} className="border-b border-border/60"><td className="py-2">{a.charge?.description}</td><td className="py-2 text-right"><Amount value={a.amount} currency={cur} /></td></tr>
            ))}
            {Math.round(Number(p.amount) * 100) - appliedCents > 0 && (
              <tr className="border-b border-border/60"><td className="py-2 text-muted">Unapplied (credit on account)</td><td className="py-2 text-right"><Amount value={(Math.round(Number(p.amount) * 100) - appliedCents) / 100} currency={cur} /></td></tr>
            )}
          </tbody>
          <tfoot>
            <tr><td className="pt-3 font-semibold">Total received</td><td className="pt-3 text-right text-lg font-semibold"><Amount value={p.amount} currency={cur} /></td></tr>
          </tfoot>
        </table>

        <p className="mt-8 border-t border-border pt-4 text-xs text-muted">
          This receipt acknowledges payment received by the school. It is not an official receipt or invoice for tax purposes.
          {p.status === "reversed" && " The payment was reversed."}
        </p>
      </article>
    </div>
  )
}
