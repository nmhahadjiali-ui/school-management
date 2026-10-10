import "server-only"
import { createClient } from "@/lib/supabase/server"
import { likePattern, pageRange, type ListParams } from "@/lib/list-params"
import type { TablesInsert, TablesUpdate } from "@/types/database"
import type { AttendanceStatus, GradeStatus } from "@/types/domain"

// Data access for Phase 3 (academic operations). Every query runs as the
// signed-in user; RLS decides visibility (teachers: their classes; students:
// themselves; parents: verified children). Embeds name their foreign key.

const COUNT = { count: "exact" } as const

/**
 * Students and parents cannot read the teachers table (contact/employment
 * data), so teacher embeds come back null for them. Fill in just the names via
 * visible_teacher_names(), which only returns teachers of the viewer's own (or
 * their children's) sections.
 */
async function fillTeacherNames<T extends { teacher_id: string; teacher: { id: string; first_name: string; last_name: string } | null }>(rows: T[]) {
  const missing = [...new Set(rows.filter((r) => !r.teacher).map((r) => r.teacher_id))]
  if (missing.length === 0) return rows
  const supabase = await createClient()
  const { data } = await supabase.rpc("visible_teacher_names", { p_ids: missing })
  const names = new Map((data ?? []).map((t) => [t.id, t]))
  return rows.map((r) => (r.teacher ? r : { ...r, teacher: names.get(r.teacher_id) ?? { id: r.teacher_id, first_name: "Teacher", last_name: "" } }))
}

// --- Grading periods & scales -------------------------------------------------------
export async function listGradingPeriods(schoolId: string, yearId: string) {
  const supabase = await createClient()
  return supabase.from("grading_periods").select("*").eq("school_id", schoolId).eq("academic_year_id", yearId).order("sequence")
}

export async function createGradingPeriod(row: TablesInsert<"grading_periods">) {
  const supabase = await createClient()
  return supabase.from("grading_periods").insert(row).select("id").single()
}

export async function updateGradingPeriod(id: string, row: TablesUpdate<"grading_periods">) {
  const supabase = await createClient()
  return supabase.from("grading_periods").update(row).eq("id", id).select("id").single()
}

export async function listGradingScales(schoolId: string) {
  const supabase = await createClient()
  return supabase.from("grading_scales").select("*").eq("school_id", schoolId).order("minimum_score", { ascending: false })
}

export async function createGradingScale(row: TablesInsert<"grading_scales">) {
  const supabase = await createClient()
  return supabase.from("grading_scales").insert(row).select("id").single()
}

export async function updateGradingScale(id: string, row: TablesUpdate<"grading_scales">) {
  const supabase = await createClient()
  return supabase.from("grading_scales").update(row).eq("id", id).select("id").single()
}

export async function deleteGradingScale(id: string) {
  const supabase = await createClient()
  return supabase.from("grading_scales").delete().eq("id", id).select("id").single()
}

/** Band for a score: the highest band whose minimum is <= score. */
export function scaleFor<T extends { minimum_score: number; name: string; equivalent: string | null; is_passing: boolean }>(scales: T[], score: number) {
  return [...scales].sort((a, b) => b.minimum_score - a.minimum_score).find((s) => score >= s.minimum_score) ?? null
}

// --- Teaching loads (Phase 2 teacher_subject_assignments) -------------------------------
export type TeachingLoad = { id: string; section_id: string; subject_id: string; teacher_id: string; section: { id: string; name: string; grade_level: { name: string; sort_order: number } }; subject: { id: string; name: string; code: string }; teacher: { id: string; first_name: string; last_name: string } }

const LOAD_SELECT = `id, section_id, subject_id, teacher_id,
  section:sections!tsa_section_fkey(id, name, grade_level:grade_levels!sections_grade_level_fkey(name, sort_order)),
  subject:subjects!tsa_subject_fkey(id, name, code),
  teacher:teachers!tsa_teacher_fkey(id, first_name, last_name)` as const

/** Teaching loads for a year (optionally one teacher's), for selects. */
export async function teachingLoads(schoolId: string, yearId: string, teacherId?: string) {
  const supabase = await createClient()
  let query = supabase.from("teacher_subject_assignments").select(LOAD_SELECT).eq("school_id", schoolId).eq("academic_year_id", yearId)
  if (teacherId) query = query.eq("teacher_id", teacherId)
  const { data, error } = await query.order("section(name)").order("subject(name)")
  const rows = (data ?? []) as unknown as TeachingLoad[]
  rows.sort((a, b) => a.section.grade_level.sort_order - b.section.grade_level.sort_order || a.section.name.localeCompare(b.section.name) || a.subject.name.localeCompare(b.subject.name))
  return { data: rows, error }
}

