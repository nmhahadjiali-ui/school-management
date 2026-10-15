"use client"

import Link from "next/link"
import { useId, useRef, useState, useTransition } from "react"
import { AlertTriangle, Loader2, Percent, X } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { EmptyState, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { useToast } from "@/components/ui/toast"
import { Amount } from "@/components/finance/finance-ui"
import { applyDiscountToCharges } from "@/lib/actions/finance"
import { formatMoney } from "@/lib/money"
import type { ChargeBalance } from "@/services/finance"

export type DiscountTypeOption = { id: string; name: string; calculation_type: "fixed" | "percentage"; value: number }

const cents = (v: number | string | null | undefined) => Math.round(Number(v ?? 0) * 100)
/** A charge can take a discount while something is still owed on it. */
const open = (c: ChargeBalance) => c.effective_status !== "cancelled" && cents(c.remaining) > 0

/** What the database will record for one charge: the discount, capped at what remains (in cents). */
function discountCents(c: ChargeBalance, dt: DiscountTypeOption) {
  const raw = dt.calculation_type === "fixed" ? cents(dt.value) : Math.round((cents(c.amount) * Number(dt.value)) / 100)
  return Math.min(raw, cents(c.remaining))
}

/**
 * The student's charges with checkboxes for finance admins: pick charges
 * (or "all unpaid" / "unpaid tuition"), then apply one discount type to all of
 * them. The dialog shows exactly what each choice gives before confirming.
 */
export function DiscountableCharges({
  rows,
  currency,
  discountTypes,
  tuitionTypeIds,
  chargeHrefs,
}: {
  rows: ChargeBalance[]
  currency: string
  discountTypes: DiscountTypeOption[]
  /** Fee types in the "tuition" category, for the quick selection. */
  tuitionTypeIds: string[]
  /** Link per charge id (functions cannot be passed to a client component). */
  chargeHrefs?: Record<string, string>
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [typeId, setTypeId] = useState(discountTypes[0]?.id ?? "")
  const [reason, setReason] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const toast = useToast()

  if (rows.length === 0) return <EmptyState title="No charges" description="Nothing has been billed yet." />

  const openRows = rows.filter(open)
  const tuitionRows = openRows.filter((c) => c.fee_type_id && tuitionTypeIds.includes(c.fee_type_id))
  const chosen = rows.filter((c) => selected.has(c.id!))
  const allOpenSelected = openRows.length > 0 && openRows.every((c) => selected.has(c.id!))
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const select = (list: ChargeBalance[]) => setSelected(new Set(list.map((c) => c.id!)))

  const dt = discountTypes.find((d) => d.id === typeId)
  const perCharge = dt ? chosen.map((c) => discountCents(c, dt)) : []
  const totalCents = perCharge.reduce((a, b) => a + b, 0)
  const capped = dt ? chosen.filter((c, i) => perCharge[i] < (dt.calculation_type === "fixed" ? cents(dt.value) : Math.round((cents(c.amount) * Number(dt.value)) / 100))).length : 0
  const money = (c: number) => formatMoney(c / 100, currency)

  const apply = () => {
    setError(null)
    startTransition(async () => {
      const r = await applyDiscountToCharges({ charge_ids: chosen.map((c) => c.id!), discount_type_id: typeId, reason })
      if (r.ok) {
        dialog.current?.close()
        setSelected(new Set())
        setReason("")
        if (r.message) toast?.(r.message)
      } else setError(r.fieldErrors ? Object.values(r.fieldErrors).flat()[0] ?? r.error : r.error)
    })
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <Button size="sm" variant="secondary" disabled={openRows.length === 0} onClick={() => select(openRows)}>Select all unpaid ({openRows.length})</Button>
        {tuitionTypeIds.length > 0 && (
          <Button size="sm" variant="secondary" disabled={tuitionRows.length === 0} onClick={() => select(tuitionRows)}>Select unpaid tuition ({tuitionRows.length})</Button>
        )}
        {selected.size > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            <X className="size-4" aria-hidden /> Clear
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {selected.size > 0 && <span className="text-sm text-muted">{selected.size} selected</span>}
          <Button
            size="sm"
            disabled={selected.size === 0 || discountTypes.length === 0}
            title={discountTypes.length === 0 ? "Create an active discount type in Fee setup first" : undefined}
            onClick={() => {
              setError(null)
              dialog.current?.showModal()
            }}
          >
            <Percent className="size-4" aria-hidden /> Apply discount to selected
          </Button>
        </div>
      </div>

      <Table label="Charges">
        <thead>
          <tr>
            <Th className="w-10">
              <input
                type="checkbox"
                aria-label="Select all unpaid charges"
                checked={allOpenSelected}
                disabled={openRows.length === 0}
                onChange={() => (allOpenSelected ? setSelected(new Set()) : select(openRows))}
                className="size-4 accent-[var(--brand)]"
              />
            </Th>
            <Th>Description</Th>
            <Th>Due</Th>
            <Th className="text-right">Amount</Th>
            <Th className="text-right">Discounts / adj.</Th>
            <Th className="text-right">Paid</Th>
            <Th className="text-right">Balance</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const adj = Number(c.adjustments ?? 0) - Number(c.discounts ?? 0)
            const can = open(c)
            return (
              <tr key={c.id} className={selected.has(c.id!) ? "bg-brand/5" : "hover:bg-slate-50"}>
                <Td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${c.description}`}
                    checked={selected.has(c.id!)}
                    disabled={!can}
                    title={can ? undefined : "Paid or cancelled charges cannot take a discount"}
                    onChange={() => toggle(c.id!)}
                    className="size-4 accent-[var(--brand)] disabled:opacity-30"
                  />
                </Td>
                <Td>{chargeHrefs?.[c.id!] ? <Link href={chargeHrefs[c.id!]} className="text-brand hover:underline">{c.description}</Link> : c.description}</Td>
                <Td className="whitespace-nowrap">{c.due_date ?? "—"}</Td>
                <Td className="text-right"><Amount value={c.amount} currency={currency} /></Td>
                <Td className="text-right text-muted">{adj === 0 ? "—" : <Amount value={adj} currency={currency} />}</Td>
                <Td className="text-right"><Amount value={c.paid} currency={currency} /></Td>
                <Td className="text-right font-medium"><Amount value={c.remaining} currency={currency} /></Td>
                <Td><StatusBadge status={c.effective_status ?? "pending"} /></Td>
              </tr>
            )
          })}
        </tbody>
      </Table>

      <dialog ref={dialog} aria-labelledby={titleId} className="m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-surface p-0 text-foreground shadow-xl">
        <div className="space-y-4 p-5">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">Apply a discount to {chosen.length} charge{chosen.length === 1 ? "" : "s"}</h2>
            <p className="mt-0.5 text-sm text-muted">Each discount is recorded separately; the original charges never change and every discount can be revoked later.</p>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Discount <span className="text-red-600">*</span></span>
            <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm">
              {discountTypes.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.calculation_type === "percentage" ? `${Number(d.value)}%` : formatMoney(d.value, currency)})</option>
              ))}
            </select>
          </label>

          {dt && chosen.length > 0 && (
            <div className={dt.calculation_type === "fixed" && chosen.length > 1 ? "flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" : "rounded-md bg-slate-50 p-3 text-sm"}>
              {dt.calculation_type === "fixed" && chosen.length > 1 && <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
              <div className="space-y-1">
                <p>
                  {dt.calculation_type === "fixed"
                    ? chosen.length > 1
                      ? <>This gives <strong>{formatMoney(dt.value, currency)} off each</strong> of the {chosen.length} charges (<strong>{money(totalCents)} total</strong>).</>
                      : <>This gives <strong>{money(totalCents)}</strong> off the charge.</>
                    : <>This gives <strong>{Number(dt.value)}% off each</strong> selected charge (<strong>{money(totalCents)} total</strong>).</>}
                </p>
                {capped > 0 && <p className="text-xs">{capped} charge{capped === 1 ? " has" : "s have"} less left to pay than the discount, so {capped === 1 ? "it is" : "they are"} reduced to zero instead; the total above already accounts for that.</p>}
                {dt.calculation_type === "fixed" && chosen.length > 1 && <p className="text-xs">If you meant {formatMoney(dt.value, currency)} in total, apply it to one charge only.</p>}
              </div>
            </div>
          )}

          <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-md border border-border text-sm">
            {chosen.map((c, i) => (
              <li key={c.id} className="flex justify-between gap-3 px-3 py-1.5">
                <span className="truncate">{c.description}</span>
                <span className="shrink-0 tabular-nums text-green-700">{dt ? `− ${money(perCharge[i])}` : ""}</span>
              </li>
            ))}
          </ul>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">Reason <span className="text-red-600">*</span></span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Sibling discount SY 2026-2027" className="block w-full rounded-md border border-border bg-surface px-3 py-2 text-sm shadow-sm" />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border bg-slate-50 px-5 py-3">
          <Button variant="secondary" onClick={() => dialog.current?.close()} disabled={pending}>Cancel</Button>
          <Button onClick={apply} disabled={pending || !dt || chosen.length === 0 || reason.trim().length < 3}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Apply to {chosen.length} charge{chosen.length === 1 ? "" : "s"}
          </Button>
        </div>
      </dialog>
    </>
  )
}
