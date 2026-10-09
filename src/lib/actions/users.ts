"use server"

import { revalidatePath } from "next/cache"
import { authorize, getUserContext } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { provisionUserAs } from "@/lib/users/provision"
import { denied, fail, formToObject, invalid, type ActionResult } from "@/lib/action-result"
import { updateMemberSchema, uuidSchema } from "@/lib/validations"
import * as users from "@/services/users"

/**
 * Create an account in a school.
 * - Super admin: any school, roles school_admin/teacher/student/parent.
 * - School admin: only their own school, roles teacher/student/parent.
 * Uses the service key, so authorization here is mandatory.
 */
export async function provisionUser(schoolId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const result = await provisionUserAs(await getUserContext(), await createClient(), schoolId, formToObject(formData))
  if (result.ok) {
    revalidatePath("/users")
    revalidatePath("/platform", "layout")
  }
  return result
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
