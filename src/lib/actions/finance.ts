"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { denied, formToObject, invalid, type ActionResult } from "@/lib/action-result"
import { dbFail } from "@/lib/actions/helpers"
import { familyActor, financeActor, type FinanceContext, type FinanceLevel } from "@/lib/finance/access"
import { parseMoney } from "@/lib/money"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { defaultPaymentProvider, simulator } from "@/server/payments/providers"
import { handlePaymentWebhook } from "@/server/payments/webhooks"

// Finance Server Actions. Authorization happens three times: here (finance
// level from the database), in the database function (which re-derives the
// caller's school and role), and in RLS. The browser never supplies a school,
// a balance, a payment status or a receipt number; amounts are passed to
// PostgreSQL as decimal STRINGS and all arithmetic happens in numeric.

type DbError = { code?: string; message?: string } | null
type Min = Exclude<FinanceLevel, "none">

const id = z.uuid("Choose an item")
const money = (label = "Amount") =>
  z.string().transform((v, c) => {
    const m = parseMoney(v)
    if (!m || Number(m) <= 0) {
      c.addIssue({ code: "custom", message: `${label} must be a positive amount with at most 2 decimals` })
      return z.NEVER
    }
    return m
  })
const reason = z.string().trim().min(3, "Give a reason (at least 3 characters)").max(500)
const optionalText = (max: number) => z.preprocess((v) => (v === "" ? null : v), z.string().trim().max(max).nullable())
const optionalDate = z.preprocess((v) => (v === "" ? null : v), z.iso.date("Enter a valid date").nullable())
const valid = (...ids: string[]) => ids.every((v) => id.safeParse(v).success)
const badId = { ok: false as const, error: "The record was not found or you do not have access to it." }

/** authorize (finance level) -> validate -> run -> revalidate. */
async function finance<S extends z.ZodType>(
  min: Min,
  formData: FormData | Record<string, unknown> | null,
  schema: S,
  run: (data: z.infer<S>, ctx: FinanceContext) => Promise<{ error: DbError } | ActionResult>,
  opts: { context: string; success: string | ((data: z.infer<S>) => string); feature?: string; revalidate?: string[] }
): Promise<ActionResult> {
  const ctx = await financeActor(min, opts.feature)
  if (!ctx) return denied()
  const raw = formData instanceof FormData ? formToObject(formData) : (formData ?? {})
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return invalid(parsed.error)
  const result = await run(parsed.data, ctx)
  if ("ok" in result) {
    if (!result.ok) return result
  } else if (result.error) {
    return result.error.code === "PGRST116" ? badId : dbFail(result.error, opts.context)
  }
  for (const path of opts.revalidate ?? ["/finance"]) revalidatePath(path, "layout")
  return { ok: true, message: typeof opts.success === "function" ? opts.success(parsed.data) : opts.success }
}

// --- Configuration (finance admins) ---------------------------------------------------
const CATEGORIES = ["tuition", "registration", "miscellaneous", "laboratory", "library", "activity", "transportation", "uniform", "other"] as const
const feeTypeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/, "Use 1–20 letters, numbers, - or _"),
  category: z.enum(CATEGORIES, "Choose a category"),
  description: optionalText(500),
  status: z.enum(["active", "inactive"]).default("active"),
})

export async function saveFeeType(feeTypeId: string | null, _prev: ActionResult | null, fd: FormData) {
  if (feeTypeId && !valid(feeTypeId)) return badId
  return finance("admin", fd, feeTypeSchema, async (d, ctx) => {
    const supabase = await createClient()
    return feeTypeId
      ? supabase.from("fee_types").update(d).eq("id", feeTypeId).select("id").single()
      : supabase.from("fee_types").insert({ ...d, school_id: ctx.schoolId })
  }, { context: "saveFeeType", success: feeTypeId ? "Fee type updated." : "Fee type created." })
}

const discountTypeSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(100),
    code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,20}$/, "Use 1–20 letters, numbers, - or _"),
    calculation_type: z.enum(["fixed", "percentage"]),
    value: money("Value"),
    description: optionalText(500),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .refine((v) => v.calculation_type === "fixed" || Number(v.value) <= 100, { path: ["value"], message: "A percentage cannot exceed 100" })

