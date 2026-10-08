import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Card } from "@/components/ui/card"
import { EmptyState, PageHeader } from "@/components/ui/misc"
import { Amount } from "@/components/finance/finance-ui"
import { requireFamilyFinance } from "@/lib/finance/access"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Fees & payments" }

/** Student: straight to their account. Parent: their verified children (RLS decides who appears). */
export default async function FeesPage() {
  const ctx = await requireFamilyFinance()
  if (ctx.profile.role === "student") {
    if (ctx.record?.type === "student") redirect(`/fees/${ctx.record.id}`)
  }
  const supabase = await createClient()
  const { data: students } = await supabase.from("students").select("id, first_name, last_name, student_number").eq("school_id", ctx.schoolId).order("last_name")
  const ids = (students ?? []).map((s) => s.id)
  const { data: balances } = ids.length
    ? await supabase.from("student_charge_balances").select("student_id, remaining, effective_status").in("student_id", ids).neq("effective_status", "cancelled")
    : { data: [] }
  const due = new Map<string, number>()
  const overdue = new Map<string, number>()
  for (const b of balances ?? []) {
    const c = Math.round(Number(b.remaining) * 100)
    due.set(b.student_id!, (due.get(b.student_id!) ?? 0) + c)
    if (b.effective_status === "overdue") overdue.set(b.student_id!, (overdue.get(b.student_id!) ?? 0) + c)
  }

  return (
    <>
      <PageHeader title="Fees & payments" description="Balances, payments and receipts for your children." />
      <Card>
        {(students ?? []).length === 0 ? (
          <EmptyState title="No linked students" description="Your account is not linked to a student yet. Please contact the school." />
        ) : (
          <ul className="divide-y divide-border">
            {(students ?? []).map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <Link href={`/fees/${s.id}`} className="font-medium text-brand hover:underline">{s.first_name} {s.last_name}</Link>
                  <p className="text-sm text-muted">{s.student_number}</p>
                </div>
                <div className="text-right text-sm">
                  <p>Balance due: <Amount value={(due.get(s.id) ?? 0) / 100} currency={ctx.currency} className="font-semibold" /></p>
                  {(overdue.get(s.id) ?? 0) > 0 && <p className="text-red-700">Overdue: <Amount value={(overdue.get(s.id) ?? 0) / 100} currency={ctx.currency} /></p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}
