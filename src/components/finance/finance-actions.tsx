"use client"

import { useState, useTransition } from "react"
import { Loader2, Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { Field } from "@/components/ui/form"
import { FormDialog } from "@/components/ui/form-dialog"
import { RecordPicker } from "@/components/data/record-picker"
import { useToast } from "@/components/ui/toast"
import * as fin from "@/lib/actions/finance"
import { formatMoney, PAYMENT_METHODS, METHOD_LABELS } from "@/lib/money"

type Opt = { value: string; label: string }
const reasonField = (label = "Reason") => <Field as="textarea" name="reason" label={label} required maxLength={500} />

// --- Configuration -------------------------------------------------------------------
const CATEGORIES = ["tuition", "registration", "miscellaneous", "laboratory", "library", "activity", "transportation", "uniform", "other"]
const statusOptions = [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]

export function FeeTypeDialog({ feeType }: { feeType?: { id: string; name: string; code: string; category: string; description: string | null; status: string } }) {
  return (
    <FormDialog
      trigger={feeType ? "Edit" : <><Plus className="size-4" aria-hidden /> Fee type</>}
      variant={feeType ? "ghost" : "secondary"}
      size="sm"
      title={feeType ? "Edit fee type" : "New fee type"}
      action={fin.saveFeeType.bind(null, feeType?.id ?? null)}
    >
      <Field name="name" label="Name" required defaultValue={feeType?.name} maxLength={100} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="code" label="Code" required defaultValue={feeType?.code} maxLength={20} />
        <Field as="select" name="category" label="Category" defaultValue={feeType?.category ?? "tuition"} options={CATEGORIES.map((c) => ({ value: c, label: c[0].toUpperCase() + c.slice(1) }))} />
      </div>
      <Field as="textarea" name="description" label="Description" defaultValue={feeType?.description ?? ""} maxLength={500} />
      {feeType && <Field as="select" name="status" label="Status" defaultValue={feeType.status} options={statusOptions} />}
    </FormDialog>
  )
}

export type StructureSection = { id: string; name: string; academic_year_id: string; grade_level_id: string; grade_level: { name: string } | null }

/**
 * Name, academic year, grade level, section and description of a fee
 * structure. The section list follows the chosen year and grade; picking a
 * section also sets its grade (the database requires them to match).
 * `yearLocked`: the year cannot change (editing).
 */
export function FeeStructureFields({
  years,
  grades,
  sections,
  value,
  yearLocked = false,
}: {
  years: Opt[]
  grades: Opt[]
  sections: StructureSection[]
  value?: { name: string; academic_year_id: string; grade_level_id: string | null; section_id: string | null; description: string | null; status?: string }
  yearLocked?: boolean
}) {
  const [year, setYear] = useState(value?.academic_year_id ?? years[0]?.value ?? "")
  const [grade, setGrade] = useState(value?.grade_level_id ?? "")
  const [section, setSection] = useState(value?.section_id ?? "")
  const sectionChoices = sections.filter((s) => s.academic_year_id === year && (!grade || s.grade_level_id === grade))
  const yearLabel = years.find((y) => y.value === year)?.label ?? ""

  return (
    <>
      <Field name="name" label="Name" required defaultValue={value?.name} maxLength={150} placeholder="e.g. Grade 7 — SY 2026-2027" />
      <div className="grid gap-4 sm:grid-cols-3">
        {yearLocked ? (
          <div className="space-y-1.5">
            <input type="hidden" name="academic_year_id" value={year} />
            <p className="text-sm font-medium">Academic year</p>
            <p className="py-2 text-sm text-muted">{yearLabel}</p>
          </div>
        ) : (
          <Field
            as="select"
            name="academic_year_id"
            label="Academic year"
            required
            value={year}
            onChange={(e) => {
              setYear(e.target.value)
              setSection("")
            }}
            options={years}
          />
        )}
        <Field
          as="select"
          name="grade_level_id"
          label="Grade level"
          value={grade}
          onChange={(e) => {
            setGrade(e.target.value)
            if (section && !sections.some((s) => s.id === section && s.grade_level_id === e.target.value)) setSection("")
          }}
          options={[{ value: "", label: "All grade levels" }, ...grades]}
        />
        <Field
          as="select"
          name="section_id"
          label="Section"
          value={section}
          onChange={(e) => {
            setSection(e.target.value)
            const s = sections.find((x) => x.id === e.target.value)
            if (s) setGrade(s.grade_level_id)
          }}
          options={[{ value: "", label: grade ? "All sections of the grade" : "All sections" }, ...sectionChoices.map((s) => ({ value: s.id, label: `${s.grade_level?.name ?? ""} – ${s.name}` }))]}
          hint={sectionChoices.length === 0 ? "No sections in this year yet." : undefined}
        />
      </div>
      <Field as="textarea" name="description" label="Description" defaultValue={value?.description ?? ""} maxLength={1000} />
      {value?.status && <Field as="select" name="status" label="Status" defaultValue={value.status} options={statusOptions} />}
    </>
  )
}

export function DiscountTypeDialog({ discountType }: { discountType?: { id: string; name: string; code: string; calculation_type: string; value: number; description: string | null; status: string } }) {
  return (
    <FormDialog
      trigger={discountType ? "Edit" : <><Plus className="size-4" aria-hidden /> Discount type</>}
      variant={discountType ? "ghost" : "secondary"}
      size="sm"
      title={discountType ? "Edit discount type" : "New discount type"}
      description="Changing a discount type never changes discounts already given."
      action={fin.saveDiscountType.bind(null, discountType?.id ?? null)}
    >
      <Field name="name" label="Name" required defaultValue={discountType?.name} maxLength={100} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field name="code" label="Code" required defaultValue={discountType?.code} maxLength={20} />
        <Field as="select" name="calculation_type" label="Type" defaultValue={discountType?.calculation_type ?? "fixed"} options={[{ value: "fixed", label: "Fixed amount" }, { value: "percentage", label: "Percentage" }]} />
        <Field name="value" label="Value" required inputMode="decimal" defaultValue={discountType ? String(discountType.value) : ""} />
      </div>
      <Field as="textarea" name="description" label="Description" defaultValue={discountType?.description ?? ""} maxLength={500} />
      {discountType && <Field as="select" name="status" label="Status" defaultValue={discountType.status} options={statusOptions} />}
    </FormDialog>
  )
}

export function StructureItemDialog({
  structureId,
  feeTypes,
  item,
  currency,
  nextSequence,
}: {
  structureId: string
  feeTypes: Opt[]
  item?: StructureItem
  currency?: string
  nextSequence?: number
}) {
  return (
    <FormDialog
      trigger={item ? "Edit" : <><Plus className="size-4" aria-hidden /> Fee item</>}
      variant={item ? "secondary" : "primary"}
      size="sm"
      title={item ? "Edit fee item" : "Add fee item"}
      action={fin.saveStructureItem.bind(null, structureId, item?.id ?? null)}
    >
      <StructureItemFields feeTypes={feeTypes} item={item} currency={currency} nextSequence={nextSequence} />
    </FormDialog>
  )
}

type StructureItem = { id: string; fee_type_id: string; name: string; amount: number; frequency: string; installments: number; due_date: string | null; sequence: number }

const FREQUENCIES: Opt[] = [
  { value: "one_time", label: "One-time" }, { value: "monthly", label: "Monthly" }, { value: "quarterly", label: "Quarterly" },
  { value: "semester", label: "Per semester" }, { value: "annual", label: "Annual" }, { value: "custom", label: "Custom" },
]
/** Frequencies that can be split into installments, and the months between their due dates. */
const SPLIT_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, semester: 6 }

