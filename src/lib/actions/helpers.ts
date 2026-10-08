import "server-only"
import { revalidatePath } from "next/cache"
import type { z } from "zod"
import { authorize } from "@/lib/auth/session"
import { denied, fail, formToObject, invalid, type ActionResult } from "@/lib/action-result"
import type { UserContext } from "@/types/domain"

type DbError = { code?: string; message?: string } | null | undefined

/** Friendly messages for constraint violations raised by Phase 2 tables. */
const CONSTRAINT_MESSAGES: [RegExp, string, string?][] = [
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
  const ours = error?.code === "P0001" || ((error?.code === "42501" || error?.code === "23514") && !/row-level security|violates check constraint/.test(msg))
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
