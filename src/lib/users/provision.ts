import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"
import { can, isSchoolMemberRole } from "@/lib/auth/permissions"
import { denied, fail, invalid, type ActionResult } from "@/lib/action-result"
import { provisionUserSchema, uuidSchema } from "@/lib/validations"
import * as users from "@/services/users"
import type { UserContext } from "@/types/domain"

/**
 * Create an account in a school, for an already-authenticated caller.
 * Shared by the web Server Action and the mobile endpoint so both apply the
 * same rules:
 * - Super admin: any school, any provisionable role.
 * - School admin: only their own school, roles teacher/student/parent.
 * `supabase` acts AS THE CALLER (RLS), and decides whether the school is visible.
 * The account itself is created with the service key, so these checks are mandatory.
 */
export async function provisionUserAs(
  ctx: UserContext | null,
  supabase: SupabaseClient,
  schoolId: string,
  input: Record<string, unknown>
): Promise<ActionResult> {
  if (!uuidSchema.safeParse(schoolId).success) return denied()
  if (!ctx?.access_active || !(can(ctx.profile.role, "platform.schools.manage") || can(ctx.profile.role, "school.users.manage"))) return denied()

  const parsed = provisionUserSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)

  if (ctx.profile.role === "super_admin") {
    // Confirm the school exists and is visible to this super admin.
    const { data: school } = await supabase.from("schools").select("id").eq("id", schoolId).maybeSingle()
    if (!school) return { ok: false, error: "The school was not found." }
  } else {
    if (ctx.profile.school_id !== schoolId) return denied()
    if (!isSchoolMemberRole(parsed.data.role)) {
      return { ok: false, error: "School admins can only add teachers, students and parents." }
    }
  }

  const { error } = await users.provisionUser({ ...parsed.data, schoolId })
  if (error) {
    if (error.code === "email_exists" || error.status === 422) {
      return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: { email: ["An account with this email already exists"] } }
    }
    if (error.code === "weak_password") {
      return { ok: false, error: "Please choose a stronger password.", fieldErrors: { password: [error.message] } }
    }
    return fail(error, "provisionUser")
  }
  return { ok: true, message: "Account created. Share the temporary password securely; the user can change it after signing in." }
}
