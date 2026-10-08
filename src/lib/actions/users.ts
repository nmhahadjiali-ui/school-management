"use server"

import { revalidatePath } from "next/cache"
import { authorize } from "@/lib/auth/session"
import { isSchoolMemberRole } from "@/lib/auth/permissions"
import { denied, fail, formToObject, invalid, type ActionResult } from "@/lib/action-result"
import { provisionUserSchema, updateMemberSchema, uuidSchema } from "@/lib/validations"
import * as users from "@/services/users"
import { getSchool } from "@/services/schools"

/**
 * Create an account in a school.
 * - Super admin: any school, roles school_admin/teacher/student/parent.
 * - School admin: only their own school, roles teacher/student/parent.
 * Uses the service key, so authorization here is mandatory.
 */
export async function provisionUser(schoolId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!uuidSchema.safeParse(schoolId).success) return denied()
  const ctx = (await authorize("platform.schools.manage")) ?? (await authorize("school.users.manage"))
  if (!ctx) return denied()

  const parsed = provisionUserSchema.safeParse(formToObject(formData))
  if (!parsed.success) return invalid(parsed.error)

  if (ctx.profile.role === "super_admin") {
    // Confirm the school exists and is visible to this super admin.
    const { data: school } = await getSchool(schoolId)
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
  revalidatePath("/users")
  revalidatePath("/platform", "layout")
  return { ok: true, message: "Account created. Share the temporary password securely; the user can change it after signing in." }
}

/** School admin (own school) or super admin: change a member's role/status. */
export async function updateMember(profileId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!uuidSchema.safeParse(profileId).success) return denied()
  const ctx = (await authorize("school.users.manage")) ?? (await authorize("platform.users.view"))
  if (!ctx) return denied()

  const parsed = updateMemberSchema.safeParse(formToObject(formData))
  if (!parsed.success) return invalid(parsed.error)

  // RLS hides other schools' profiles; the guard trigger blocks admin-role changes.
  const { error } = await users.updateMember(profileId, parsed.data)
  if (error) {
    if (error.code === "PGRST116") return { ok: false, error: "The user was not found or you cannot manage them." }
    return fail(error, "updateMember")
  }
  revalidatePath("/users")
  revalidatePath("/platform/users")
  return { ok: true, message: "User updated." }
}
