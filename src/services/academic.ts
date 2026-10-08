import "server-only"
import { createClient } from "@/lib/supabase/server"
import { likePattern, orIlike, pageRange, type ListParams, type Page } from "@/lib/list-params"
import type { TablesInsert, TablesUpdate } from "@/types/database"
import type { AcademicYear, EnrollmentStatus, GradeLevel, RecordStatus, Subject } from "@/types/domain"

// Data access for the academic structure. Every query runs as the signed-in
// user (RLS applies). `schoolId` always comes from the session, never the client.
// Embeds name their foreign key (!fkey) because several tables are linked by
// more than one path (e.g. sections <-> teachers via adviser AND assignments).

const COUNT = { count: "exact" } as const

// --- Academic years ------------------------------------------------------------
export async function listAcademicYears(schoolId: string) {
  const supabase = await createClient()
  return supabase.from("academic_years").select("*").eq("school_id", schoolId).order("start_date", { ascending: false })
}

export async function createAcademicYear(row: TablesInsert<"academic_years">) {
  const supabase = await createClient()
  return supabase.from("academic_years").insert(row).select("id").single()
}

export async function updateAcademicYear(id: string, row: TablesUpdate<"academic_years">) {
  const supabase = await createClient()
  return supabase.from("academic_years").update(row).eq("id", id).select("id").single()
}

export async function setCurrentAcademicYear(id: string) {
  const supabase = await createClient()
  return supabase.rpc("set_current_academic_year", { p_year_id: id })
}

export async function archiveAcademicYear(id: string) {
  const supabase = await createClient()
  return supabase.rpc("archive_academic_year", { p_year_id: id })
}

// --- Grade levels ----------------------------------------------------------------
export async function listGradeLevels(schoolId: string, opts: { status?: RecordStatus } = {}) {
  const supabase = await createClient()
  let query = supabase.from("grade_levels").select("*").eq("school_id", schoolId)
  if (opts.status) query = query.eq("status", opts.status)
  return query.order("sort_order").order("name")
}

export async function createGradeLevel(row: TablesInsert<"grade_levels">) {
  const supabase = await createClient()
  return supabase.from("grade_levels").insert(row).select("id").single()
}

export async function updateGradeLevel(id: string, row: TablesUpdate<"grade_levels">) {
  const supabase = await createClient()
  return supabase.from("grade_levels").update(row).eq("id", id).select("id").single()
}

// --- Subjects ------------------------------------------------------------------------
export const SUBJECT_SORTS = ["name", "code", "created_at"] as const

