import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { authorize, getUserContext, requireActiveUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import type { UserContext } from "@/types/domain"

/**
 * Finance access levels (decided by the database, see private.finance_level):
 *   admin — finance admin, or school admin with "full" finance access
 *   staff — finance staff: record payments, receipts, refund requests
 *   view  — school admin with "view" finance access
 *   none  — everyone else (teachers never have finance access)
 * The UI uses this to decide what to offer; every RPC and RLS policy checks again.
 */
export type FinanceLevel = "admin" | "staff" | "view" | "none"
const RANK: Record<FinanceLevel, number> = { none: 0, view: 1, staff: 2, admin: 3 }

/** From get_my_context() (already loaded for the page), so it costs no extra query. */
export const myFinanceLevel = cache(async (): Promise<FinanceLevel> => (await getUserContext())?.finance_level ?? "none")

export const atLeast = (level: FinanceLevel, min: Exclude<FinanceLevel, "none">) => RANK[level] >= RANK[min]

export type FinanceContext = UserContext & { schoolId: string; level: FinanceLevel; currency: string }

async function load(ctx: UserContext | null, min: Exclude<FinanceLevel, "none">): Promise<FinanceContext | null> {
  if (!ctx?.access_active || !ctx.profile.school_id || !ctx.features.includes("billing")) return null
  const level = await myFinanceLevel()
  if (!atLeast(level, min)) return null
  return { ...ctx, schoolId: ctx.profile.school_id, level, currency: await schoolCurrency(ctx.profile.school_id) }
}

/** Page guard for the finance area. */
export async function requireFinance(min: Exclude<FinanceLevel, "none"> = "view", feature?: string): Promise<FinanceContext> {
  const ctx = await load(await requireActiveUser(), min)
  if (!ctx || (feature && !ctx.features.includes(feature))) redirect("/dashboard?denied=1")
  return ctx
}

/** Server Action guard (never redirects). */
export async function financeActor(min: Exclude<FinanceLevel, "none">, feature?: string): Promise<FinanceContext | null> {
  const ctx = await load((await authorize("finance.access")) ?? null, min)
  return ctx && (!feature || ctx.features.includes(feature)) ? ctx : null
}

/** Student / parent finance pages. */
export async function requireFamilyFinance(): Promise<UserContext & { schoolId: string; currency: string }> {
  const ctx = await requireActiveUser()
  const ok = ["student", "parent"].includes(ctx.profile.role) && ctx.features.includes("billing") && ctx.features.includes("student_finance")
  if (!ok || !ctx.profile.school_id) redirect("/dashboard?denied=1")
  return { ...ctx, schoolId: ctx.profile.school_id, currency: await schoolCurrency(ctx.profile.school_id) }
}

/** Same as above for actions. */
export async function familyActor() {
  const ctx = await getUserContext()
  if (!ctx?.access_active || !ctx.profile.school_id || !["student", "parent"].includes(ctx.profile.role)) return null
  if (!ctx.features.includes("billing") || !ctx.features.includes("student_finance")) return null
  return { ...ctx, schoolId: ctx.profile.school_id }
}

export const schoolCurrency = cache(async (schoolId: string): Promise<string> => {
  const ctx = await getUserContext()
  if (ctx?.profile.school_id === schoolId && ctx.settings?.currency) return ctx.settings.currency.trim()
  const supabase = await createClient()
  const { data } = await supabase.from("school_settings").select("currency").eq("school_id", schoolId).maybeSingle()
  return data?.currency?.trim() || "PHP"
})
