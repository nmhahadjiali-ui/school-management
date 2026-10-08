import "server-only"
import { createClient } from "@/lib/supabase/server"
import type { TablesInsert, TablesUpdate } from "@/types/database"
import type { School, SchoolStatus } from "@/types/domain"

// Data access for schools. Runs as the signed-in user: RLS decides which
// schools are visible (super admin: all; school members: their own).

export type SchoolWithUserCount = School & { user_count: number }

export async function listSchools() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("schools")
    .select("*, profiles(count)")
    .order("created_at", { ascending: false })
  const schools: SchoolWithUserCount[] = (data ?? []).map(({ profiles, ...s }) => ({
    ...s,
    user_count: profiles?.[0]?.count ?? 0,
  }))
  return { data: schools, error }
}

export async function getSchool(id: string) {
  const supabase = await createClient()
  return supabase.from("schools").select("*").eq("id", id).maybeSingle()
}

export async function createSchool(input: TablesInsert<"schools">) {
  const supabase = await createClient()
  return supabase.from("schools").insert(input).select("id").single()
}

export async function updateSchool(id: string, input: TablesUpdate<"schools">) {
  const supabase = await createClient()
  // .select() makes a silently-filtered (RLS) update observable as "not found".
  return supabase.from("schools").update(input).eq("id", id).select("id").single()
}

export async function setSchoolStatus(id: string, status: SchoolStatus) {
  return updateSchool(id, { status })
}

export async function getPlatformStats() {
  const supabase = await createClient()
  const count = { count: "exact", head: true } as const
  const [all, active, inactive, users] = await Promise.all([
    supabase.from("schools").select("id", count),
    supabase.from("schools").select("id", count).eq("status", "active"),
    supabase.from("schools").select("id", count).eq("status", "inactive"),
    supabase.from("profiles").select("id", count),
  ])
  const error = all.error ?? active.error ?? inactive.error ?? users.error
  return {
    data: {
      totalSchools: all.count ?? 0,
      activeSchools: active.count ?? 0,
      inactiveSchools: inactive.count ?? 0,
      totalUsers: users.count ?? 0,
    },
    error,
  }
}