export async function saveDiscountType(discountTypeId: string | null, _prev: ActionResult | null, fd: FormData) {
  if (discountTypeId && !valid(discountTypeId)) return badId
  return finance("admin", fd, discountTypeSchema, async (d, ctx) => {
    const supabase = await createClient()
    const row = { ...d, value: d.value as unknown as number }
    return discountTypeId
      ? supabase.from("discount_types").update(row).eq("id", discountTypeId).select("id").single()
      : supabase.from("discount_types").insert({ ...row, school_id: ctx.schoolId })
  }, { context: "saveDiscountType", success: discountTypeId ? "Discount type updated." : "Discount type created." })
}

const structureSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  academic_year_id: id,
  grade_level_id: z.preprocess((v) => (v === "" ? null : v), id.nullable()),
  section_id: z.preprocess((v) => (v === "" ? null : v), id.nullable()),
  description: optionalText(1000),
  status: z.enum(["active", "inactive"]).default("active"),
})

export async function saveFeeStructure(structureId: string | null, _prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (structureId && !valid(structureId)) return badId
  let newId: string | null = null
  const result = await finance("admin", fd, structureSchema, async (d, ctx) => {
    const supabase = await createClient()
    if (structureId) return supabase.from("fee_structures").update(d).eq("id", structureId).select("id").single()
    const { data, error } = await supabase.from("fee_structures").insert({ ...d, school_id: ctx.schoolId }).select("id").single()
    newId = data?.id ?? null
    return { error }
  }, { context: "saveFeeStructure", success: structureId ? "Fee structure updated." : "Fee structure created." })
  if (result.ok && newId) redirect(`/finance/fee-structures/${newId}`)
  return result
}

const itemSchema = z
  .object({
    fee_type_id: id,
    name: z.string().trim().min(1, "Name is required").max(150),
    amount: money(),
    frequency: z.enum(["one_time", "monthly", "quarterly", "semester", "annual", "custom"]),
    installments: z.coerce.number().int().min(1).max(24).default(1),
    due_date: optionalDate,
    sequence: z.coerce.number().int().min(1).max(100).default(1),
  })
  .refine((v) => ["monthly", "quarterly", "semester"].includes(v.frequency) || v.installments === 1, {
    path: ["installments"],
    message: "Only monthly, quarterly and semester fees can have installments",
  })

export async function saveStructureItem(structureId: string, itemId: string | null, _prev: ActionResult | null, fd: FormData) {
  if (!valid(structureId) || (itemId && !valid(itemId))) return badId
  return finance("admin", fd, itemSchema, async (d, ctx) => {
    const supabase = await createClient()
    const row = { ...d, amount: d.amount as unknown as number }
    if (itemId) return supabase.from("fee_structure_items").update(row).eq("id", itemId).eq("fee_structure_id", structureId).select("id").single()
    return supabase.from("fee_structure_items").insert({ ...row, fee_structure_id: structureId, school_id: ctx.schoolId })
  }, { context: "saveStructureItem", success: itemId ? "Fee item updated. Charges already generated are not changed." : "Fee item added." })
}

export async function deleteStructureItem(itemId: string): Promise<ActionResult> {
  if (!valid(itemId)) return badId
  return finance("admin", null, z.object({}), async () => {
    const supabase = await createClient()
    const { data, error } = await supabase.from("fee_structure_items").delete().eq("id", itemId).select("id")
    if (error) return { error }
    return data.length ? { ok: true } : { ok: false, error: "This fee item already generated charges, so it is kept for the record." }
  }, { context: "deleteStructureItem", success: "Fee item removed." })
}

type GenerateResult = { students: number; created: number; already_existed: number; skipped_students?: number }

/** Preview (dry run) or generate a structure's charges. Safe to repeat: existing charges are never duplicated. */
export async function generateCharges(structureId: string, dryRun: boolean): Promise<ActionResult & { preview?: GenerateResult }> {
  if (!valid(structureId)) return badId
  const ctx = await financeActor("admin")
  if (!ctx) return denied()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("generate_charges", { p_structure_id: structureId, p_dry_run: dryRun })
  if (error) return dbFail(error, "generateCharges")
  const r = data as GenerateResult
  if (dryRun) return { ok: true, preview: r }
  revalidatePath("/finance", "layout")
  return {
    ok: true,
    message: r.created ? `${r.created} charge${r.created === 1 ? "" : "s"} created for ${r.students} student${r.students === 1 ? "" : "s"}.` : "No new charges: every student already has these charges.",
  }
}

