import "server-only"
import { cache } from "react"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { can, type Permission } from "@/lib/auth/permissions"
import type { UserContext } from "@/types/domain"

/** The verified user id from the JWT, or null. getClaims() validates the token; never trust getSession() on the server. */
export const getUserId = cache(async (): Promise<string | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return data?.claims?.sub ?? null
})

/**
 * The signed-in user's profile, school, role and features, or null when signed
 * out (or signed in without a profile). One RPC (get_my_context) so web and
 * Flutter share the same contract. Cached per request.
 */
export const getUserContext = cache(async (): Promise<UserContext | null> => {
  if (!(await getUserId())) return null
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_my_context")
  if (error) {
    console.error("[getUserContext]", error.code, error.message)
    throw new Error("Unable to load your account. Please try again.")
  }
  return (data as UserContext | null) ?? null
})

/** Signed in (any status). Redirects to login otherwise. */
export async function requireUser(): Promise<UserContext> {
  const ctx = await getUserContext()
  if (!ctx) redirect((await getUserId()) ? "/account-status" : "/login")
  return ctx
}

/** Signed in, active profile, and (for school users) an active school. */
export async function requireActiveUser(): Promise<UserContext> {
  const ctx = await requireUser()
  if (!ctx.access_active) redirect("/account-status")
  return ctx
}

/** Active user holding `permission`. Others are sent to their dashboard. */
export async function requirePermission(permission: Permission): Promise<UserContext> {
  const ctx = await requireActiveUser()
  if (!can(ctx.profile.role, permission)) redirect("/dashboard?denied=1")
  return ctx
}

/** For Server Actions: returns the context if allowed, otherwise null (never redirects). */
export async function authorize(permission: Permission): Promise<UserContext | null> {
  const ctx = await getUserContext()
  if (!ctx?.access_active || !can(ctx.profile.role, permission)) return null
  return ctx
}

/** School admin page guard: returns the context plus the admin's school id (from the session). */
export async function requireSchoolAdmin(): Promise<UserContext & { schoolId: string }> {
  const ctx = await requirePermission("school.records.manage")
  if (!ctx.profile.school_id) redirect("/dashboard?denied=1")
  return { ...ctx, schoolId: ctx.profile.school_id }
}

/**
 * Page guard for academic work: a school admin, or a teacher linked to a
 * teacher record. Returns the teacher id from the session (never from input).
 */
export async function requireAcademicActor(feature?: string) {
  const ctx = await requireActiveUser()
  const teacherId = ctx.record?.type === "teacher" ? ctx.record.id : null
  const isAdmin = ctx.profile.role === "school_admin"
  if (!ctx.profile.school_id || (!isAdmin && !(ctx.profile.role === "teacher" && teacherId))) redirect("/dashboard?denied=1")
  if (feature && !ctx.features.includes(feature)) redirect("/dashboard?denied=1")
  return { ...ctx, schoolId: ctx.profile.school_id, teacherId, isAdmin }
}

/** Page guard that also requires a school feature to be enabled. */
export async function requireFeatureFor(permission: Permission, feature: string) {
  const ctx = await requirePermission(permission)
  if (!ctx.features.includes(feature)) redirect("/dashboard?denied=1")
  return ctx
}
