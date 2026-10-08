import "server-only"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { RECORD_ROLE, type RecordType } from "@/services/people"
import type { Invitation } from "@/types/domain"

/** Must not exceed Supabase Auth's email link lifetime (auth.email.otp_expiry). */
export const INVITATION_TTL_HOURS = 24

export type InvitationState = "pending" | "accepted" | "revoked" | "expired"

export function invitationState(inv: Pick<Invitation, "accepted_at" | "revoked_at" | "expires_at">): InvitationState {
  if (inv.accepted_at) return "accepted"
  if (inv.revoked_at) return "revoked"
  return new Date(inv.expires_at) < new Date() ? "expired" : "pending"
}

const RECORD_COLUMN = { teacher: "teacher_id", student: "student_id", guardian: "guardian_id" } as const

export async function listRecordInvitations(type: RecordType, recordId: string) {
  const supabase = await createClient()
  return supabase
    .from("invitations")
    .select("*")
    .eq(RECORD_COLUMN[type], recordId)
    .order("created_at", { ascending: false })
    .limit(10)
}

/**
 * Invite someone to create a login for an existing school record.
 *
 * 1. Supabase Auth creates the user and emails a one-time, expiring link
 *    (custom template -> /auth/confirm?token_hash=…&type=invite).
 * 2. app_metadata (service-role only) tells the provisioning trigger to create
 *    the profile AND link the record, atomically, in the same transaction.
 * 3. The invitation row records who/when/expiry (no secret is stored).
 * Any failure after step 1 deletes the half-created auth user.
 *
 * CALLER MUST have authorized the request and loaded `record` through RLS
 * (which proves it belongs to the caller's school).
 */
export async function inviteForRecord(input: {
  type: RecordType
  record: { id: string; school_id: string; email: string; first_name: string; last_name: string }
  invitedBy: string
  siteUrl: string
}) {
  const admin = createAdminClient()
  const { type, record } = input

  const { data, error } = await admin.auth.admin.inviteUserByEmail(record.email, {
    data: { first_name: record.first_name, last_name: record.last_name },
    redirectTo: `${input.siteUrl}/auth/confirm?next=/accept-invite`,
  })
  if (error || !data.user) return { error: error ?? { message: "invite failed" } }
  const userId = data.user.id

  const { error: linkError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: {
      provision_role: RECORD_ROLE[type],
      provision_school_id: record.school_id,
      provision_status: "active",
      provision_record_type: type,
      provision_record_id: record.id,
    },
  })
  if (linkError) {
    await admin.auth.admin.deleteUser(userId)
    return { error: linkError }
  }

  // Recorded as the inviting admin (RLS: must manage this school).
  const supabase = await createClient()
  const { error: rowError } = await supabase.from("invitations").insert({
    school_id: record.school_id,
    email: record.email,
    role: RECORD_ROLE[type],
    teacher_id: type === "teacher" ? record.id : null,
    student_id: type === "student" ? record.id : null,
    guardian_id: type === "guardian" ? record.id : null,
    user_id: userId,
    invited_by: input.invitedBy,
    expires_at: new Date(Date.now() + INVITATION_TTL_HOURS * 3600_000).toISOString(),
  })
  if (rowError) {
    await admin.auth.admin.deleteUser(userId) // also unlinks the record (ON DELETE SET NULL)
    return { error: rowError }
  }
  return { error: null }
}

/**
 * Revoke an open invitation. If the invited account has never signed in, it is
 * deleted (which unlinks the record), so the link in the email stops working.
 */
export async function revokeInvitation(invitation: Pick<Invitation, "id" | "user_id">) {
  const supabase = await createClient()
  const { error } = await supabase
    .from("invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", invitation.id)
    .is("accepted_at", null)
    .select("id")
    .single()
  if (error) return { error }

  if (invitation.user_id) {
    const admin = createAdminClient()
    const { data } = await admin.auth.admin.getUserById(invitation.user_id)
    if (data.user && !data.user.last_sign_in_at) {
      const { error: delError } = await admin.auth.admin.deleteUser(invitation.user_id)
      if (delError) return { error: delError }
    }
  }
  return { error: null }
}

export async function getInvitation(id: string) {
  const supabase = await createClient()
  return supabase.from("invitations").select("*").eq("id", id).maybeSingle()
}
