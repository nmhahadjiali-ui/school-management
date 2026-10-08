"use client"

import { useState, useTransition } from "react"
import { Loader2 } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { simulateCheckout, startOnlinePayment } from "@/lib/actions/finance"
import { cents, formatMoney } from "@/lib/money"

type Charge = { id: string; description: string; due_date: string | null; remaining: number }

/**
 * Parent / student: choose charges and pay online. The total shown is a
 * preview; the DATABASE computes the amount charged from the selected charges.
 */
export function OnlinePay({ studentId, charges, currency }: { studentId: string; charges: Charge[]; currency: string }) {
  const [selected, setSelected] = useState<string[]>(() => charges.map((c) => c.id))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const total = charges.filter((c) => selected.includes(c.id)).reduce((s, c) => s + cents(c.remaining), 0)

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <ul className="divide-y divide-border rounded-md border border-border">
        {charges.map((c) => (
          <li key={c.id}>
            <label className="flex items-center gap-3 px-3 py-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--brand)]" checked={selected.includes(c.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id))} />
              <span className="flex-1">{c.description}{c.due_date && <span className="ml-2 text-xs text-muted">due {c.due_date}</span>}</span>
              <span className="tabular-nums">{formatMoney(c.remaining, currency)}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">Total: <span className="text-lg font-semibold tabular-nums">{formatMoney(total / 100, currency)}</span></p>
        <Button disabled={pending || selected.length === 0} onClick={() => start(async () => {
          setError(null)
          const r = await startOnlinePayment({ student_id: studentId, charge_ids: selected })
          if (r && !r.ok) setError(r.error)
        })}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Pay online
        </Button>
      </div>
      <p className="text-xs text-muted">You will be taken to the payment provider. Your payment is recorded only after the provider confirms it to the school.</p>
    </div>
  )
}

/** Buttons on the TEST gateway's checkout page. */
export function SimulatorButtons({ transactionId }: { transactionId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const run = (outcome: "successful" | "failed" | "cancelled") =>
    start(async () => {
      setError(null)
      const r = await simulateCheckout(transactionId, outcome)
      if (r && !r.ok) setError(r.error)
    })
  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => run("successful")}>{pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Pay (simulate success)</Button>
        <Button variant="secondary" disabled={pending} onClick={() => run("failed")}>Simulate failure</Button>
        <Button variant="ghost" disabled={pending} onClick={() => run("cancelled")}>Cancel</Button>
      </div>
    </div>
  )
}
