import "server-only"
import { createClient } from "@/lib/supabase/server"
import { likePattern, pageRange, type ListParams, type Page } from "@/lib/list-params"
import type { Enums, Tables } from "@/types/database"

// Data access for fees, charges, payments, refunds and receipts. Reads go
// through RLS (finance users of the school; students/parents for their own
// records). Every money movement is a database function — see lib/actions/finance.

const COUNT = { count: "exact" } as const
type Result<T> = Page<T> & { error: unknown }

export type ChargeBalance = Tables<"student_charge_balances">
export type LedgerEntry = Tables<"student_ledger">
export type PaymentRow = Tables<"payments">
export type StudentRef = { id: string; first_name: string; last_name: string; student_number: string }

// --- Lookups ------------------------------------------------------------------------
export async function studentsById(ids: string[]): Promise<Map<string, StudentRef>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return new Map()
  const supabase = await createClient()
  const { data } = await supabase.from("students").select("id, first_name, last_name, student_number").in("id", unique)
  return new Map((data ?? []).map((s) => [s.id, s]))
}

/** Names of the staff behind financial records (names only; see finance_actor_names). */
export async function actorNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => !!v))]
  if (unique.length === 0) return new Map()
  const supabase = await createClient()
  const { data } = await supabase.rpc("finance_actor_names", { p_user_ids: unique })
  return new Map((data ?? []).map((r) => [r.user_id, r.name ?? "Staff member"]))
}

export async function getStudentRef(id: string) {
  const supabase = await createClient()
  return supabase.from("students").select("id, school_id, first_name, last_name, student_number, status").eq("id", id).maybeSingle()
}

// --- Configuration ------------------------------------------------------------------
export async function listFeeTypes(schoolId: string, activeOnly = false) {
  const supabase = await createClient()
  let q = supabase.from("fee_types").select("*").eq("school_id", schoolId)
  if (activeOnly) q = q.eq("status", "active")
  return q.order("name")
}

export async function listDiscountTypes(schoolId: string, activeOnly = false) {
  const supabase = await createClient()
  let q = supabase.from("discount_types").select("*").eq("school_id", schoolId)
  if (activeOnly) q = q.eq("status", "active")
  return q.order("name")
}

export async function listFeeStructures(schoolId: string, yearId?: string) {
  const supabase = await createClient()
  let q = supabase
    .from("fee_structures")
    .select("*, academic_year:academic_years(name), grade_level:grade_levels(name), section:sections(name), items:fee_structure_items(amount, installments)")
    .eq("school_id", schoolId)
  if (yearId) q = q.eq("academic_year_id", yearId)
  return q.order("name")
}

export async function getFeeStructure(id: string) {
  const supabase = await createClient()
  return supabase
    .from("fee_structures")
    .select("*, academic_year:academic_years(name), grade_level:grade_levels(name), section:sections(name)")
    .eq("id", id)
    .maybeSingle()
}

export async function listStructureItems(structureId: string) {
  const supabase = await createClient()
  return supabase
    .from("fee_structure_items")
    .select("*, fee_type:fee_types(name, code)")
    .eq("fee_structure_id", structureId)
    .order("sequence")
    .order("name")
}

/** Charges already generated from a structure's items (to lock editing). */
export async function structureChargeCount(itemIds: string[]) {
  if (itemIds.length === 0) return 0
  const supabase = await createClient()
  const { count } = await supabase.from("student_charges").select("id", { count: "exact", head: true }).in("fee_structure_item_id", itemIds)
  return count ?? 0
}

export async function financeSettings(schoolId: string) {
  const supabase = await createClient()
  return supabase
    .from("school_settings")
    .select("currency, receipt_prefix, admin_finance_access, refunds_require_second_approver")
    .eq("school_id", schoolId)
    .single()
}

// --- Charges ------------------------------------------------------------------------
export const CHARGE_SORTS = ["due_date", "created_at", "amount", "remaining"] as const
export const CHARGE_STATUSES = ["pending", "partially_paid", "paid", "overdue", "cancelled"] as const

