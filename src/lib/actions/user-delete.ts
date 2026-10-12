"use server"

import { revalidatePath } from "next/cache"
import { denied, fail, type ActionResult } from "@/lib/action-result"
import { confirmPassword } from "@/lib/auth/confirm-password"
import { getUserContext, getUserId } from "@/lib/auth/session"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { uuidSchema } from "@/lib/validations"

// Permanently delete a LOGIN ACCOUNT (not the school record behind it).
// Super admin only: any account except super admins (never their own).
// School admins deactivate accounts instead.
// History stays (attendance, grades, audit log...) with "who" left empty;
// student/teacher/guardian records stay, unlinked from the login. Accounts
// that handled money are refused so the finance trail keeps its names.

/** [table, column] pairs that record who handled money. */
const FINANCE_TRAIL: [string, string][] = [
  ["payments", "received_by"],
  ["payments", "reversed_by"],
  ["receipts", "issued_by"],
  ["refunds", "requested_by"],
  ["refunds", "approved_by"],
  ["refunds", "processed_by"],
  ["student_charges", "created_by"],
  ["student_charges", "cancelled_by"],
  ["financial_adjustments", "created_by"],
  ["student_discounts", "created_by"],
  ["financial_audit_logs", "actor_user_id"],
]

export async function deleteUserAccount(profileId: string, password: string): Promise<ActionResult> {
  if (!uuidSchema.safeParse(profileId).success) return denied()
  const ctx = await getUserContext()
  if (!ctx?.access_active || ctx.profile.role !== "super_admin") return denied()
  const myUserId = await getUserId()

  const unconfirmed = await confirmPassword(ctx.profile, password)
  if (unconfirmed) return unconfirmed

  const supabase = await createClient()
  const { data: target } = await supabase.from("profiles").select("id, user_id, email, role, school_id, first_name, last_name, avatar_path").eq("id", profileId).maybeSingle()
  if (!target) return { ok: false, error: "The account was not found or you cannot manage it." }
  if (target.user_id === myUserId) return { ok: false, error: "You cannot delete your own account." }
  if (target.role === "super_admin") return { ok: false, error: "Platform administrator accounts cannot be deleted here." }

  const admin = createAdminClient()
  const handledMoney = await Promise.all(
    FINANCE_TRAIL.map(async ([table, column]) => (await admin.from(table as "payments").select("id", { count: "exact", head: true }).eq(column as "id", target.user_id)).count ?? 0)
  )
  if (handledMoney.some((n) => n > 0)) {
    return { ok: false, error: "This account has handled payments, receipts, charges or refunds, so it is kept for the finance records. Deactivate it instead to block access." }
  }

  const name = `${target.first_name} ${target.last_name}`.trim() || target.email
  if (target.school_id) {
    const { error: auditError } = await admin.from("audit_logs").insert({
      school_id: target.school_id,
      actor_user_id: myUserId,
      action: "user.deleted",
      entity: "profile",
      entity_id: target.id,
      metadata: { email: target.email, role: target.role, name },
    })
    if (auditError) return fail(auditError, "deleteUserAccount.audit")
  }

  const { error } = await admin.auth.admin.deleteUser(target.user_id)
  if (error) return fail(error, "deleteUserAccount")
  if (target.avatar_path) await admin.storage.from("photos").remove([target.avatar_path]).catch(() => null)

  revalidatePath("/users")
  revalidatePath("/platform", "layout")
  return { ok: true, message: `The account of ${name} was deleted.` }
}