/** Even split to the cent; the last installment absorbs the remainder (same rule as the database). */
function splitAmount(total: number, n: number) {
  const cents = Math.round(total * 100)
  const each = Math.trunc(cents / n)
  return { each: each / 100, last: (cents - each * (n - 1)) / 100 }
}

/**
 * Fee item form, grouped: what (fee type, item name), how much and when
 * (amount, frequency, installments when the frequency allows them, first due
 * date), and the order in the list. A preview line shows the resulting charges.
 */
function StructureItemFields({ feeTypes, item, currency = "PHP", nextSequence = 1 }: { feeTypes: Opt[]; item?: StructureItem; currency?: string; nextSequence?: number }) {
  const [frequency, setFrequency] = useState(item?.frequency ?? "one_time")
  const [installments, setInstallments] = useState(String(item?.installments ?? 1))
  const [amount, setAmount] = useState(item ? String(item.amount) : "")
  const [due, setDue] = useState(item?.due_date ?? "")
  const splittable = frequency in SPLIT_MONTHS
  const n = splittable ? Math.min(24, Math.max(1, Math.trunc(Number(installments)) || 1)) : 1
  const total = Number(amount.replace(/[,s]/g, ""))

  let preview = ""
  if (total > 0) {
    const { each, last } = splitAmount(total, n)
    preview = n === 1 ? `1 charge of ${formatMoney(total, currency)}` : each === last ? `${n} charges of ${formatMoney(each, currency)}` : `${n - 1} charges of ${formatMoney(each, currency)} + 1 of ${formatMoney(last, currency)}`
    if (due) {
      const first = new Date(`${due}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
      preview += n > 1 ? `, due every ${SPLIT_MONTHS[frequency] === 1 ? "month" : `${SPLIT_MONTHS[frequency]} months`} from ${first}` : `, due ${first}`
    }
    preview += " per student."
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[2fr_3fr]">
        <Field as="select" name="fee_type_id" label="Fee type" required defaultValue={item?.fee_type_id} options={feeTypes} hint="Category used in reports." />
        <Field name="name" label="Item name" required defaultValue={item?.name} maxLength={150} placeholder="e.g. Tuition fee – Grade 7" hint="Shown to students and parents on charges and receipts." />
      </div>
      <fieldset className="space-y-4 rounded-md border border-border p-3">
        <legend className="px-1 text-sm font-medium">Amount and schedule</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="amount" label="Total amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          <Field as="select" name="frequency" label="Frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)} options={FREQUENCIES} />
          {splittable ? (
            <Field name="installments" label="Installments" type="number" min={1} max={24} value={installments} onChange={(e) => setInstallments(e.target.value)} hint="The total is split evenly." />
          ) : (
            <input type="hidden" name="installments" value="1" />
          )}
          <Field name="due_date" label={n > 1 ? "First due date" : "Due date"} type="date" value={due} onChange={(e) => setDue(e.target.value)} hint="Optional." />
        </div>
        {preview && <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-muted">{preview}</p>}
      </fieldset>
      <Field name="sequence" label="Order in the list" type="number" min={1} max={100} defaultValue={item?.sequence ?? nextSequence} className="sm:w-40" />
    </div>
  )
}

export function DeleteItemButton({ itemId }: { itemId: string }) {
  return (
    <ConfirmAction trigger="Remove" destructive title="Remove fee item?" description="Only items that have not generated charges can be removed." confirmLabel="Remove" onConfirm={() => fin.deleteStructureItem(itemId)} />
  )
}

type Preview = { students: number; created: number; already_existed: number }

/** Preview first (dry run), then generate. Repeating never duplicates charges. */
export function GenerateCharges({ structureId, currencyHint }: { structureId: string; currencyHint?: string }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const toast = useToast()
  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {preview && (
        <Alert tone={preview.created ? "info" : "success"}>
          {preview.created
            ? `${preview.created} new charge${preview.created === 1 ? "" : "s"} will be created for ${preview.students} enrolled student${preview.students === 1 ? "" : "s"}${preview.already_existed ? ` (${preview.already_existed} already exist and will be skipped)` : ""}.`
            : `All ${preview.already_existed} charges already exist. Nothing to generate.`}
          {currencyHint && <span className="block text-xs">{currencyHint}</span>}
        </Alert>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={pending} onClick={() => start(async () => {
          setError(null)
          const r = await fin.generateCharges(structureId, true)
          if (r.ok) setPreview(r.preview ?? null)
          else setError(r.error)
        })}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />} Preview charges
        </Button>
        {preview && preview.created > 0 && (
          <Button disabled={pending} onClick={() => start(async () => {
            const r = await fin.generateCharges(structureId, false)
            if (r.ok) {
              setPreview(null)
              if (r.message) toast?.(r.message)
            } else setError(r.error)
          })}>
            Generate {preview.created} charge{preview.created === 1 ? "" : "s"}
          </Button>
        )}
      </div>
    </div>
  )
}

// --- Charges ------------------------------------------------------------------------
export function NewChargeDialog({ feeTypes, student }: { feeTypes: Opt[]; student?: { id: string; label: string } }) {
  return (
    <FormDialog trigger={<><Plus className="size-4" aria-hidden /> Individual charge</>} size="sm" title="Add an individual charge" description="For fees outside the fee structure (e.g. a lost book). Billed to the student's current enrollment." action={fin.createCharge}>
      {student ? <input type="hidden" name="student_id" value={student.id} /> : <RecordPicker name="student_id" label="Student" entity="students" required />}
      {student && <p className="text-sm">Student: <span className="font-medium">{student.label}</span></p>}
      <Field as="select" name="fee_type_id" label="Fee type" required options={feeTypes} />
      <Field name="description" label="Description" required maxLength={200} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="amount" label="Amount" required inputMode="decimal" />
        <Field name="due_date" label="Due date" type="date" />
      </div>
    </FormDialog>
  )
}

export function ChargeAdminActions({ chargeId, discountTypes, cancellable }: { chargeId: string; discountTypes: Opt[]; cancellable: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {discountTypes.length > 0 && (
        <FormDialog trigger="Apply discount" variant="secondary" size="sm" title="Apply a discount" description="Recorded separately; the original charge amount never changes." action={fin.applyDiscount.bind(null, chargeId)}>
          <Field as="select" name="discount_type_id" label="Discount" required options={discountTypes} />
          {reasonField()}
        </FormDialog>
      )}
      <FormDialog trigger="Adjust" variant="secondary" size="sm" title="Financial adjustment" description="Penalties and debits increase what is owed; waivers, discounts and credits decrease it." action={fin.createAdjustment.bind(null, chargeId)}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field as="select" name="adjustment_type" label="Type" options={[
            { value: "penalty", label: "Penalty (+)" }, { value: "debit", label: "Debit (+)" }, { value: "waiver", label: "Waiver (−)" },
            { value: "discount", label: "Discount (−)" }, { value: "credit", label: "Credit (−)" }, { value: "correction", label: "Correction (±)" },
          ]} />
          <Field name="amount" label="Amount" required inputMode="decimal" />
        </div>
        <Field as="select" name="direction" label="Correction direction" hint="Only for corrections." options={[{ value: "", label: "—" }, { value: "increase", label: "Increase the charge" }, { value: "decrease", label: "Decrease the charge" }]} />
        {reasonField()}
      </FormDialog>
      {cancellable && (
        <FormDialog trigger="Cancel charge" variant="ghost" size="sm" title="Cancel this charge?" description="Only charges with no payments applied can be cancelled. The charge stays in the history." action={fin.cancelCharge.bind(null, chargeId)} submitLabel="Cancel charge">
          {reasonField()}
        </FormDialog>
      )}
    </div>
  )
}

export function RevokeDiscountButton({ discountId }: { discountId: string }) {
  return (
    <FormDialog trigger="Revoke" variant="ghost" size="sm" title="Revoke discount" description="The discount stays in the history as revoked." action={fin.revokeDiscount.bind(null, discountId)} submitLabel="Revoke">
      {reasonField()}
    </FormDialog>
  )
}

// --- Payments -----------------------------------------------------------------------
export function ReversePaymentButton({ paymentId }: { paymentId: string }) {
  return (
    <FormDialog trigger="Reverse payment" variant="secondary" size="sm" title="Reverse this payment?" description="Use when a payment was recorded in error. The payment and its receipt are kept and marked reversed/void; the charges become payable again." action={fin.reversePayment.bind(null, paymentId)} submitLabel="Reverse">
      {reasonField("Reason for reversal")}
    </FormDialog>
  )
}

export function RequestRefundButton({ paymentId, max, currency }: { paymentId: string; max: number; currency: string }) {
  return (
    <FormDialog trigger="Request refund" variant="secondary" size="sm" title="Request a refund" description={`Only unapplied credit can be refunded (up to ${formatMoney(max, currency)}). A refund must be approved before money is returned.`} action={fin.requestRefund.bind(null, paymentId)}>
      <Field name="amount" label="Amount" required inputMode="decimal" defaultValue={max.toFixed(2)} />
      {reasonField()}
    </FormDialog>
  )
}

export function ApplyCreditButton({ paymentId, charges, max, currency }: { paymentId: string; charges: { id: string; label: string; remaining: number }[]; max: number; currency: string }) {
  if (charges.length === 0) return null
  return (
    <FormDialog trigger="Apply credit" size="sm" title="Apply credit to a charge" description={`Available credit on this payment: ${formatMoney(max, currency)}.`} action={fin.applyCredit.bind(null, paymentId)}>
      <Field as="select" name="charge_id" label="Charge" required options={charges.map((c) => ({ value: c.id, label: `${c.label} — owes ${formatMoney(c.remaining, currency)}` }))} />
      <Field name="amount" label="Amount" required inputMode="decimal" defaultValue={Math.min(max, charges[0].remaining).toFixed(2)} />
    </FormDialog>
  )
}

export function ReleaseAllocationButton({ allocationId }: { allocationId: string }) {
  return (
    <FormDialog trigger="Release" variant="ghost" size="sm" title="Release this allocation?" description="The money stays with the payment as credit and can be applied to another charge or refunded." action={fin.releaseAllocation.bind(null, allocationId)} submitLabel="Release">
      {reasonField()}
    </FormDialog>
  )
}

// --- Refunds ------------------------------------------------------------------------
export function RefundActions({ refundId, status, canManage }: { refundId: string; status: string; canManage: boolean }) {
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {status === "requested" && canManage && (
        <>
          <FormDialog trigger="Approve" size="sm" title="Approve refund" description="A different person than the requester must approve (unless the school turned this off)." action={fin.decideRefund.bind(null, refundId, true)} submitLabel="Approve">
            <Field as="textarea" name="note" label="Note (optional)" maxLength={500} />
          </FormDialog>
          <FormDialog trigger="Reject" variant="ghost" size="sm" title="Reject refund" action={fin.decideRefund.bind(null, refundId, false)} submitLabel="Reject">
            <Field as="textarea" name="note" label="Note (optional)" maxLength={500} />
          </FormDialog>
        </>
      )}
      {status === "approved" && canManage && (
        <FormDialog trigger="Mark paid out" size="sm" title="Record the refund payout" description="Record how the money was returned to the family." action={fin.processRefund.bind(null, refundId)} submitLabel="Record payout">
          <Field as="select" name="refund_method" label="Method" options={PAYMENT_METHODS.filter((m) => m !== "card").map((m) => ({ value: m, label: METHOD_LABELS[m] }))} />
          <Field name="refund_reference" label="Reference" maxLength={100} />
        </FormDialog>
      )}
      {(status === "requested" || status === "approved") && (
        <FormDialog trigger="Cancel" variant="ghost" size="sm" title="Cancel refund request" action={fin.cancelRefund.bind(null, refundId)} submitLabel="Cancel request">
          {reasonField()}
        </FormDialog>
      )}
    </div>
  )
}

export function PrintButton() {
  return <Button variant="secondary" size="sm" onClick={() => window.print()}>Print</Button>
}