export async function getTeachingLoad(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("teacher_subject_assignments").select(`${LOAD_SELECT}, academic_year_id, school_id`).eq("id", id).maybeSingle()
  return { data: data as unknown as (TeachingLoad & { academic_year_id: string; school_id: string }) | null, error }
}

export const loadLabel = (l: TeachingLoad) => `${l.section.grade_level.name} – ${l.section.name} · ${l.subject.name}`

// --- Schedules -------------------------------------------------------------------------------
const SCHEDULE_SELECT = `*,
  section:sections!class_schedules_section_ref(id, name, grade_level:grade_levels!sections_grade_level_fkey(name)),
  subject:subjects!class_schedules_subject_ref(id, name, code),
  teacher:teachers!class_schedules_teacher_ref(id, first_name, last_name)` as const

export type ScheduleRow = {
  id: string
  section_id: string
  teacher_id: string
  subject_id: string
  day_of_week: number
  start_time: string
  end_time: string
  room: string | null
  status: "active" | "inactive"
  section: { id: string; name: string; grade_level: { name: string } }
  subject: { id: string; name: string; code: string }
  teacher: { id: string; first_name: string; last_name: string }
}

/** Weekly timetable rows visible to the caller (RLS), filtered. */
export async function listSchedules(filter: { schoolId?: string; yearId: string; sectionId?: string; teacherId?: string; sectionIds?: string[]; day?: number; activeOnly?: boolean }) {
  const supabase = await createClient()
  let query = supabase.from("class_schedules").select(SCHEDULE_SELECT).eq("academic_year_id", filter.yearId)
  if (filter.schoolId) query = query.eq("school_id", filter.schoolId)
  if (filter.sectionId) query = query.eq("section_id", filter.sectionId)
  if (filter.sectionIds) query = query.in("section_id", filter.sectionIds.length ? filter.sectionIds : ["00000000-0000-0000-0000-000000000000"])
  if (filter.teacherId) query = query.eq("teacher_id", filter.teacherId)
  if (filter.day) query = query.eq("day_of_week", filter.day)
  if (filter.activeOnly !== false) query = query.eq("status", "active")
  const { data, error } = await query.order("day_of_week").order("start_time").limit(500)
  return { data: await fillTeacherNames((data ?? []) as unknown as ScheduleRow[]), error }
}

/** Describe an existing clash for a proposed slot (friendly message before the DB constraint fires). */
export async function findScheduleConflict(slot: { schoolId: string; yearId: string; sectionId: string; teacherId: string; day: number; start: string; end: string; room: string | null; excludeId?: string }) {
  const supabase = await createClient()
  let query = supabase
    .from("class_schedules")
    .select(SCHEDULE_SELECT)
    .eq("school_id", slot.schoolId)
    .eq("academic_year_id", slot.yearId)
    .eq("day_of_week", slot.day)
    .eq("status", "active")
    .lt("start_time", slot.end)
    .gt("end_time", slot.start)
  if (slot.excludeId) query = query.neq("id", slot.excludeId)
  const { data } = await query
  const rows = (data ?? []) as unknown as ScheduleRow[]
  const when = (r: ScheduleRow) => `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}`
  const teacher = rows.find((r) => r.teacher_id === slot.teacherId)
  if (teacher) return `${teacher.teacher.first_name} ${teacher.teacher.last_name} already teaches ${teacher.subject.name} in ${teacher.section.grade_level.name} – ${teacher.section.name} at ${when(teacher)}.`
  const section = rows.find((r) => r.section_id === slot.sectionId)
  if (section) return `${section.section.grade_level.name} – ${section.section.name} already has ${section.subject.name} at ${when(section)}.`
  return null
}

export async function createSchedule(row: TablesInsert<"class_schedules">) {
  const supabase = await createClient()
  return supabase.from("class_schedules").insert(row).select("id").single()
}

export async function updateSchedule(id: string, row: TablesUpdate<"class_schedules">) {
  const supabase = await createClient()
  return supabase.from("class_schedules").update(row).eq("id", id).select("id").single()
}

