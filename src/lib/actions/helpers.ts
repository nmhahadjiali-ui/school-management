import "server-only"
import { revalidatePath } from "next/cache"
import type { z } from "zod"
import { authorize } from "@/lib/auth/session"
import { denied, fail, formToObject, invalid, type ActionResult } from "@/lib/action-result"
import type { UserContext } from "@/types/domain"

type DbError = { code?: string; message?: string } | null | undefined

/** Friendly messages for constraint violations raised by Phase 2 tables. */
const CONSTRAINT_MESSAGES: [RegExp, string, string?][] = [
  // Phase 3 (checked first: deletes of referenced teaching loads mention the child FK)
  [/delete on table "teacher_subject_assignments"/, "This teaching load already has schedules, attendance, grades or assignments, so it is kept for the record and cannot be removed."],
  [/class_schedules_teacher_conflict/, "Schedule conflict: the teacher already has a class at that time."],
  [/class_schedules_section_conflict/, "Schedule conflict: the section already has a class at that time."],
  [/class_schedules_assignment_fkey/, "That teacher is not assigned to this subject and section. Add a teaching load first."],
  [/grade_records_assignment_fkey/, "You are not assigned to teach this subject in this section."],
  [/assignments_teaching_fkey/, "You are not assigned to teach this subject in this section."],
  [/grading_periods_no_overlap/, "Grading periods of the same year cannot overlap.", "start_date"],
  [/grading_periods_year_sequence_key/, "Another grading period of this year already uses that order number.", "sequence"],
  [/grading_periods_year_code_key/, "Another grading period of this year uses that code.", "code"],
  [/grading_periods_year_name_key/, "Another grading period of this year uses that name.", "name"],
  [/grading_scales_no_overlap/, "This score range overlaps another band.", "minimum_score"],
  [/grading_scales_school_name_key/, "A band with this name already exists.", "name"],
  [/attendance_records_enrollment_fkey/, "One of the students is not enrolled in this section."],
  [/submissions_one_per_student/, "You have already submitted this assignment."],
  [/students_school_number_key/, "This student number is already used in your school.", "student_number"],
  [/teachers_school_employee_number_key/, "This employee number is already used in your school.", "employee_number"],
  [/academic_years_school_name_key/, "An academic year with this name already exists.", "name"],
  [/grade_levels_school_code_key/, "A grade level with this code already exists.", "code"],
  [/grade_levels_school_name_key/, "A grade level with this name already exists.", "name"],
  [/subjects_school_code_key/, "A subject with this code already exists.", "code"],
  [/subjects_school_name_key/, "A subject with this name already exists.", "name"],
  [/sections_year_grade_name_key/, "A section with this name already exists for that grade and year.", "name"],
  [/sections_year_code_key/, "A section with this code already exists in that year.", "code"],
  [/student_enrollments_one_open_per_year/, "This student already has an open enrollment for that academic year."],
  [/student_guardians_pair_key/, "This guardian is already linked to the student."],
  [/student_guardians_one_primary/, "The student already has a primary guardian."],
  [/tsa_unique_assignment/, "This teacher already teaches that subject in that section."],
  [/invitations_one_open_per_record/, "There is already an open invitation for this person."],
  [/academic_years_one_current/, "Another academic year is already current."],
  // Phase 5
  [/fee_types_school_code_key/, "A fee type with this code already exists.", "code"],
  [/discount_types_school_code_key/, "A discount type with this code already exists.", "code"],
  [/fee_items_installments_match/, "Installments are only possible for monthly, quarterly or semester fees.", "installments"],
  [/discount_types_percentage/, "A percentage cannot exceed 100.", "value"],
  [/delete on table "fee_structure_items"/, "This fee item already generated charges, so it is kept for the record."],
  [/academic_years_current_is_active/, "The current academic year must stay active. Make another year current first."],
]

/**
 * Translate a database error. Messages raised deliberately by our triggers
 * (P0001, and 42501/23514 with our own wording) are already user-facing.
 */
export function dbFail(error: DbError, context: string): ActionResult {
  const msg = error?.message ?? ""
  for (const [pattern, message, field] of CONSTRAINT_MESSAGES) {
    if (pattern.test(msg)) {
      console.error(`[${context}]`, error?.code, msg)
      return field ? { ok: false, error: "Please correct the highlighted fields.", fieldErrors: { [field]: [message] } } : { ok: false, error: message }
    }
  }
  const ours =
    error?.code === "P0001" ||
    error?.code === "P0002" ||
    ((error?.code === "42501" || error?.code === "23514" || error?.code === "23503") &&
      !/row-level security|violates check constraint|violates foreign key constraint|permission denied/.test(msg))
  if (ours && msg) {
    console.error(`[${context}]`, error?.code, msg)
    return { ok: false, error: msg }
  }
  if (error?.code === "23503") {
    console.error(`[${context}]`, error.code, msg)
    return { ok: false, error: "One of the selected items does not belong to your school or no longer exists." }
  }
  return fail(error, context)
}

/** School admin context with a school (super admins have none and use platform pages). */
export async function schoolAdmin(): Promise<(UserContext & { schoolId: string }) | null> {
  const ctx = await authorize("school.records.manage")
  const schoolId = ctx?.profile.school_id
  return ctx && schoolId ? { ...ctx, schoolId } : null
}

/**
 * Standard school-admin form action: authorize -> validate -> run -> revalidate.
 * `run` receives the session's school id; never take school_id from the form.
 */
export async function manage<S extends z.ZodType>(
  formData: FormData | null,
  schema: S,
  run: (data: z.infer<S>, ctx: UserContext & { schoolId: string }) => Promise<{ error: DbError } | ActionResult>,
  opts: { context: string; success: string; revalidate?: string[] }
): Promise<ActionResult> {
  const ctx = await schoolAdmin()
  if (!ctx) return denied()
  const parsed = schema.safeParse(formData ? formToObject(formData) : {})
  if (!parsed.success) return invalid(parsed.error)
  const result = await run(parsed.data, ctx)
  if ("ok" in result) {
    if (!result.ok) return result
  } else if (result.error) {
    return result.error && "code" in result.error && result.error.code === "PGRST116"
      ? { ok: false, error: "The record was not found or you do not have access to it." }
      : dbFail(result.error, opts.context)
  }
  for (const path of opts.revalidate ?? []) revalidatePath(path, "layout")
  return { ok: true, message: opts.success }
}
