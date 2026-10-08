import "server-only"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { AppRole, Profile, ProfileStatus } from "@/types/domain"

// Data access for user profiles. Reads/updates run as the signed-in user so
// RLS limits school admins to their own school.

export type ProfileWithSchool = Profile & { school: { name: string; code: string } | null }

export async function listUsers(filter: { schoolId?: string; role?: AppRole; status?: ProfileStatus } = {}) {
  const supabase = await createClient()
  let query = supabase
    .from("profiles")
    .select("*, school:schools(name, code)")
    .order("created_at", { ascending: false })
    .limit(500)
  if (filter.schoolId) query = query.eq("school_id", filter.schoolId)
  if (filter.role) query = query.eq("role", filter.role)
  if (filter.status) query = query.eq("status", filter.status)
  const { data, error } = await query
  return { data: (data ?? []) as ProfileWithSchool[], error }
}

export async function getProfile(id: string) {
  const supabase = await createClient()
  return supabase.from("profiles").select("*").eq("id", id).maybeSingle()
}

export async function updateMember(id: string, input: { role?: AppRole; status: ProfileStatus }) {
  const supabase = await createClient()
  return supabase.from("profiles").update(input).eq("id", id).select("id").single()
}

export async function updateOwnProfile(
  userId: string,
  input: Pick<Profile, "first_name" | "last_name" | "phone" | "avatar_url">
) {
  const supabase = await createClient()
  return supabase.from("profiles").update(input).eq("user_id", userId).select("id").single()
}

/**
 * Creates an Auth user whose profile is provisioned by the on_auth_user_created
 * trigger from app_metadata (which end users cannot set).
 *
 * Uses the service-role key. The CALLER MUST have authorized the request and
 * validated that `schoolId`/`role` are within the caller's authority.
 */
export async function provisionUser(input: {
  email: string
  password: string
  first_name: string
  last_name: string
  role: Exclude<AppRole, "super_admin">
  schoolId: string
}) {
  const admin = createAdminClient()
  return admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { first_name: input.first_name, last_name: input.last_name },
    app_metadata: {
      provision_role: input.role,
      provision_school_id: input.schoolId,
      provision_status: "active",
    },
  })
}