export async function deleteSchedule(id: string) {
  const supabase = await createClient()
  return supabase.from("class_schedules").delete().eq("id", id).select("id").single()
}

// --- Attendance ------------------------------------------------------------------------------
export type RosterRow = { enrollment_id: string; student: { id: string; student_number: string; first_name: string; last_name: string } }

/** Students enrolled in a section on a date (enrollment covers the date). */
export async function rosterOn(sectionId: string, date: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("student_enrollments")
    .select("id, enrollment_date, exit_date, student:students!student_enrollments_student_fkey(id, student_number, first_name, last_name)")
    .eq("section_id", sectionId)
    .lte("enrollment_date", date)
    .or(`exit_date.is.null,exit_date.gte.${date}`)
    .order("student(last_name)")
    .order("student(first_name)")
  return { data: (data ?? []).map((e) => ({ enrollment_id: e.id, student: e.student })) as RosterRow[], error }
}

export async function attendanceSession(sectionId: string, date: string) {
  const supabase = await createClient()
  return supabase
    .from("attendance_sessions")
    .select("*, records:attendance_records(enrollment_id, student_id, status, remarks, recorded_at)")
    .eq("section_id", sectionId)
    .eq("attendance_date", date)
    .eq("session_type", "daily")
    .maybeSingle()
}

export async function saveAttendance(sectionId: string, date: string, records: { enrollment_id: string; status: AttendanceStatus; remarks: string | null }[]) {
  const supabase = await createClient()
  return supabase.rpc("save_attendance", { p_section_id: sectionId, p_date: date, p_records: records })
}

export async function setSessionLock(id: string, locked: boolean) {
  const supabase = await createClient()
  return supabase.from("attendance_sessions").update({ status: locked ? "locked" : "open" }).eq("id", id).select("id").single()
}

/** Is the session editable by the (teacher) caller under the school policy? */
export function editableForTeacher(session: { status: string; attendance_date: string } | null, editDays: number | null, today: string) {
  if (!session) return true
  if (session.status === "locked") return false
  if (editDays === null) return true
  const limit = new Date(`${today}T00:00:00Z`)
  limit.setUTCDate(limit.getUTCDate() - editDays)
  return session.attendance_date >= limit.toISOString().slice(0, 10)
}

export async function sectionAttendanceSummary(sectionId: string, from: string, to: string) {
  const supabase = await createClient()
  return supabase.rpc("attendance_section_summary", { p_section_id: sectionId, p_from: from, p_to: to })
}

export async function studentAttendanceSummary(studentId: string, yearId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("attendance_student_summary", { p_student_id: studentId, p_academic_year_id: yearId })
  return { data: data?.[0] ?? { present: 0, absent: 0, late: 0, excused: 0, total: 0 }, error }
}

/** Daily attendance status of every visible section for one date (date report). */
export async function attendanceByDate(schoolId: string, yearId: string, date: string, gradeId?: string) {
  const supabase = await createClient()
  let sectionsQuery = supabase
    .from("sections")
    .select("id, name, grade_level_id, grade_level:grade_levels!sections_grade_level_fkey(name, sort_order)")
    .eq("school_id", schoolId)
    .eq("academic_year_id", yearId)
    .eq("status", "active")
  if (gradeId) sectionsQuery = sectionsQuery.eq("grade_level_id", gradeId)
  const [sections, sessions] = await Promise.all([
    sectionsQuery.order("grade_level(sort_order)").order("name"),
    supabase
      .from("attendance_sessions")
      .select("id, section_id, status, records:attendance_records(status)")
      .eq("school_id", schoolId)
      .eq("attendance_date", date)
      .eq("session_type", "daily"),
  ])
  const bySection = new Map((sessions.data ?? []).map((s) => [s.section_id, s]))
  const rows = (sections.data ?? []).map((sec) => {
    const s = bySection.get(sec.id)
    const count = (st: AttendanceStatus) => s?.records.filter((r) => r.status === st).length ?? 0
    return {
      section: sec,
      sessionId: s?.id ?? null,
      locked: s?.status === "locked",
      present: count("present"),
      absent: count("absent"),
      late: count("late"),
      excused: count("excused"),
      total: s?.records.length ?? 0,
    }
  })
  return { data: rows, error: sections.error ?? sessions.error }
}

// --- Grades -----------------------------------------------------------------------------------
export type GradeEntryRow = RosterRow & { grade: { id: string; score: number; remarks: string | null; status: GradeStatus } | null }