const settingsSchema = z.object({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter ISO currency code, e.g. PHP"),
  receipt_prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,10}$/, "Use 1–10 letters, numbers or -"),
  refunds_require_second_approver: z.preprocess((v) => v === "on", z.boolean()),
  admin_finance_access: z.enum(["full", "view", "none"]).optional(),
})

export async function saveFinanceSettings(_prev: ActionResult | null, fd: FormData) {
  return finance("admin", fd, settingsSchema, async (d, ctx) => {
    // Only the finance admin role (or the platform) may change school admins' access;
    // the database guard enforces the same rule.
    const { admin_finance_access, ...rest } = d
    const changes = ctx.profile.role === "finance_admin" && admin_finance_access ? { ...rest, admin_finance_access } : rest
    const supabase = await createClient()
    return supabase.from("school_settings").update(changes).eq("school_id", ctx.schoolId).select("school_id").single()
  }, { context: "saveFinanceSettings", success: "Finance settings saved." })
}

// --- Charges ------------------------------------------------------------------------
const chargeSchema = z.object({
  student_id: id,
  fee_type_id: id,
  description: z.string().trim().min(1, "Describe the charge").max(200),
  amount: money(),
  due_date: optionalDate,
})

export async function createCharge(_prev: ActionResult | null, fd: FormData) {
  return finance("admin", fd, chargeSchema, async (d) => {
    const supabase = await createClient()
    return supabase.rpc("create_charge", {
      p_student_id: d.student_id, p_fee_type_id: d.fee_type_id, p_description: d.description,
      p_amount: d.amount as unknown as number, p_due_date: d.due_date ?? undefined,
    })
  }, { context: "createCharge", success: "Charge added to the student's account." })
}

export async function cancelCharge(chargeId: string, _prev: ActionResult | null, fd: FormData) {
  if (!valid(chargeId)) return badId
  return finance("admin", fd, z.object({ reason }), async (d) => {
    const supabase = await createClient()
    return supabase.rpc("cancel_charge", { p_charge_id: chargeId, p_reason: d.reason })
  }, { context: "cancelCharge", success: "Charge cancelled. It stays in the history." })
}

export async function applyDiscount(chargeId: string, _prev: ActionResult | null, fd: FormData) {
  if (!valid(chargeId)) return badId
  return finance("admin", fd, z.object({ discount_type_id: id, reason }), async (d) => {
    const supabase = await createClient()
    return supabase.rpc("apply_discount", { p_charge_ids: [chargeId], p_discount_type_id: d.discount_type_id, p_reason: d.reason })
  }, { context: "applyDiscount", success: "Discount applied. The original charge is unchanged." })
}

export async function revokeDiscount(discountId: string, _prev: ActionResult | null, fd: FormData) {
  if (!valid(discountId)) return badId
  return finance("admin", fd, z.object({ reason }), async (d) => {
    const supabase = await createClient()
    return supabase.rpc("revoke_discount", { p_discount_id: discountId, p_reason: d.reason })
  }, { context: "revokeDiscount", success: "Discount revoked. It stays in the history." })
}

const adjustmentSchema = z
  .object({
    adjustment_type: z.enum(["discount", "waiver", "penalty", "credit", "debit", "correction"]),
    amount: money(),
    direction: z.enum(["increase", "decrease", ""]).default(""),
    reason,
  })
  .refine((v) => v.adjustment_type !== "correction" || v.direction !== "", { path: ["direction"], message: "Choose whether the correction increases or decreases the charge" })

export async function createAdjustment(chargeId: string, _prev: ActionResult | null, fd: FormData) {
  if (!valid(chargeId)) return badId
  return finance("admin", fd, adjustmentSchema, async (d) => {
    const supabase = await createClient()
    return supabase.rpc("create_adjustment", {
      p_charge_id: chargeId, p_type: d.adjustment_type, p_amount: d.amount as unknown as number, p_reason: d.reason,
      p_increase: d.adjustment_type === "correction" ? d.direction === "increase" : undefined,
    })
  }, { context: "createAdjustment", success: "Adjustment recorded." })
}

