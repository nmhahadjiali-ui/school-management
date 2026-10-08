"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { denied, formToObject, invalid, type ActionResult } from "@/lib/action-result"
import { dbFail, manage, schoolAdmin } from "@/lib/actions/helpers"
import { authorize } from "@/lib/auth/session"
import { zonedToIso } from "@/lib/dates"
import { uuidSchema } from "@/lib/validations"
import {
  academicSettingsSchema,
  attendanceSheetSchema,
  courseworkSchema,
  courseworkUpdateSchema,
  gradeEditSchema,
  gradeSheetSchema,
  gradingPeriodSchema,
  gradingScaleSchema,
  reviewSchema,
  scheduleSchema,
  submissionSchema,
} from "@/lib/validations/academic"
import * as ops from "@/services/operations"
import { createClient } from "@/lib/supabase/server"
import type { GradingPeriodStatus, UserContext } from "@/types/domain"

const none = z.object({})
const badId = { ok: false as const, error: "The record was not found or you do not have access to it." }
const valid = (...ids: string[]) => ids.every((id) => uuidSchema.safeParse(id).success)

/** School admin or teacher of an active school (teacher id comes from the session). */
async function academicActor(): Promise<(UserContext & { schoolId: string; teacherId: string | null; isAdmin: boolean }) | null> {
  const ctx = (await authorize("school.records.manage")) ?? (await authorize("teacher.academics"))
  if (!ctx?.profile.school_id) return null
  const teacherId = ctx.record?.type === "teacher" ? ctx.record.id : null
  const isAdmin = ctx.profile.role === "school_admin"
  if (!isAdmin && !teacherId) return null
  return { ...ctx, schoolId: ctx.profile.school_id, teacherId, isAdmin }
}

// --- Grading periods ----------------------------------------------------------------
export async function createGradingPeriod(yearId: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(yearId)) return badId
  return manage(fd, gradingPeriodSchema, (d, ctx) => ops.createGradingPeriod({ ...d, school_id: ctx.schoolId, academic_year_id: yearId }), {
    context: "createGradingPeriod",
    success: "Grading period created.",
    revalidate: ["/grading-periods"],
  })
}

export async function updateGradingPeriod(id: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(id)) return badId
  return manage(fd, gradingPeriodSchema, (d) => ops.updateGradingPeriod(id, d), {
    context: "updateGradingPeriod",
    success: "Grading period saved.",
    revalidate: ["/grading-periods"],
  })
}

export async function setGradingPeriodStatus(id: string, status: GradingPeriodStatus) {
  if (!valid(id) || !["upcoming", "open", "closed"].includes(status)) return badId
  return manage(null, none, () => ops.updateGradingPeriod(id, { status }), {
    context: "setGradingPeriodStatus",
    success: status === "open" ? "Grading period opened for grade entry." : status === "closed" ? "Grading period closed." : "Grading period updated.",
    revalidate: ["/grading-periods", "/grades"],
  })
}

// --- Grading scales -------------------------------------------------------------------
export async function createGradingScale(_p: ActionResult | null, fd: FormData) {
  return manage(fd, gradingScaleSchema, (d, ctx) => ops.createGradingScale({ ...d, school_id: ctx.schoolId }), {
    context: "createGradingScale",
    success: "Grading band added.",
    revalidate: ["/grading-scales"],
  })
}

export async function updateGradingScale(id: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(id)) return badId
  return manage(fd, gradingScaleSchema, (d) => ops.updateGradingScale(id, d), {
    context: "updateGradingScale",
    success: "Grading band saved.",
    revalidate: ["/grading-scales"],
  })
}

export async function deleteGradingScale(id: string) {
  if (!valid(id)) return badId
  return manage(null, none, () => ops.deleteGradingScale(id), { context: "deleteGradingScale", success: "Grading band removed.", revalidate: ["/grading-scales"] })
}