export async function listSubjects(schoolId: string, p: ListParams<(typeof SUBJECT_SORTS)[number]>): Promise<Page<Subject> & { error: unknown }> {
  const supabase = await createClient()
  let query = supabase.from("subjects").select("*", COUNT).eq("school_id", schoolId)
  if (p.q) query = query.or(orIlike(["name", "code"], p.q))
  if (p.filters.status) query = query.eq("status", p.filters.status as RecordStatus)
  const { data, count, error } = await query.order(p.sort, { ascending: p.dir === "asc" }).range(...pageRange(p))
  return { rows: data ?? [], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

export async function listActiveSubjects(schoolId: string) {
  const supabase = await createClient()
  return supabase.from("subjects").select("id, name, code").eq("school_id", schoolId).eq("status", "active").order("name")
}

export async function createSubject(row: TablesInsert<"subjects">) {
  const supabase = await createClient()
  return supabase.from("subjects").insert(row).select("id").single()
}

export async function updateSubject(id: string, row: TablesUpdate<"subjects">) {
  const supabase = await createClient()
  return supabase.from("subjects").update(row).eq("id", id).select("id").single()
}

// --- Sections ----------------------------------------------------------------------------
const SECTION_SELECT = `*,
  grade_level:grade_levels!sections_grade_level_fkey(id, name, sort_order),
  academic_year:academic_years!sections_year_fkey(id, name, status),
  adviser:teachers!sections_adviser_fkey(id, first_name, last_name)` as const

export const SECTION_SORTS = ["name", "grade", "created_at"] as const

export async function listSections(schoolId: string, p: ListParams<(typeof SECTION_SORTS)[number]>) {
  const supabase = await createClient()
  let query = supabase.from("sections").select(SECTION_SELECT, COUNT).eq("school_id", schoolId)
  if (p.filters.year) query = query.eq("academic_year_id", p.filters.year)
  if (p.filters.grade) query = query.eq("grade_level_id", p.filters.grade)
  if (p.filters.status) query = query.eq("status", p.filters.status as RecordStatus)
  if (p.q) query = query.or(orIlike(["name", "code", "room"], p.q))
  const asc = { ascending: p.dir === "asc" }
  query = p.sort === "grade"
    ? query.order("grade_level(sort_order)", asc).order("name")
    : query.order(p.sort, asc)
  const { data, count, error } = await query.range(...pageRange(p))
  const rows = data ?? []
  const enrolled = await enrolledCounts(rows.map((r) => r.id))
  return {
    rows: rows.map((r) => ({ ...r, enrolled: enrolled.get(r.id) ?? 0 })),
    total: count ?? 0,
    page: p.page,
    pageSize: p.pageSize,
    error,
  }
}

/** Open-enrollment counts for a page of sections (one query). */
async function enrolledCounts(sectionIds: string[]) {
  const counts = new Map<string, number>()
  if (sectionIds.length === 0) return counts
  const supabase = await createClient()
  const { data } = await supabase
    .from("student_enrollments")
    .select("section_id")
    .in("section_id", sectionIds)
    .eq("enrollment_status", "enrolled")
  for (const r of data ?? []) if (r.section_id) counts.set(r.section_id, (counts.get(r.section_id) ?? 0) + 1)
  return counts
}

/** Sections for selects (enrollment / assignment forms). */
export async function listSectionOptions(schoolId: string, academicYearId: string) {
  const supabase = await createClient()
  return supabase
    .from("sections")
    .select("id, name, grade_level_id, grade_level:grade_levels!sections_grade_level_fkey(name, sort_order)")
    .eq("school_id", schoolId)
    .eq("academic_year_id", academicYearId)
    .eq("status", "active")
    .order("grade_level(sort_order)")
    .order("name")
}

export async function getSection(id: string) {
  const supabase = await createClient()
  return supabase.from("sections").select(SECTION_SELECT).eq("id", id).maybeSingle()
}

export async function createSection(row: TablesInsert<"sections">) {
  const supabase = await createClient()
  return supabase.from("sections").insert(row).select("id").single()
}

export async function updateSection(id: string, row: TablesUpdate<"sections">) {
  const supabase = await createClient()
  return supabase.from("sections").update(row).eq("id", id).select("id").single()
}

/** Students currently enrolled in a section. */
export async function sectionRoster(sectionId: string) {
  const supabase = await createClient()
  return supabase
    .from("student_enrollments")
    .select("id, enrollment_date, student:students!student_enrollments_student_fkey(id, student_number, first_name, last_name, gender, status)")
    .eq("section_id", sectionId)
    .eq("enrollment_status", "enrolled")
    .order("student(last_name)")
    .order("student(first_name)")
}

export async function sectionAssignments(sectionId: string) {
  const supabase = await createClient()
  return supabase
    .from("teacher_subject_assignments")
    .select("id, teacher:teachers!tsa_teacher_fkey(id, first_name, last_name), subject:subjects!tsa_subject_fkey(id, name, code)")
    .eq("section_id", sectionId)
    .order("subject(name)")
}

// --- Enrollments -----------------------------------------------------------------------------
const ENROLLMENT_SELECT = `*,
  student:students!student_enrollments_student_fkey!inner(id, student_number, first_name, last_name),
  academic_year:academic_years!student_enrollments_year_fkey(id, name, status, start_date),
  grade_level:grade_levels!student_enrollments_grade_level_fkey(id, name, sort_order),
  section:sections!student_enrollments_section_fkey(id, name)` as const

export const ENROLLMENT_SORTS = ["student", "grade", "enrollment_date"] as const

export async function listEnrollments(schoolId: string, p: ListParams<(typeof ENROLLMENT_SORTS)[number]>) {
  const supabase = await createClient()
  let query = supabase.from("student_enrollments").select(ENROLLMENT_SELECT, COUNT).eq("school_id", schoolId)
  if (p.filters.year) query = query.eq("academic_year_id", p.filters.year)
  if (p.filters.grade) query = query.eq("grade_level_id", p.filters.grade)
  if (p.filters.section === "none") query = query.is("section_id", null)
  else if (p.filters.section) query = query.eq("section_id", p.filters.section)
  if (p.filters.status) query = query.eq("enrollment_status", p.filters.status as EnrollmentStatus)
  if (p.q) query = query.ilike("student.search_text", likePattern(p.q))
  const asc = { ascending: p.dir === "asc" }
  if (p.sort === "student") query = query.order("student(last_name)", asc).order("student(first_name)", asc)
  else if (p.sort === "grade") query = query.order("grade_level(sort_order)", asc)
  else query = query.order("enrollment_date", asc)
  const { data, count, error } = await query.range(...pageRange(p))
  return { rows: data ?? [], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

/** A student's full enrollment history, newest first. */
export async function studentEnrollments(studentId: string) {
  const supabase = await createClient()
  return supabase
    .from("student_enrollments")
    .select(ENROLLMENT_SELECT)
    .eq("student_id", studentId)
    .order("enrollment_date", { ascending: false })
    .order("created_at", { ascending: false })
}

export async function getEnrollment(id: string) {
  const supabase = await createClient()
  return supabase.from("student_enrollments").select("*").eq("id", id).maybeSingle()
}

export async function createEnrollment(row: TablesInsert<"student_enrollments">) {
  const supabase = await createClient()
  return supabase.from("student_enrollments").insert(row).select("id").single()
}

export async function updateEnrollment(id: string, row: TablesUpdate<"student_enrollments">) {
  const supabase = await createClient()
  return supabase.from("student_enrollments").update(row).eq("id", id).select("id").single()
}

export async function transferEnrollment(id: string, gradeLevelId: string, sectionId: string | null, effectiveDate: string) {
  const supabase = await createClient()
  return supabase.rpc("transfer_enrollment", {
    p_enrollment_id: id,
    p_grade_level_id: gradeLevelId,
    // The RPC accepts NULL for "no section yet".
    p_section_id: sectionId as string,
    p_effective_date: effectiveDate,
  })
}

// --- Teacher assignments ------------------------------------------------------------------------
const ASSIGNMENT_SELECT = `*,
  teacher:teachers!tsa_teacher_fkey(id, first_name, last_name),
  subject:subjects!tsa_subject_fkey(id, name, code),
  section:sections!tsa_section_fkey(id, name, grade_level:grade_levels!sections_grade_level_fkey(name, sort_order)),
  academic_year:academic_years!tsa_year_fkey(id, name, status, start_date)` as const

export const ASSIGNMENT_SORTS = ["teacher", "subject", "created_at"] as const

export async function listAssignments(schoolId: string, p: ListParams<(typeof ASSIGNMENT_SORTS)[number]>) {
  const supabase = await createClient()
  let query = supabase.from("teacher_subject_assignments").select(ASSIGNMENT_SELECT, COUNT).eq("school_id", schoolId)
  if (p.filters.year) query = query.eq("academic_year_id", p.filters.year)
  if (p.filters.teacher) query = query.eq("teacher_id", p.filters.teacher)
  if (p.filters.subject) query = query.eq("subject_id", p.filters.subject)
  if (p.filters.section) query = query.eq("section_id", p.filters.section)
  const asc = { ascending: p.dir === "asc" }
  if (p.sort === "teacher") query = query.order("teacher(last_name)", asc).order("teacher(first_name)", asc)
  else if (p.sort === "subject") query = query.order("subject(name)", asc)
  else query = query.order("created_at", asc)
  const { data, count, error } = await query.range(...pageRange(p))
  return { rows: data ?? [], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

/** All of a teacher's assignments (all years), newest year first. */
export async function teacherAssignments(teacherId: string) {
  const supabase = await createClient()
  return supabase
    .from("teacher_subject_assignments")
    .select(ASSIGNMENT_SELECT)
    .eq("teacher_id", teacherId)
    .order("academic_year(start_date)", { ascending: false })
}

export async function createAssignment(row: TablesInsert<"teacher_subject_assignments">) {
  const supabase = await createClient()
  return supabase.from("teacher_subject_assignments").insert(row).select("id").single()
}

export async function deleteAssignment(id: string) {
  const supabase = await createClient()
  return supabase.from("teacher_subject_assignments").delete().eq("id", id).select("id").single()
}

// --- Small helpers for forms ------------------------------------------------------------------------
export type YearOption = Pick<AcademicYear, "id" | "name" | "status" | "is_current">
export type GradeOption = Pick<GradeLevel, "id" | "name">

/** Resolve a year filter: explicit uuid, else the current year, else the newest. */
export function pickYear(years: YearOption[], requested?: string) {
  return years.find((y) => y.id === requested) ?? years.find((y) => y.is_current) ?? years[0] ?? null
}

/** Open enrollments in `yearId` for a page of students (one query), keyed by student id. */
export async function currentPlacements(studentIds: string[], yearId: string | null) {
  const map = new Map<string, { grade: string; section: string | null; sectionId: string | null }>()
  if (!yearId || studentIds.length === 0) return map
  const supabase = await createClient()
  const { data } = await supabase
    .from("student_enrollments")
    .select("student_id, grade_level:grade_levels!student_enrollments_grade_level_fkey(name), section:sections!student_enrollments_section_fkey(id, name)")
    .in("student_id", studentIds)
    .eq("academic_year_id", yearId)
    .eq("enrollment_status", "enrolled")
  for (const r of data ?? []) {
    map.set(r.student_id, { grade: r.grade_level.name, section: r.section?.name ?? null, sectionId: r.section?.id ?? null })
  }
  return map
}

/** Sections the signed-in teacher advises or teaches in for a year (RLS-scoped). */
export async function myTeachingSections(teacherId: string, yearId: string) {
  const supabase = await createClient()
  const [sections, assignments] = await Promise.all([
    supabase
      .from("sections")
      .select("id, name, room, adviser_teacher_id, grade_level:grade_levels!sections_grade_level_fkey(name, sort_order)")
      .eq("academic_year_id", yearId)
      .order("grade_level(sort_order)")
      .order("name"),
    supabase
      .from("teacher_subject_assignments")
      .select("section_id, subject:subjects!tsa_subject_fkey(name)")
      .eq("teacher_id", teacherId)
      .eq("academic_year_id", yearId),
  ])
  const subjects = new Map<string, string[]>()
  for (const a of assignments.data ?? []) subjects.set(a.section_id, [...(subjects.get(a.section_id) ?? []), a.subject.name])
  const rows = (sections.data ?? []).map((s) => ({
    ...s,
    isAdviser: s.adviser_teacher_id === teacherId,
    subjects: subjects.get(s.id) ?? [],
  }))
  const counts = await enrolledCounts(rows.map((r) => r.id))
  return { data: rows.map((r) => ({ ...r, enrolled: counts.get(r.id) ?? 0 })), error: sections.error ?? assignments.error }
}