// --- Payments -----------------------------------------------------------------------
const paymentSchema = z.object({
  student_id: id,
  amount: money(),
  payment_method: z.enum(["cash", "bank_transfer", "check", "card", "e_wallet", "other"], "Choose how the money was received"),
  reference_number: optionalText(100),
  payment_date: z.iso.date("Enter the payment date"),
  notes: optionalText(1000),
  allocations: z.array(z.object({ charge_id: id, amount: money("Allocation") })).max(100),
  /** Generated once per form; a double submit returns the first payment. */
  idempotency_key: z.string().regex(/^[A-Za-z0-9-]{16,100}$/),
})

/** Record a received payment (cash, bank, check...). Online payments are recorded only by webhooks. */
export async function recordPayment(input: z.input<typeof paymentSchema>): Promise<ActionResult> {
  let paymentId: string | null = null
  const result = await finance("staff", input, paymentSchema, async (d) => {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("record_payment", {
      p_student_id: d.student_id, p_amount: d.amount as unknown as number, p_method: d.payment_method,
      p_reference: d.reference_number ?? "", p_payment_date: d.payment_date, p_notes: d.notes ?? "",
      p_allocations: d.allocations, p_idempotency_key: d.idempotency_key,
    })
    paymentId = (data as { payment_id?: string } | null)?.payment_id ?? null
    return { error }
  }, { context: "recordPayment", success: "Payment recorded and receipt issued." })
  if (result.ok && paymentId) redirect(`/finance/payments/${paymentId}?recorded=1`)
  return result
}

export async function applyCredit(paymentId: string, _prev: ActionResult | null, fd: FormData) {
  if (!valid(paymentId)) return badId
  return finance("staff", fd, z.object({ charge_id: id, amount: money() }), async (d) => {
    const supabase = await createClient()
    return supabase.rpc("apply_credit", { p_payment_id: paymentId, p_allocations: [{ charge_id: d.charge_id, amount: d.amount }] })
  }, { context: "applyCredit", success: "Credit applied to the charge." })
}

export async function releaseAllocation(allocationId: string, _prev: ActionResult | null, fd: FormData) {
  if (!valid(allocationId)) return badId
  return finance("admin", fd, z.object({ reason }), async (d) => {
    const supabase = await createClient()
    return supabase.rpc("release_allocation", { p_allocation_id: allocationId, p_reason: d.reason })
  }, { context: "releaseAllocation", success: "Allocation released; the money is back in the student's credit." })
}

export async function reversePayment(paymentId: string, _prev: ActionResult | null, fd: FormData) {
  if (!valid(paymentId)) return badId
  return finance("admin", fd, z.object({ reason }), async (d) => {
    const supabase = await createClient()
    return supabase.rpc("reverse_payment", { p_payment_id: paymentId, p_reason: d.reason })
  }, { context: "reversePayment", success: "Payment reversed and its receipt voided. Both stay in the history." })
}

// --- Refunds ------------------------------------------------------------------------
export async function requestRefund(paymentId: string, _prev: ActionResult | null, fd: FormData) {
  if (!valid(paymentId)) return badId
  return finance("staff", fd, z.object({ amount: money(), reason }), async (d) => {
    const supabase = await createClient()
    return supabase.rpc("request_refund", { p_payment_id: paymentId, p_amount: d.amount as unknown as number, p_reason: d.reason })
  }, { context: "requestRefund", success: "Refund requested. It needs approval before money is returned.", feature: "refunds" })
}

export async function decideRefund(refundId: string, approve: boolean, _prev: ActionResult | null, fd: FormData) {
  if (!valid(refundId)) return badId
  return finance("admin", fd, z.object({ note: optionalText(500) }), async (d) => {
    const supabase = await createClient()
    return supabase.rpc("decide_refund", { p_refund_id: refundId, p_approve: approve, p_note: d.note ?? undefined })
  }, { context: "decideRefund", success: approve ? "Refund approved." : "Refund rejected.", feature: "refunds" })
}

export async function processRefund(refundId: string, _prev: ActionResult | null, fd: FormData) {
  if (!valid(refundId)) return badId
  const schema = z.object({
    refund_method: z.enum(["cash", "bank_transfer", "check", "e_wallet", "other"], "Choose how the money was returned"),
    refund_reference: optionalText(100),
  })
  return finance("admin", fd, schema, async (d) => {
    const supabase = await createClient()
    return supabase.rpc("process_refund", { p_refund_id: refundId, p_method: d.refund_method, p_reference: d.refund_reference ?? "" })
  }, { context: "processRefund", success: "Refund marked as paid out.", feature: "refunds" })
}

