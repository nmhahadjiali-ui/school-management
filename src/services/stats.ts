import "server-only"
import { createClient } from "@/lib/supabase/server"

/** null = could not be computed (shown as "—"). */
export type SchoolStats = {
  students: number | null
  teachers: number | null
  parents: number | null
  classes: number | null
}

/**
 * Dashboard statistics for one school, from the Phase 2 records (Phase 1
 * counted login accounts as a placeholder). With a current academic year,
 * students = open enrollments in that year and classes = its active sections.
 */
export async function getSchoolStats(schoolId: string, currentYearId: string | null): Promise<SchoolStats> {
  const supabase = await createClient()
  const head = { count: "exact", head: true } as const
  const count = async (query: PromiseLike<{ count: number | null; error: { code?: string; message?: string } | null }>) => {
    const { count, error } = await query
    if (error) console.error("[getSchoolStats]", error.code, error.message)
    return error ? null : (count ?? 0)
  }

  const [students, teachers, parents, classes] = await Promise.all([
    currentYearId
      ? count(supabase.from("student_enrollments").select("id", head).eq("school_id", schoolId).eq("academic_year_id", currentYearId).eq("enrollment_status", "enrolled"))
      : count(supabase.from("students").select("id", head).eq("school_id", schoolId).eq("status", "active")),
    count(supabase.from("teachers").select("id", head).eq("school_id", schoolId).eq("status", "active")),
    count(supabase.from("guardians").select("id", head).eq("school_id", schoolId).eq("status", "active")),
    currentYearId
      ? count(supabase.from("sections").select("id", head).eq("school_id", schoolId).eq("academic_year_id", currentYearId).eq("status", "active"))
      : Promise.resolve(null),
  ])
  return { students, teachers, parents, classes }
}