// --- Schedules --------------------------------------------------------------------------
async function scheduleRow(d: z.infer<typeof scheduleSchema>) {
  const { data: load } = await ops.getTeachingLoad(d.teaching_load_id)
  if (!load) return null
  return {
    school_id: load.school_id,
    academic_year_id: load.academic_year_id,
    section_id: load.section_id,
    subject_id: load.subject_id,
    teacher_id: load.teacher_id,
    day_of_week: d.day_of_week,
    start_time: d.start_time,
    end_time: d.end_time,
    room: d.room,
  }
}

async function conflictMessage(row: NonNullable<Awaited<ReturnType<typeof scheduleRow>>>, excludeId?: string): Promise<ActionResult | null> {
  const message = await ops.findScheduleConflict({
    schoolId: row.school_id, yearId: row.academic_year_id, sectionId: row.section_id, teacherId: row.teacher_id,
    day: row.day_of_week, start: row.start_time, end: row.end_time, room: row.room, excludeId,
  })
  return message ? { ok: false, error: `Schedule conflict: ${message}` } : null
}

export async function createSchedule(_p: ActionResult | null, fd: FormData) {
  return manage(
    fd,
    scheduleSchema,
    async (d, ctx) => {
      const row = await scheduleRow(d)
      if (!row || row.school_id !== ctx.schoolId) return badId
      return (await conflictMessage(row)) ?? ops.createSchedule(row)
    },
    { context: "createSchedule", success: "Class scheduled.", revalidate: ["/schedules", "/schedule"] }
  )
}

export async function updateSchedule(id: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(id)) return badId
  return manage(
    fd,
    scheduleSchema,
    async (d, ctx) => {
      const row = await scheduleRow(d)
      if (!row || row.school_id !== ctx.schoolId) return badId
      return (await conflictMessage(row, id)) ?? ops.updateSchedule(id, row)
    },
    { context: "updateSchedule", success: "Schedule saved.", revalidate: ["/schedules", "/schedule"] }
  )
}

export async function deleteSchedule(id: string) {
  if (!valid(id)) return badId
  return manage(null, none, () => ops.deleteSchedule(id), { context: "deleteSchedule", success: "Class removed from the schedule.", revalidate: ["/schedules", "/schedule"] })
}

// --- Attendance ----------------------------------------------------------------------------
export async function saveAttendance(input: z.input<typeof attendanceSheetSchema>): Promise<ActionResult> {
  const actor = await academicActor()
  if (!actor) return denied()
  const parsed = attendanceSheetSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const { section_id, date, records } = parsed.data
  // The RPC re-checks everything: section visibility, teacher authorization,
  // locks, edit window, enrollment-on-date, and records the actor itself.
  const { error } = await ops.saveAttendance(section_id, date, records)
  if (error) return dbFail(error, "saveAttendance")
  revalidatePath("/attendance", "layout")
  revalidatePath("/dashboard")
  return { ok: true, message: `Attendance saved for ${records.length} student${records.length === 1 ? "" : "s"}.` }
}

export async function setAttendanceLock(sessionId: string, locked: boolean) {
  if (!valid(sessionId)) return badId
  return manage(null, none, () => ops.setSessionLock(sessionId, locked), {
    context: "setAttendanceLock",
    success: locked ? "Attendance locked." : "Attendance unlocked for editing.",
    revalidate: ["/attendance"],
  })
}

// --- Grades ---------------------------------------------------------------------------------
export async function saveGradeSheet(input: z.input<typeof gradeSheetSchema>): Promise<ActionResult> {
  const actor = await academicActor()
  if (!actor?.teacherId) return denied()
  const parsed = gradeSheetSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const { load_id, period_id, entries, submit } = parsed.data
  // The teaching load must be the caller's own; the database enforces it again
  // (grade rows reference the teacher's assignment by composite key).
  const { data: load } = await ops.getTeachingLoad(load_id)
  if (!load || load.teacher_id !== actor.teacherId) return denied()
  const { data, error } = await ops.saveGrades(period_id, load.section_id, load.subject_id, entries, submit)
  if (error) return dbFail(error, "saveGradeSheet")
  revalidatePath("/grades", "layout")
  const result = data as { saved: number; skipped: number }
  const skipped = result.skipped ? ` ${result.skipped} already-submitted grade${result.skipped === 1 ? " was" : "s were"} left unchanged.` : ""
  return { ok: true, message: `${submit ? "Submitted" : "Saved"} ${result.saved} grade${result.saved === 1 ? "" : "s"}.${skipped}` }
}

