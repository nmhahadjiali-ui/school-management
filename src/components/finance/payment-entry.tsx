"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { RecordPicker, type PickerOption } from "@/components/data/record-picker"
import { Table, Td, Th } from "@/components/ui/misc"
import { recordPayment } from "@/lib/actions/finance"
import type { ActionResult } from "@/lib/action-result"
import { cents, formatMoney, METHOD_LABELS, parseMoney, PAYMENT_METHODS } from "@/lib/money"

type OpenCharge = { id: string; description: string; due_date: string | null; remaining: number; effective_status: string }

const inputClass = "block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm aria-[invalid=true]:border-red-500"
const toAmount = (c: number) => (c / 100).toFixed(2)

/**
 * Record a received payment. Amounts are handled as integer cents here only
 * to help the cashier (auto-allocate, totals); the database re-validates
 * everything in numeric and is the authority. A review step must be
 * confirmed before anything is saved, and the idempotency key (one per form)
 * makes a double-click or retry return the same payment.
 */
export function PaymentEntry({
  student,
  charges,
  currency,
  today,
}: {
  student: PickerOption | null
  charges: OpenCharge[]
  currency: string
  today: string
}) {
  const router = useRouter()
  const [key] = useState(() => crypto.randomUUID())
  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>("cash")
  const [reference, setReference] = useState("")
  const [date, setDate] = useState(today)
  const [notes, setNotes] = useState("")
  const [alloc, setAlloc] = useState<Record<string, string>>({})
  const [reviewing, setReviewing] = useState(false)
  const [result, setResult] = useState<ActionResult | null>(null)
  const [pending, start] = useTransition()

  const amountCents = parseMoney(amount) ? cents(parseMoney(amount)) : 0
  const allocated = useMemo(() => Object.values(alloc).reduce((s, v) => s + (parseMoney(v) ? cents(parseMoney(v)) : 0), 0), [alloc])
  const leftover = amountCents - allocated
  const fe = (name: string) => (result && !result.ok ? result.fieldErrors?.[name]?.[0] : undefined)

  function autoAllocate() {
    let left = amountCents
    const next: Record<string, string> = {}
    for (const c of charges) {
      if (left <= 0) break
      const take = Math.min(left, cents(c.remaining))
      if (take > 0) next[c.id] = toAmount(take)
      left -= take
    }
    setAlloc(next)
  }

  function review() {
    setResult(null)
    const problems: string[] = []
    if (!amountCents) problems.push("Enter the amount received.")
    if (leftover < 0) problems.push("The allocations add up to more than the amount received.")
    for (const c of charges) {
      const v = alloc[c.id]
      if (v && !parseMoney(v)) problems.push(`"${c.description}": enter a valid amount.`)
      else if (v && cents(parseMoney(v)) > cents(c.remaining)) problems.push(`"${c.description}": more than the balance due.`)
    }
    if (method !== "cash" && !reference.trim()) problems.push("Enter the reference number (bank, check or transaction no.).")
    if (problems.length) setResult({ ok: false, error: problems.join(" ") })
    else setReviewing(true)
  }

  function confirm() {
    start(async () => {
      const r = await recordPayment({
        student_id: student!.id,
        amount: parseMoney(amount)!,
        payment_method: method,
        reference_number: reference,
        payment_date: date,
        notes,
        allocations: charges.filter((c) => parseMoney(alloc[c.id]) && cents(parseMoney(alloc[c.id])) > 0).map((c) => ({ charge_id: c.id, amount: parseMoney(alloc[c.id])! })),
        idempotency_key: key,
      })
      // Success redirects to the payment; only failures come back here.
      setResult(r)
      setReviewing(false)
    })
  }

  return (
    <div className="space-y-6">
      <RecordPicker
        name="student_id"
        label="Student"
        entity="students"
        required
        initial={student}
        onSelect={(o) => router.push(o ? `/finance/payments/new?student=${o.id}` : "/finance/payments/new")}
      />
      {student && (
        <>
          {result && !result.ok && <Alert tone="error">{result.error}</Alert>}
          <fieldset disabled={reviewing || pending} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1.5 text-sm font-medium">
              Amount received ({currency}) <span className="text-red-600">*</span>
              <input className={inputClass} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={fe("amount") ? true : undefined} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Method
              <select className={inputClass} value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{METHOD_LABELS[m]}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Reference no.
              <input className={inputClass} value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm font-medium">
              Payment date
              <input className={inputClass} type="date" max={today} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="space-y-1.5 text-sm font-medium sm:col-span-2 lg:col-span-4">
              Notes
              <input className={inputClass} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
            </label>
          </fieldset>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Apply to charges</h3>
              <Button variant="secondary" size="sm" disabled={!amountCents || reviewing} onClick={autoAllocate}>Auto-apply (oldest due first)</Button>
            </div>
            {charges.length === 0 ? (
              <p className="text-sm text-muted">This student has no unpaid charges. The whole payment will be kept as credit.</p>
            ) : (
              <Table label="Unpaid charges">
                <thead><tr><Th>Charge</Th><Th>Due</Th><Th className="text-right">Balance</Th><Th className="w-40 text-right">Apply</Th></tr></thead>
                <tbody>
                  {charges.map((c) => (
                    <tr key={c.id}>
                      <Td>{c.description}{c.effective_status === "overdue" && <span className="ml-2 text-xs text-red-700">overdue</span>}</Td>
                      <Td>{c.due_date ?? "—"}</Td>
                      <Td className="text-right tabular-nums">{formatMoney(c.remaining, currency)}</Td>
                      <Td>
                        <input aria-label={`Amount for ${c.description}`} className={`${inputClass} text-right`} inputMode="decimal" disabled={reviewing} value={alloc[c.id] ?? ""} onChange={(e) => setAlloc({ ...alloc, [c.id]: e.target.value })} />
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            <p className="text-sm">
              Applied: <span className="font-medium tabular-nums">{formatMoney(allocated / 100, currency)}</span>
              {" · "}
              {leftover >= 0 ? <>Unapplied (kept as credit): <span className="font-medium tabular-nums">{formatMoney(leftover / 100, currency)}</span></> : <span className="text-red-700">Over-applied by {formatMoney(-leftover / 100, currency)}</span>}
            </p>
          </div>

          {!reviewing ? (
            <div className="flex justify-end"><Button onClick={review}>Review payment</Button></div>
          ) : (
            <div className="space-y-4 rounded-lg border-2 border-brand/40 bg-brand/5 p-5" role="region" aria-label="Confirm payment">
              <h3 className="font-semibold">Confirm this payment</h3>
              <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-sm">
                <dt className="text-muted">Student</dt><dd className="font-medium">{student.label} {student.detail && <span className="text-muted">({student.detail})</span>}</dd>
                <dt className="text-muted">Amount</dt><dd className="text-lg font-semibold">{formatMoney(amountCents / 100, currency)}</dd>
                <dt className="text-muted">Method</dt><dd>{METHOD_LABELS[method]}{reference && ` · ${reference}`}</dd>
                <dt className="text-muted">Date</dt><dd>{date}</dd>
                <dt className="text-muted">Applied to charges</dt><dd>{formatMoney(allocated / 100, currency)}</dd>
                <dt className="text-muted">Kept as credit</dt><dd>{formatMoney(leftover / 100, currency)}</dd>
              </dl>
              <p className="text-xs text-muted">A receipt number is issued automatically. Recorded payments cannot be edited or deleted — an incorrect payment must be reversed by a finance administrator.</p>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" disabled={pending} onClick={() => setReviewing(false)}>Back</Button>
                <Button disabled={pending} onClick={confirm}>{pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Confirm and record</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