/** Grade sheet for one teaching load and period: enrolled students + existing grades. */
export async function gradeSheet(sectionId: string, subjectId: string, period: { id: string; start_date: string; end_date: string }) {
  const supabase = await createClient()
  const [enrollments, grades] = await Promise.all([
    supabase
      .from("student_enrollments")
      .select("id, student:students!student_enrollments_student_fkey(id, student_number, first_name, last_name)")
      .eq("section_id", sectionId)
      .lte("enrollment_date", period.end_date)
      .or(`exit_date.is.null,exit_date.gte.${period.start_date}`)
      .order("student(last_name)")
      .order("student(first_name)"),
    supabase.from("grade_records").select("id, enrollment_id, score, remarks, status").eq("section_id", sectionId).eq("subject_id", subjectId).eq("grading_period_id", period.id),
  ])
  const byEnrollment = new Map((grades.data ?? []).map((g) => [g.enrollment_id, g]))
  const rows: GradeEntryRow[] = (enrollments.data ?? []).map((e) => {
    const g = byEnrollment.get(e.id)
    return { enrollment_id: e.id, student: e.student, grade: g ? { id: g.id, score: Number(g.score), remarks: g.remarks, status: g.status } : null }
  })
  return { data: rows, error: enrollments.error ?? grades.error }
}

export async function saveGrades(periodId: string, sectionId: string, subjectId: string, entries: { enrollment_id: string; score: number | null; remarks: string | null }[], submit: boolean) {
  const supabase = await createClient()
  return supabase.rpc("save_grades", { p_period_id: periodId, p_section_id: sectionId, p_subject_id: subjectId, p_entries: entries, p_submit: submit })
}

export async function reviewGrades(ids: string[], action: "approve" | "return" | "lock" | "unlock", reason: string | null) {
  const supabase = await createClient()
  return supabase.rpc("review_grades", { p_ids: ids, p_action: action, p_reason: reason ?? undefined })
}

export async function updateGradeScore(id: string, score: number, remarks: string | null, reason: string) {
  const supabase = await createClient()
  return supabase.from("grade_records").update({ score, remarks, change_reason: reason }).eq("id", id).select("id").single()
}

const GRADE_SELECT = `id, score, remarks, status, updated_at, submitted_at, section_id, subject_id, grading_period_id,
  student:students!grade_records_student_ref(id, student_number, first_name, last_name),
  subject:subjects!grade_records_subject_ref(id, name, code),
  section:sections!grade_records_section_ref(id, name, grade_level:grade_levels!sections_grade_level_fkey(name)),
  teacher:teachers!grade_records_teacher_ref(id, first_name, last_name),
  period:grading_periods!grade_records_period_fkey(id, name, sequence)` as const

export type GradeRow = {
  id: string
  score: number
  remarks: string | null
  status: GradeStatus
  updated_at: string
  student: { id: string; student_number: string; first_name: string; last_name: string }
  subject: { id: string; name: string; code: string }
  section: { id: string; name: string; grade_level: { name: string } }
  teacher: { id: string; first_name: string; last_name: string }
  period: { id: string; name: string; sequence: number }
}

export const GRADE_SORTS = ["student", "updated_at", "score"] as const