export async function reviewGrades(input: z.input<typeof reviewSchema>): Promise<ActionResult> {
  if (!(await schoolAdmin())) return denied()
  const parsed = reviewSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const { ids, action, reason } = parsed.data
  const { data, error } = await ops.reviewGrades(ids, action, reason)
  if (error) return dbFail(error, "reviewGrades")
  revalidatePath("/grades", "layout")
  const verb = { approve: "approved", return: "returned to the teacher", lock: "locked", unlock: "unlocked" }[action]
  return { ok: true, message: `${data ?? 0} grade${data === 1 ? "" : "s"} ${verb}.` }
}

/** Review every grade matching the current filters that is in `from` status. */
export async function reviewFiltered(filters: Record<string, string>, action: "approve" | "lock", reason?: string): Promise<ActionResult> {
  const ctx = await schoolAdmin()
  if (!ctx) return denied()
  const safe = Object.fromEntries(Object.entries(filters).filter(([k, v]) => ["year", "period", "section", "subject"].includes(k) && valid(v)))
  const ids = await ops.gradeIdsFor(ctx.schoolId, safe, action === "approve" ? "submitted" : "approved")
  if (ids.length === 0) return { ok: false, error: action === "approve" ? "There are no submitted grades to approve." : "There are no approved grades to lock." }
  return reviewGrades({ ids, action, reason: reason ?? null })
}

export async function editGrade(id: string, _p: ActionResult | null, fd: FormData) {
  if (!valid(id)) return badId
  return manage(fd, gradeEditSchema, (d) => ops.updateGradeScore(id, d.score, d.remarks, d.reason), {
    context: "editGrade",
    success: "Grade updated. The change and reason were recorded in its history.",
    revalidate: ["/grades"],
  })
}

// --- Coursework -------------------------------------------------------------------------------
export async function createCoursework(_p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const actor = await academicActor()
  if (!actor) return denied()
  const parsed = courseworkSchema.safeParse(formToObject(fd))
  if (!parsed.success) return invalid(parsed.error)
  const d = parsed.data
  const { data: load } = await ops.getTeachingLoad(d.load_id)
  if (!load || load.school_id !== actor.schoolId || (!actor.isAdmin && load.teacher_id !== actor.teacherId)) return denied()
  const { data, error } = await ops.createCoursework({
    school_id: load.school_id,
    academic_year_id: load.academic_year_id,
    section_id: load.section_id,
    subject_id: load.subject_id,
    teacher_id: load.teacher_id,
    title: d.title,
    description: d.description,
    due_at: d.due_at ? zonedToIso(d.due_at, actor.school?.timezone) : null,
    status: d.status,
  })
  if (error || !data) return dbFail(error, "createCoursework")
  revalidatePath("/coursework", "layout")
  redirect(`/coursework/${data.id}?created=1`)
}

export async function updateCoursework(id: string, _p: ActionResult | null, fd: FormData): Promise<ActionResult> {
  if (!valid(id)) return badId
  const actor = await academicActor()
  if (!actor) return denied()
  const parsed = courseworkUpdateSchema.safeParse(formToObject(fd))
  if (!parsed.success) return invalid(parsed.error)
  const d = parsed.data
  // RLS: teachers can only update their own coursework.
  const { error } = await ops.updateCoursework(id, {
    title: d.title,
    description: d.description,
    due_at: d.due_at ? zonedToIso(d.due_at, actor.school?.timezone) : null,
    status: d.status,
  })
  if (error) return error.code === "PGRST116" ? badId : dbFail(error, "updateCoursework")
  revalidatePath("/coursework", "layout")
  return { ok: true, message: "Assignment saved." }
}