export async function listCharges(
  schoolId: string,
  p: ListParams<(typeof CHARGE_SORTS)[number]>,
  opts: { studentIds?: string[] } = {}
): Promise<Result<ChargeBalance>> {
  const supabase = await createClient()
  let q = supabase.from("student_charge_balances").select("*", COUNT).eq("school_id", schoolId)
  if (p.filters.status) q = q.eq("effective_status", p.filters.status as Enums<"charge_status">)
  if (p.filters.year) q = q.eq("academic_year_id", p.filters.year)
  if (p.filters.fee_type) q = q.eq("fee_type_id", p.filters.fee_type)
  if (p.filters.student) q = q.eq("student_id", p.filters.student)
  if (opts.studentIds) q = q.in("student_id", opts.studentIds)
  if (p.q) q = q.ilike("description", likePattern(p.q))
  q = q.order(p.sort, { ascending: p.dir === "asc", nullsFirst: false }).order("id")
  const { data, count, error } = await q.range(...pageRange(p))
  return { rows: data ?? [], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

/** Students matching a search (for the charge / payment lists' name search). */
export async function searchStudentIds(schoolId: string, q: string) {
  const supabase = await createClient()
  const { data } = await supabase.from("students").select("id").eq("school_id", schoolId).ilike("search_text", likePattern(q)).limit(200)
  return (data ?? []).map((s) => s.id)
}

export async function getCharge(id: string) {
  const supabase = await createClient()
  return supabase.from("student_charge_balances").select("*").eq("id", id).maybeSingle()
}

export async function getChargeRecord(id: string) {
  const supabase = await createClient()
  return supabase.from("student_charges").select("*, fee_type:fee_types(name, code)").eq("id", id).maybeSingle()
}

export async function chargeHistory(chargeId: string) {
  const supabase = await createClient()
  const [discounts, adjustments, allocations] = await Promise.all([
    supabase.from("student_discounts").select("*, discount_type:discount_types(name, code)").eq("student_charge_id", chargeId).order("created_at"),
    supabase.from("financial_adjustments").select("*").eq("student_charge_id", chargeId).order("created_at"),
    supabase.from("payment_allocations").select("*, payment:payments(payment_date, payment_method, status, receipts(receipt_number))").eq("student_charge_id", chargeId).order("created_at"),
  ])
  return { discounts: discounts.data ?? [], adjustments: adjustments.data ?? [], allocations: allocations.data ?? [] }
}

/** Charges a student still owes, oldest due first (payment entry / online payment). */
export async function openCharges(studentId: string) {
  const supabase = await createClient()
  return supabase
    .from("student_charge_balances")
    .select("*")
    .eq("student_id", studentId)
    .neq("effective_status", "cancelled")
    .gt("remaining", 0)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at")
}

export async function studentBalances(studentId: string) {
  const supabase = await createClient()
  return supabase.from("student_charge_balances").select("*").eq("student_id", studentId).order("due_date", { ascending: true, nullsFirst: false }).order("created_at")
}

export async function studentCredits(studentId: string) {
  const supabase = await createClient()
  return supabase.from("student_payment_credits").select("*").eq("student_id", studentId).gt("unallocated", 0).order("payment_date")
}

export async function studentLedger(studentId: string) {
  const supabase = await createClient()
  return supabase.from("student_ledger").select("*").eq("student_id", studentId).order("occurred_at").order("entry_type")
}

// --- Payments -----------------------------------------------------------------------
export const PAYMENT_SORTS = ["payment_date", "amount", "created_at"] as const

export async function listPayments(
  schoolId: string,
  p: ListParams<(typeof PAYMENT_SORTS)[number]>,
  opts: { studentIds?: string[] } = {}
) {
  const supabase = await createClient()
  let q = supabase.from("payments").select("*, receipts(id, receipt_number, status)", COUNT).eq("school_id", schoolId)
  if (p.filters.status) q = q.eq("status", p.filters.status as Enums<"payment_status">)
  if (p.filters.method) q = q.eq("payment_method", p.filters.method as Enums<"payment_method">)
  if (p.filters.from) q = q.gte("payment_date", p.filters.from)
  if (p.filters.to) q = q.lte("payment_date", p.filters.to)
  if (p.filters.student) q = q.eq("student_id", p.filters.student)
  if (opts.studentIds) q = q.in("student_id", opts.studentIds)
  q = q.order(p.sort, { ascending: p.dir === "asc" }).order("created_at", { ascending: false })
  const { data, count, error } = await q.range(...pageRange(p))
  return { rows: data ?? [], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

export async function getPayment(id: string) {
  const supabase = await createClient()
  return supabase.from("payments").select("*, receipts(*), transaction:payment_transactions(provider, provider_transaction_id)").eq("id", id).maybeSingle()
}

export async function paymentDetails(paymentId: string) {
  const supabase = await createClient()
  const [allocations, refunds, credit] = await Promise.all([
    supabase.from("payment_allocations").select("*, charge:student_charges(description, due_date, amount)").eq("payment_id", paymentId).order("created_at"),
    supabase.from("refunds").select("*").eq("payment_id", paymentId).order("created_at"),
    supabase.from("student_payment_credits").select("unallocated").eq("payment_id", paymentId).maybeSingle(),
  ])
  return { allocations: allocations.data ?? [], refunds: refunds.data ?? [], unallocated: credit.data?.unallocated ?? 0 }
}

export async function studentPayments(studentId: string) {
  const supabase = await createClient()
  return supabase.from("payments").select("*, receipts(id, receipt_number, status)").eq("student_id", studentId).order("payment_date", { ascending: false }).order("created_at", { ascending: false })
}

// --- Receipts -----------------------------------------------------------------------
export async function getReceipt(id: string) {
  const supabase = await createClient()
  return supabase.from("receipts").select("*, payment:payments(*)").eq("id", id).maybeSingle()
}

export async function listReceipts(schoolId: string, p: ListParams<"issued_at" | "receipt_number">) {
  const supabase = await createClient()
  let q = supabase.from("receipts").select("*, payment:payments(student_id, amount, currency, payment_method, payment_date)", COUNT).eq("school_id", schoolId)
  if (p.q) q = q.ilike("receipt_number", likePattern(p.q))
  if (p.filters.status) q = q.eq("status", p.filters.status as Enums<"receipt_status">)
  q = q.order(p.sort, { ascending: p.dir === "asc" })
  const { data, count, error } = await q.range(...pageRange(p))
  return { rows: data ?? [], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

// --- Refunds ------------------------------------------------------------------------
export async function listRefunds(schoolId: string, status?: string) {
  const supabase = await createClient()
  let q = supabase.from("refunds").select("*, payment:payments(payment_date, amount, receipts(receipt_number))").eq("school_id", schoolId)
  if (status) q = q.eq("status", status as Enums<"refund_status">)
  return q.order("created_at", { ascending: false }).limit(200)
}

// --- Reporting ----------------------------------------------------------------------
export type FinanceOverview = {
  currency?: string
  /** Net of discounts and adjustments. */
  total_charges: number
  total_collected: number
  outstanding: number
  overdue: number
  payments_in_range: number
  today: number
  this_month: number
  credits: number
  by_method: Record<string, number>
  by_fee_type: { fee_type_id: string; charged: number; collected: number; outstanding: number }[]
}

export async function financeOverview(
  schoolId: string,
  f: { year?: string; grade?: string; section?: string; feeType?: string; method?: string; from?: string; to?: string }
) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("finance_overview", {
    p_school_id: schoolId,
    p_academic_year_id: f.year,
    p_grade_level_id: f.grade,
    p_section_id: f.section,
    p_fee_type_id: f.feeType,
    p_method: f.method as Enums<"payment_method"> | undefined,
    p_from: f.from,
    p_to: f.to,
  })
  return { data: data as FinanceOverview | null, error }
}

export async function recentPayments(schoolId: string, limit = 8) {
  const supabase = await createClient()
  return supabase.from("payments").select("*, receipts(id, receipt_number, status)").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(limit)
}

export async function pendingRefundCount(schoolId: string) {
  const supabase = await createClient()
  const { count } = await supabase.from("refunds").select("id", { count: "exact", head: true }).eq("school_id", schoolId).in("status", ["requested", "approved"])
  return count ?? 0
}

export async function auditLog(schoolId: string, p: ListParams<"created_at">) {
  const supabase = await createClient()
  let q = supabase.from("financial_audit_logs").select("*", COUNT).eq("school_id", schoolId)
  if (p.filters.action) q = q.ilike("action", likePattern(p.filters.action))
  if (p.filters.student) q = q.eq("student_id", p.filters.student)
  const { data, count, error } = await q.order("created_at", { ascending: false }).range(...pageRange(p))
  return { rows: data ?? [], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

// --- Online payments ----------------------------------------------------------------
export async function getTransaction(id: string) {
  const supabase = await createClient()
  return supabase.from("payment_transactions").select("*").eq("id", id).maybeSingle()
}
