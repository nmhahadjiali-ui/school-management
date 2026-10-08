import "server-only"
import { createClient } from "@/lib/supabase/server"
import type { TablesUpdate } from "@/types/database"

export async function getSchoolSettings(schoolId: string) {
  const supabase = await createClient()
  return supabase.from("school_settings").select("*").eq("school_id", schoolId).maybeSingle()
}

export async function updateSchoolSettings(schoolId: string, input: TablesUpdate<"school_settings">) {
  const supabase = await createClient()
  return supabase.from("school_settings").update(input).eq("school_id", schoolId).select("id").single()
}