export async function setCourseworkStatus(id: string, status: "published" | "archived"): Promise<ActionResult> {
  if (!valid(id) || !["published", "archived"].includes(status)) return badId
  const actor = await academicActor()
  if (!actor) return denied()
  const { error } = await ops.updateCoursework(id, { status })
  if (error) return error.code === "PGRST116" ? badId : dbFail(error, "setCourseworkStatus")
  revalidatePath("/coursework", "layout")
  return { ok: true, message: status === "archived" ? "Assignment archived." : "Assignment published." }
}

/** Record an attachment the browser uploaded directly to Storage (path checked by DB + storage RLS). */
export async function setCourseworkAttachment(id: string, path: string | null, name: string | null): Promise<ActionResult> {
  if (!valid(id)) return badId
  const actor = await academicActor()
  if (!actor) return denied()
  if (path && !path.startsWith(`${actor.schoolId}/assignments/${id}/`)) return badId
  const { error } = await ops.updateCoursework(id, { attachment_path: path, attachment_name: name?.slice(0, 255) ?? null })
  if (error) return error.code === "PGRST116" ? badId : dbFail(error, "setCourseworkAttachment")
  revalidatePath(`/coursework/${id}`)
  return { ok: true, message: path ? "File attached." : "Attachment removed." }
}

export async function reviewSubmission(id: string): Promise<ActionResult> {
  if (!valid(id)) return badId
  const actor = await academicActor()
  if (!actor) return denied()
  const { error } = await ops.reviewSubmission(id)
  if (error) return error.code === "PGRST116" ? badId : dbFail(error, "reviewSubmission")
  revalidatePath("/coursework", "layout")
  return { ok: true, message: "Marked as reviewed." }
}

/** Student submits (or resubmits) their own work. Student and enrollment come from the session. */
export async function submitWork(assignmentId: string, input: z.input<typeof submissionSchema>): Promise<ActionResult> {
  if (!valid(assignmentId)) return badId
  const ctx = await authorize("student.academics")
  const studentId = ctx?.record?.type === "student" ? ctx.record.id : null
  if (!ctx?.profile.school_id || !studentId) return denied()
  const parsed = submissionSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const d = parsed.data
  if (d.file_path && !d.file_path.startsWith(`${ctx.profile.school_id}/submissions/${assignmentId}/${studentId}/`)) return badId

  const { data: assignment } = await ops.getCoursework(assignmentId)
  if (!assignment) return badId
  const supabase = await createClient()
  const { data: enrollment } = await supabase
    .from("student_enrollments")
    .select("id")
    .eq("student_id", studentId)
    .eq("section_id", assignment.section_id)
    .eq("academic_year_id", assignment.academic_year_id)
    .order("enrollment_date", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!enrollment) return { ok: false, error: "You are not enrolled in this class." }
  const { data: existing } = await ops.mySubmission(assignmentId, studentId)
  const { error } = await ops.upsertSubmission(
    {
      school_id: assignment.school_id,
      academic_year_id: assignment.academic_year_id,
      section_id: assignment.section_id,
      assignment_id: assignmentId,
      student_id: studentId,
      enrollment_id: enrollment.id,
      content: d.content,
      file_path: d.file_path,
      file_name: d.file_name,
    },
    existing?.id
  )
  if (error) return dbFail(error, "submitWork")
  revalidatePath(`/coursework/${assignmentId}`)
  return { ok: true, message: "Your work was submitted." }
}

// --- Notifications ------------------------------------------------------------------------------
export async function markNotificationsRead(ids: string[] | null): Promise<ActionResult> {
  if (!(await authorize("notifications.view"))) return denied()
  if (ids && !valid(...ids)) return badId
  const { error } = await ops.markRead(ids)
  if (error) return dbFail(error, "markNotificationsRead")
  revalidatePath("/", "layout")
  return { ok: true }
}

// --- Academic policies (school settings) ------------------------------------------------------------
export async function updateAcademicSettings(_p: ActionResult | null, fd: FormData) {
  return manage(
    fd,
    academicSettingsSchema,
    async (d, ctx) => {
      const supabase = await createClient()
      return supabase.from("school_settings").update(d).eq("school_id", ctx.schoolId).select("id").single()
    },
    { context: "updateAcademicSettings", success: "Academic policies saved.", revalidate: ["/settings"] }
  )
}
