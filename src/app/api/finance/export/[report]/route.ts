import { NextResponse } from "next/server"
import { financeActor } from "@/lib/finance/access"
import { toCsv } from "@/lib/csv"
import { isIsoDate } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"

/**
 * GET /api/finance/export/:report?from=&to= — CSV exports for finance users.
 * Uses the signed-in user's session, so RLS limits rows to their own school
 * and finance level. Formula-injection safe (see lib/csv).
 */
const REPORTS = ["payments", "charges", "balances", "receipts", "refunds"] as const
type Report = (typeof REPORTS)[number]
const MAX_ROWS = 20_000
const CHUNK = 1000

export async function GET(request: Request, { params }: RouteContext<"/api/finance/export/[report]">) {
  const { report } = await params
  if (!(REPORTS as readonly string[]).includes(report)) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const ctx = await financeActor("view")
  if (!ctx) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const url = new URL(request.url)
  const from = isIsoDate(url.searchParams.get("from")) ? url.searchParams.get("from")! : null
  const to = isIsoDate(url.searchParams.get("to")) ? url.searchParams.get("to")! : null
  const supabase = await createClient()

  // Student names / numbers for every report.
  const studentMap = new Map<string, { name: string; number: string }>()
  async function loadStudents(ids: string[]) {
    const missing = [...new Set(ids)].filter((id) => id && !studentMap.has(id))
    for (let i = 0; i < missing.length; i += 200) {
      const { data } = await supabase.from("students").select("id, first_name, last_name, student_number").in("id", missing.slice(i, i + 200))
      for (const s of data ?? []) studentMap.set(s.id, { name: `${s.last_name}, ${s.first_name}`, number: s.student_number })
    }
  }

  async function fetchAll<T>(build: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
    const out: T[] = []
    for (let start = 0; start < MAX_ROWS; start += CHUNK) {
      const { data, error } = await build(start, start + CHUNK - 1)
      if (error) throw error
      out.push(...(data ?? []))
      if (!data || data.length < CHUNK) break
    }
    return out
  }

  try {
    let header: string[]
    let rows: unknown[][]
    const r = report as Report
    if (r === "payments") {
      const data = await fetchAll((s, e) => {
        let q = supabase.from("payments").select("id, student_id, payment_date, amount, currency, payment_method, reference_number, status, reversal_reason, receipts(receipt_number, status)").eq("school_id", ctx.schoolId)
        if (from) q = q.gte("payment_date", from)
        if (to) q = q.lte("payment_date", to)
        return q.order("payment_date").order("id").range(s, e)
      })
      await loadStudents(data.map((p) => p.student_id))
      header = ["Payment date", "Receipt no.", "Receipt status", "Student no.", "Student", "Method", "Reference", "Amount", "Currency", "Status", "Reversal reason"]
      rows = data.map((p) => [p.payment_date, p.receipts?.[0]?.receipt_number, p.receipts?.[0]?.status, studentMap.get(p.student_id)?.number, studentMap.get(p.student_id)?.name, p.payment_method, p.reference_number, p.amount, p.currency, p.status, p.reversal_reason])
    } else if (r === "charges" || r === "balances") {
      const data = await fetchAll((s, e) => {
        let q = supabase.from("student_charge_balances").select("id, student_id, description, due_date, amount, discounts, adjustments, net_amount, paid, remaining, effective_status, created_at").eq("school_id", ctx.schoolId)
        if (r === "balances") q = q.gt("remaining", 0).neq("effective_status", "cancelled")
        if (from) q = q.gte("due_date", from)
        if (to) q = q.lte("due_date", to)
        return q.order("due_date", { nullsFirst: false }).order("id").range(s, e)
      })
      await loadStudents(data.map((c) => c.student_id!))
      header = ["Student no.", "Student", "Charge", "Due date", "Amount", "Discounts", "Adjustments", "Net amount", "Paid", "Balance", "Status"]
      rows = data.map((c) => [studentMap.get(c.student_id!)?.number, studentMap.get(c.student_id!)?.name, c.description, c.due_date, c.amount, c.discounts, c.adjustments, c.net_amount, c.paid, c.remaining, c.effective_status])
    } else if (r === "receipts") {
      const data = await fetchAll((s, e) => {
        let q = supabase.from("receipts").select("receipt_number, issued_at, status, void_reason, payment:payments(student_id, amount, currency, payment_method, payment_date)").eq("school_id", ctx.schoolId)
        if (from) q = q.gte("issued_at", from)
        if (to) q = q.lte("issued_at", `${to}T23:59:59.999Z`)
        return q.order("receipt_number").range(s, e)
      })
      await loadStudents(data.map((x) => x.payment?.student_id ?? ""))
      header = ["Receipt no.", "Issued at", "Status", "Void reason", "Student no.", "Student", "Payment date", "Method", "Amount", "Currency"]
      rows = data.map((x) => [x.receipt_number, x.issued_at, x.status, x.void_reason, studentMap.get(x.payment?.student_id ?? "")?.number, studentMap.get(x.payment?.student_id ?? "")?.name, x.payment?.payment_date, x.payment?.payment_method, x.payment?.amount, x.payment?.currency])
    } else {
      const data = await fetchAll((s, e) => {
        let q = supabase.from("refunds").select("student_id, amount, reason, status, created_at, decided_at, processed_at, refund_method, refund_reference").eq("school_id", ctx.schoolId)
        if (from) q = q.gte("created_at", from)
        if (to) q = q.lte("created_at", `${to}T23:59:59.999Z`)
        return q.order("created_at").range(s, e)
      })
      await loadStudents(data.map((x) => x.student_id))
      header = ["Requested at", "Student no.", "Student", "Amount", "Reason", "Status", "Decided at", "Paid out at", "Method", "Reference"]
      rows = data.map((x) => [x.created_at, studentMap.get(x.student_id)?.number, studentMap.get(x.student_id)?.name, x.amount, x.reason, x.status, x.decided_at, x.processed_at, x.refund_method, x.refund_reference])
    }
    const name = `${report}${from ? `-from-${from}` : ""}${to ? `-to-${to}` : ""}.csv`
    return new NextResponse(toCsv(header, rows), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
    })
  } catch (e) {
    console.error("[finance export]", e)
    return NextResponse.json({ error: "export_failed" }, { status: 500 })
  }
}