/** Admin review list (server-paginated). */
export async function listGrades(schoolId: string, p: ListParams<(typeof GRADE_SORTS)[number]>) {
  const supabase = await createClient()
  let query = supabase.from("grade_records").select(GRADE_SELECT.replace("student:students!grade_records_student_ref(", "student:students!grade_records_student_ref!inner("), COUNT).eq("school_id", schoolId)
  if (p.filters.year) query = query.eq("academic_year_id", p.filters.year)
  if (p.filters.period) query = query.eq("grading_period_id", p.filters.period)
  if (p.filters.section) query = query.eq("section_id", p.filters.section)
  if (p.filters.subject) query = query.eq("subject_id", p.filters.subject)
  if (p.filters.status) query = query.eq("status", p.filters.status as GradeStatus)
  if (p.q) query = query.ilike("student.search_text", likePattern(p.q))
  const asc = { ascending: p.dir === "asc" }
  query = p.sort === "student" ? query.order("student(last_name)", asc).order("student(first_name)", asc) : query.order(p.sort, asc)
  const { data, count, error } = await query.range(...pageRange(p))
  return { rows: (data ?? []) as unknown as GradeRow[], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

/** Ids of grades matching the review filters and a status (for "approve all" actions). */
export async function gradeIdsFor(schoolId: string, filters: Record<string, string>, status: GradeStatus) {
  const supabase = await createClient()
  let query = supabase.from("grade_records").select("id").eq("school_id", schoolId).eq("status", status)
  if (filters.year) query = query.eq("academic_year_id", filters.year)
  if (filters.period) query = query.eq("grading_period_id", filters.period)
  if (filters.section) query = query.eq("section_id", filters.section)
  if (filters.subject) query = query.eq("subject_id", filters.subject)
  const { data } = await query.limit(2000)
  return (data ?? []).map((r) => r.id)
}

/** A student's grades for a year (RLS: students/parents see published grades only). */
export async function studentGrades(studentId: string, yearId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("grade_records")
    .select(GRADE_SELECT)
    .eq("student_id", studentId)
    .eq("academic_year_id", yearId)
    .order("subject(name)")
  return { data: (data ?? []) as unknown as GradeRow[], error }
}

export async function gradeHistory(gradeId: string) {
  const supabase = await createClient()
  return supabase.from("grade_change_logs").select("*").eq("grade_record_id", gradeId).order("changed_at")
}

export async function pendingGradeCount(schoolId: string) {
  const supabase = await createClient()
  const { count } = await supabase.from("grade_records").select("id", { count: "exact", head: true }).eq("school_id", schoolId).eq("status", "submitted")
  return count ?? 0
}

// --- Coursework -------------------------------------------------------------------------------
const COURSEWORK_SELECT = `*,
  section:sections!assignments_section_ref(id, name, grade_level:grade_levels!sections_grade_level_fkey(name)),
  subject:subjects!assignments_subject_ref(id, name, code),
  teacher:teachers!assignments_teacher_ref(id, first_name, last_name)` as const

export type CourseworkRow = {
  id: string
  school_id: string
  academic_year_id: string
  section_id: string
  subject_id: string
  teacher_id: string
  title: string
  description: string | null
  due_at: string | null
  status: "draft" | "published" | "archived"
  attachment_path: string | null
  attachment_name: string | null
  created_at: string
  section: { id: string; name: string; grade_level: { name: string } }
  subject: { id: string; name: string; code: string }
  teacher: { id: string; first_name: string; last_name: string }
}

export const COURSEWORK_SORTS = ["due_at", "created_at", "title"] as const

export async function listCoursework(p: ListParams<(typeof COURSEWORK_SORTS)[number]>, scope: { schoolId?: string; teacherId?: string; sectionIds?: string[]; yearId?: string }) {
  const supabase = await createClient()
  let query = supabase.from("assignments").select(COURSEWORK_SELECT, COUNT)
  if (scope.schoolId) query = query.eq("school_id", scope.schoolId)
  if (scope.teacherId) query = query.eq("teacher_id", scope.teacherId)
  if (scope.sectionIds) query = query.in("section_id", scope.sectionIds.length ? scope.sectionIds : ["00000000-0000-0000-0000-000000000000"])
  if (scope.yearId) query = query.eq("academic_year_id", scope.yearId)
  if (p.filters.section) query = query.eq("section_id", p.filters.section)
  if (p.filters.subject) query = query.eq("subject_id", p.filters.subject)
  if (p.filters.status) query = query.eq("status", p.filters.status as CourseworkRow["status"])
  if (p.q) query = query.ilike("title", likePattern(p.q))
  const { data, count, error } = await query.order(p.sort, { ascending: p.dir === "asc", nullsFirst: false }).range(...pageRange(p))
  return { rows: await fillTeacherNames((data ?? []) as unknown as CourseworkRow[]), total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

export async function getCoursework(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("assignments").select(COURSEWORK_SELECT).eq("id", id).maybeSingle()
  return { data: data ? (await fillTeacherNames([data as unknown as CourseworkRow]))[0] : null, error }
}

/** Upcoming published coursework (next `days` days) for sections or a teacher. */
export async function upcomingCoursework(scope: { sectionIds?: string[]; teacherId?: string; schoolId?: string }, days = 14, limit = 8) {
  const supabase = await createClient()
  const now = new Date()
  const until = new Date(now.getTime() + days * 864e5)
  let query = supabase
    .from("assignments")
    .select(COURSEWORK_SELECT)
    .eq("status", "published")
    .gte("due_at", now.toISOString())
    .lte("due_at", until.toISOString())
  if (scope.sectionIds) query = query.in("section_id", scope.sectionIds.length ? scope.sectionIds : ["00000000-0000-0000-0000-000000000000"])
  if (scope.teacherId) query = query.eq("teacher_id", scope.teacherId)
  if (scope.schoolId) query = query.eq("school_id", scope.schoolId)
  const { data, error } = await query.order("due_at").limit(limit)
  return { data: await fillTeacherNames((data ?? []) as unknown as CourseworkRow[]), error }
}

export async function createCoursework(row: TablesInsert<"assignments">) {
  const supabase = await createClient()
  return supabase.from("assignments").insert(row).select("id").single()
}

export async function updateCoursework(id: string, row: TablesUpdate<"assignments">) {
  const supabase = await createClient()
  return supabase.from("assignments").update(row).eq("id", id).select("id").single()
}

export async function submissionsFor(assignmentId: string) {
  const supabase = await createClient()
  return supabase
    .from("assignment_submissions")
    .select("*, student:students!submissions_student_ref(id, student_number, first_name, last_name)")
    .eq("assignment_id", assignmentId)
    .order("submitted_at")
}

export async function mySubmission(assignmentId: string, studentId: string) {
  const supabase = await createClient()
  return supabase.from("assignment_submissions").select("*").eq("assignment_id", assignmentId).eq("student_id", studentId).maybeSingle()
}

export async function upsertSubmission(row: TablesInsert<"assignment_submissions">, existingId?: string) {
  const supabase = await createClient()
  if (existingId) {
    return supabase.from("assignment_submissions").update({ content: row.content, file_path: row.file_path, file_name: row.file_name }).eq("id", existingId).select("id").single()
  }
  return supabase.from("assignment_submissions").insert(row).select("id").single()
}

export async function reviewSubmission(id: string) {
  const supabase = await createClient()
  return supabase.from("assignment_submissions").update({ status: "reviewed" }).eq("id", id).select("id").single()
}

/** Short-lived download URL. Storage RLS decides whether the caller may read the file. */
export async function signedFileUrl(path: string) {
  const supabase = await createClient()
  return supabase.storage.from("academic-files").createSignedUrl(path, 60)
}

// --- Notifications & activity -----------------------------------------------------------------
export async function myNotifications(limit = 50) {
  const supabase = await createClient()
  return supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(limit)
}

export async function unreadCount() {
  const supabase = await createClient()
  const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null)
  return count ?? 0
}

export async function markRead(ids: string[] | null) {
  const supabase = await createClient()
  return supabase.rpc("mark_notifications_read", { p_ids: ids ?? undefined })
}

export async function recentActivity(userId: string, limit = 8) {
  const supabase = await createClient()
  return supabase.from("audit_logs").select("id, action, entity, metadata, created_at").eq("actor_user_id", userId).order("created_at", { ascending: false }).limit(limit)
}

export async function schoolActivity(schoolId: string, limit = 20) {
  const supabase = await createClient()
  return supabase.from("audit_logs").select("id, action, entity, entity_id, metadata, created_at, actor_user_id").eq("school_id", schoolId).order("created_at", { ascending: false }).limit(limit)
}

export async function upcomingCount(schoolId: string, days = 7) {
  const supabase = await createClient()
  const now = new Date()
  const { count } = await supabase
    .from("assignments")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .eq("status", "published")
    .gte("due_at", now.toISOString())
    .lte("due_at", new Date(now.getTime() + days * 864e5).toISOString())
  return count ?? 0
}

/** One-row aggregate of today's daily attendance for the admin dashboard. */
export async function attendanceDayTotals(schoolId: string, date: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("attendance_day_totals", { p_school_id: schoolId, p_date: date })
  const row = data?.[0]
  return { data: { sessions: Number(row?.sessions ?? 0), present: Number(row?.present ?? 0), absent: Number(row?.absent ?? 0), late: Number(row?.late ?? 0), excused: Number(row?.excused ?? 0) }, error }
}

/** The school's saved setup templates of one kind (grading periods, grading scales, grade levels, subjects). */
export async function listSetupTemplates(schoolId: string, kind: "grading_periods" | "grading_scales" | "grade_levels" | "subjects") {
  const supabase = await createClient()
  return supabase.from("setup_templates").select("id, name, items").eq("school_id", schoolId).eq("kind", kind).order("name")
}
