import "server-only"
import { createClient } from "@/lib/supabase/server"
import { likePattern, pageRange, type ListParams, type Page } from "@/lib/list-params"
import type { TablesInsert, TablesUpdate } from "@/types/database"
import type { AppRole, Guardian, RecordStatus, Student, StudentStatus, Teacher, TeacherStatus } from "@/types/domain"

// Data access for people records (students, teachers, guardians) and their
// relationships. RLS decides visibility: admins see their school, teachers see
// their sections' students, parents see their children, everyone sees self.

const COUNT = { count: "exact" } as const
type Result<T> = Page<T> & { error: unknown }

// --- Students --------------------------------------------------------------------
export const STUDENT_SORTS = ["last_name", "student_number", "created_at"] as const

/**
 * Students of a school. `grade`/`section` filter by the student's OPEN
 * enrollment in `year` (an inner join, applied only when filtering).
 */
export async function listStudents(
  schoolId: string,
  p: ListParams<(typeof STUDENT_SORTS)[number]>,
  year?: string
): Promise<Result<Student>> {
  const supabase = await createClient()
  const byPlacement = Boolean(year && (p.filters.grade || p.filters.section))
  let query = supabase
    .from("students")
    // The inner join is only added when filtering by placement (otherwise
    // students without enrollments would be hidden). Cast: the typed parser
    // cannot follow a conditional select string.
    .select((byPlacement ? "*, placement:student_enrollments!student_enrollments_student_fkey!inner(id)" : "*") as "*", COUNT)
    .eq("school_id", schoolId)
  if (byPlacement) {
    query = query.eq("placement.academic_year_id", year!).eq("placement.enrollment_status", "enrolled")
    if (p.filters.grade) query = query.eq("placement.grade_level_id", p.filters.grade)
    if (p.filters.section) query = query.eq("placement.section_id", p.filters.section)
  }
  if (p.filters.status) query = query.eq("status", p.filters.status as StudentStatus)
  if (p.q) query = query.ilike("search_text", likePattern(p.q))
  const asc = { ascending: p.dir === "asc" }
  query = p.sort === "last_name" ? query.order("last_name", asc).order("first_name", asc) : query.order(p.sort, asc)
  const { data, count, error } = await query.range(...pageRange(p))
  return { rows: data ?? [], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

export async function getStudent(id: string) {
  const supabase = await createClient()
  return supabase.from("students").select("*").eq("id", id).maybeSingle()
}

export async function createStudent(row: TablesInsert<"students">) {
  const supabase = await createClient()
  return supabase.from("students").insert(row).select("id").single()
}

export async function updateStudent(id: string, row: TablesUpdate<"students">) {
  const supabase = await createClient()
  return supabase.from("students").update(row).eq("id", id).select("id").single()
}

/** Guardians of a student (with relationship details). */
export async function studentGuardians(studentId: string) {
  const supabase = await createClient()
  return supabase
    .from("student_guardians")
    .select("*, guardian:guardians!student_guardians_guardian_fkey(id, first_name, last_name, email, phone, status)")
    .eq("student_id", studentId)
    .order("is_primary", { ascending: false })
    .order("created_at")
}

// --- Teachers --------------------------------------------------------------------
export const TEACHER_SORTS = ["last_name", "employee_number", "created_at"] as const

export async function listTeachers(schoolId: string, p: ListParams<(typeof TEACHER_SORTS)[number]>): Promise<Result<Teacher>> {
  const supabase = await createClient()
  let query = supabase.from("teachers").select("*", COUNT).eq("school_id", schoolId)
  if (p.filters.status) query = query.eq("status", p.filters.status as TeacherStatus)
  if (p.q) query = query.ilike("search_text", likePattern(p.q))
  const asc = { ascending: p.dir === "asc" }
  query = p.sort === "last_name" ? query.order("last_name", asc).order("first_name", asc) : query.order(p.sort, asc, )
  const { data, count, error } = await query.range(...pageRange(p))
  return { rows: data ?? [], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

export async function listActiveTeachers(schoolId: string) {
  const supabase = await createClient()
  return supabase
    .from("teachers")
    .select("id, first_name, last_name")
    .eq("school_id", schoolId)
    .eq("status", "active")
    .order("last_name")
    .order("first_name")
    .limit(1000)
}

export async function getTeacher(id: string) {
  const supabase = await createClient()
  return supabase.from("teachers").select("*").eq("id", id).maybeSingle()
}

export async function createTeacher(row: TablesInsert<"teachers">) {
  const supabase = await createClient()
  return supabase.from("teachers").insert(row).select("id").single()
}

export async function updateTeacher(id: string, row: TablesUpdate<"teachers">) {
  const supabase = await createClient()
  return supabase.from("teachers").update(row).eq("id", id).select("id").single()
}

/** Sections a teacher advises (all years, newest first). */
export async function teacherAdvisory(teacherId: string) {
  const supabase = await createClient()
  return supabase
    .from("sections")
    .select("id, name, status, grade_level:grade_levels!sections_grade_level_fkey(name), academic_year:academic_years!sections_year_fkey(id, name, start_date, is_current)")
    .eq("adviser_teacher_id", teacherId)
    .order("academic_year(start_date)", { ascending: false })
}

// --- Guardians -------------------------------------------------------------------
export const GUARDIAN_SORTS = ["last_name", "created_at"] as const

export async function listGuardians(schoolId: string, p: ListParams<(typeof GUARDIAN_SORTS)[number]>): Promise<Result<Guardian>> {
  const supabase = await createClient()
  let query = supabase.from("guardians").select("*", COUNT).eq("school_id", schoolId)
  if (p.filters.status) query = query.eq("status", p.filters.status as RecordStatus)
  if (p.q) query = query.ilike("search_text", likePattern(p.q))
  const asc = { ascending: p.dir === "asc" }
  query = p.sort === "last_name" ? query.order("last_name", asc).order("first_name", asc) : query.order(p.sort, asc)
  const { data, count, error } = await query.range(...pageRange(p))
  return { rows: data ?? [], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

export async function getGuardian(id: string) {
  const supabase = await createClient()
  return supabase.from("guardians").select("*").eq("id", id).maybeSingle()
}

export async function createGuardian(row: TablesInsert<"guardians">) {
  const supabase = await createClient()
  return supabase.from("guardians").insert(row).select("id").single()
}

export async function updateGuardian(id: string, row: TablesUpdate<"guardians">) {
  const supabase = await createClient()
  return supabase.from("guardians").update(row).eq("id", id).select("id").single()
}

/** Children of a guardian, each with their open enrollments. */
export async function guardianChildren(guardianId: string) {
  const supabase = await createClient()
  return supabase
    .from("student_guardians")
    .select(`*, student:students!student_guardians_student_fkey(id, student_number, first_name, last_name, status,
      enrollments:student_enrollments!student_enrollments_student_fkey(id, enrollment_status,
        academic_year:academic_years!student_enrollments_year_fkey(name, is_current),
        grade_level:grade_levels!student_enrollments_grade_level_fkey(name),
        section:sections!student_enrollments_section_fkey(id, name)))`)
    .eq("guardian_id", guardianId)
    .eq("student.enrollments.enrollment_status", "enrolled")
    .order("created_at")
}

// --- Student <-> guardian links ------------------------------------------------------
export async function getGuardianLink(id: string) {
  const supabase = await createClient()
  return supabase.from("student_guardians").select("*").eq("id", id).maybeSingle()
}

export async function createGuardianLink(row: TablesInsert<"student_guardians">) {
  const supabase = await createClient()
  return supabase.from("student_guardians").insert(row).select("id").single()
}

export async function updateGuardianLink(id: string, row: TablesUpdate<"student_guardians">) {
  const supabase = await createClient()
  return supabase.from("student_guardians").update(row).eq("id", id).select("id").single()
}

/** Clears the student's current primary guardian (before marking another). */
export async function clearPrimaryGuardian(studentId: string, exceptLinkId?: string) {
  const supabase = await createClient()
  let query = supabase.from("student_guardians").update({ is_primary: false }).eq("student_id", studentId).eq("is_primary", true)
  if (exceptLinkId) query = query.neq("id", exceptLinkId)
  return query
}

export async function deleteGuardianLink(id: string) {
  const supabase = await createClient()
  return supabase.from("student_guardians").delete().eq("id", id).select("id").single()
}

// --- Login accounts linked to records ------------------------------------------------
export type RecordType = "teacher" | "student" | "guardian"
export const RECORD_TABLE = { teacher: "teachers", student: "students", guardian: "guardians" } as const
export const RECORD_ROLE: Record<RecordType, AppRole> = { teacher: "teacher", student: "student", guardian: "parent" }

/** Accounts of the right role in this school that are not yet linked to any record. */
export async function linkableAccounts(schoolId: string, type: RecordType) {
  const supabase = await createClient()
  const [profiles, linked] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, email, first_name, last_name, status")
      .eq("school_id", schoolId)
      .eq("role", RECORD_ROLE[type])
      .order("last_name")
      .limit(500),
    supabase.from(RECORD_TABLE[type]).select("user_id").eq("school_id", schoolId).not("user_id", "is", null),
  ])
  const taken = new Set((linked.data ?? []).map((r) => r.user_id))
  return { data: (profiles.data ?? []).filter((p) => !taken.has(p.user_id)), error: profiles.error ?? linked.error }
}

/** The login account linked to a record, if any. */
export async function linkedAccount(userId: string | null) {
  if (!userId) return { data: null, error: null }
  const supabase = await createClient()
  return supabase.from("profiles").select("id, email, status, role").eq("user_id", userId).maybeSingle()
}

export async function setRecordAccount(type: RecordType, id: string, userId: string | null) {
  const supabase = await createClient()
  return supabase.from(RECORD_TABLE[type]).update({ user_id: userId }).eq("id", id).select("id").single()
}