export async function cancelRefund(refundId: string, _prev: ActionResult | null, fd: FormData) {
  if (!valid(refundId)) return badId
  return finance("staff", fd, z.object({ reason }), async (d) => {
    const supabase = await createClient()
    return supabase.rpc("cancel_refund", { p_refund_id: refundId, p_reason: d.reason })
  }, { context: "cancelRefund", success: "Refund request cancelled; the amount is credit again.", feature: "refunds" })
}

// --- Online payments (students / parents) ---------------------------------------------
const onlineSchema = z.object({ student_id: id, charge_ids: z.array(id).min(1, "Choose at least one charge").max(50) })

/**
 * Start an online payment. The DATABASE computes the amount from the selected
 * charges and checks the caller may pay for this student; the provider then
 * returns a checkout page. Nothing here can mark the payment successful.
 */
export async function startOnlinePayment(input: z.input<typeof onlineSchema>): Promise<ActionResult> {
  const ctx = await familyActor()
  if (!ctx || !ctx.features.includes("online_payments")) return denied()
  const parsed = onlineSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const provider = defaultPaymentProvider()
  if (!provider) return { ok: false, error: "Online payments are not available right now. Please pay at the school's cashier." }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("create_payment_intent", {
    p_student_id: parsed.data.student_id, p_charge_ids: parsed.data.charge_ids, p_provider: provider.name,
  })
  if (error || !data) return dbFail(error, "startOnlinePayment")
  const intent = data as { transaction_id: string; amount: number | string; currency: string }

  const created = await provider.createPayment({
    transactionId: intent.transaction_id,
    amount: Number(intent.amount).toFixed(2),
    currency: intent.currency,
    description: "School fees",
    returnUrl: `${(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/fees/payments/${intent.transaction_id}`,
  })
  if (!created.ok) {
    console.error(`[startOnlinePayment:${provider.name}]`, created.error)
    await createAdminClient().rpc("complete_payment_transaction", { p_transaction_id: intent.transaction_id, p_status: "failed", p_failure_reason: "Checkout could not be created" })
    return { ok: false, error: "The payment provider is not responding. Please try again later." }
  }
  // Provider-side reference: written with the service key (not an API-user privilege).
  const { error: linkError } = await createAdminClient().rpc("set_transaction_checkout", {
    p_transaction_id: intent.transaction_id, p_provider_transaction_id: created.providerTransactionId, p_checkout_url: created.checkoutUrl,
  })
  if (linkError) return dbFail(linkError, "startOnlinePayment.link")
  redirect(created.checkoutUrl)
}

/**
 * SIMULATOR ONLY: plays the external gateway. Delivers the chosen outcome as a
 * signed webhook through the same handler a real provider uses, so the
 * success path is verified exactly like production.
 */
export async function simulateCheckout(transactionId: string, outcome: "successful" | "failed" | "cancelled"): Promise<ActionResult> {
  const sim = simulator()
  if (!sim || !valid(transactionId) || !["successful", "failed", "cancelled"].includes(outcome)) return denied()
  const ctx = await familyActor()
  if (!ctx) return denied()
  // RLS: only the student / their parents (or finance) can see the transaction.
  const supabase = await createClient()
  const { data: tx } = await supabase.from("payment_transactions").select("id, amount, currency, status, provider, provider_transaction_id").eq("id", transactionId).maybeSingle()
  if (!tx || tx.provider !== "simulator") return badId
  if (tx.status === "pending") {
    const { body, headers } = sim.signedEvent({
      type: `payment.${outcome}`,
      transactionId: tx.id,
      providerTransactionId: tx.provider_transaction_id ?? "",
      outcome,
      amount: Number(tx.amount).toFixed(2),
      currency: tx.currency,
      failureReason: outcome === "failed" ? "Card declined (simulated)" : undefined,
    })
    const res = await handlePaymentWebhook("simulator", body, new Headers(headers))
    if (res.status !== 200) return { ok: false, error: "The simulated provider could not confirm the payment." }
  }
  redirect(`/fees/payments/${tx.id}`)
}
