"use server"

import { revalidatePath } from "next/cache"
import { createClient as createPlainClient } from "@supabase/supabase-js"
import { denied, fail, type ActionResult } from "@/lib/action-result"
import { schoolAdmin } from "@/lib/actions/helpers"
import { hitRateLimit, rateLimitHits } from "@/lib/rate-limit"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { uuidSchema } from "@/lib/validations"

// Permanent deletion of school setup records (school admins, own school only).
// Two guards on top of RLS: the admin re-enters their password, and records
// that anything refers to are refused with an explanation (the database's
// NO ACTION foreign keys refuse them too). Deletions are audit-logged by a
// database trigger.

export type SetupKind = "academic_year" | "grade_level" | "section" | "subject" | "grading_period"

type Link = { table: string; column: string; one: string; many: string }
const link = (table: string, column: string, one: string, many = `${one}s`): Link => ({ table, column, one, many })

const KINDS: Record<SetupKind, { table: string; label: string; path: string; instead: string; links: Link[] }> = {
  academic_year: {
    table: "academic_years",
    label: "Academic year",
    path: "/academic-years",
    instead: "Archive it instead to keep its history.",
    links: [
      link("sections", "academic_year_id", "section"),
      link("student_enrollments", "academic_year_id", "enrollment"),
      link("teacher_subject_assignments", "academic_year_id", "teaching load"),
      link("grading_periods", "academic_year_id", "grading period"),
      link("fee_structures", "academic_year_id", "fee structure"),
    ],
  },
  grade_level: {
    table: "grade_levels",
    label: "Grade level",
    path: "/grade-levels",
    instead: "Deactivate it instead to hide it from new records.",
    links: [
      link("sections", "grade_level_id", "section"),
      link("student_enrollments", "grade_level_id", "enrollment"),
      link("fee_structures", "grade_level_id", "fee structure"),
    ],
  },
  section: {
    table: "sections",
    label: "Section",
    path: "/sections",
    instead: "Deactivate it instead to hide it from new records.",
    links: [
      link("student_enrollments", "section_id", "enrollment"),
      link("teacher_subject_assignments", "section_id", "teaching load"),
      link("class_schedules", "section_id", "class schedule"),
      link("attendance_sessions", "section_id", "attendance day"),
      link("grade_records", "section_id", "grade"),
      link("assignments", "section_id", "assignment"),
      link("fee_structures", "section_id", "fee structure"),
    ],
  },
  subject: {
    table: "subjects",
    label: "Subject",
    path: "/subjects",
    instead: "Deactivate it instead to hide it from new records.",
    links: [
      link("teacher_subject_assignments", "subject_id", "teaching load"),
      link("class_schedules", "subject_id", "class schedule"),
      link("attendance_sessions", "subject_id", "attendance day"),
      link("grade_records", "subject_id", "grade"),
      link("assignments", "subject_id", "assignment"),
    ],
  },
  grading_period: {
    table: "grading_periods",
    label: "Grading period",
    path: "/grading-periods",
    instead: "Grades recorded in it must stay.",
    links: [link("grade_records", "grading_period_id", "grade")],
  },
}

const listJoin = (parts: string[]) => (parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`)

/** True when `password` is the signed-in admin's password. Uses a throwaway session, revoked at once. */
async function passwordMatches(email: string, password: string) {
  const verifier = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await verifier.auth.signInWithPassword({ email, password })
  if (error) return false
  await verifier.auth.signOut({ scope: "local" })
  return true
}

export async function deleteSetupRecord(kind: SetupKind, id: string, password: string): Promise<ActionResult> {
  const spec = KINDS[kind]
  if (!spec || !uuidSchema.safeParse(id).success) return denied()
  const ctx = await schoolAdmin()
  if (!ctx) return denied()
  if (typeof password !== "string" || password.length === 0 || password.length > 72) {
    return { ok: false, error: "Enter your password to confirm.", fieldErrors: { password: ["Enter your password"] } }
  }

  // Wrong passwords are limited per account (5 per 15 minutes); correct ones never count.
  const bucket = `delete-confirm-failed:${ctx.profile.id}`
  const tooMany = { ok: false as const, error: "Too many incorrect passwords. Please wait 15 minutes and try again." }
  if ((await rateLimitHits(bucket, 900)) >= 5) return tooMany
  if (!(await passwordMatches(ctx.profile.email, password))) {
    if (!(await hitRateLimit(bucket, 5, 900))) return tooMany
    return { ok: false, error: "That password is not correct.", fieldErrors: { password: ["Incorrect password"] } }
  }

  const supabase = await createClient()
  const { data: record } = await supabase.from(spec.table as "sections").select("id, name").eq("id", id).eq("school_id", ctx.schoolId).maybeSingle()
  if (!record) return { ok: false, error: "The record was not found or you do not have access to it." }

  // Explain what still refers to it (counted within this school only).
  const admin = createAdminClient()
  const counts = await Promise.all(
    spec.links.map(async (l) => {
      const { count } = await admin.from(l.table as "sections").select("id", { count: "exact", head: true }).eq("school_id", ctx.schoolId).eq(l.column as "id", id)
      return { l, n: count ?? 0 }
    })
  )
  const used = counts.filter((c) => c.n > 0).map(({ l, n }) => `${n} ${n === 1 ? l.one : l.many}`)
  if (used.length > 0) {
    return { ok: false, error: `“${record.name}” can't be deleted because it is used by ${listJoin(used)}. ${spec.instead}` }
  }

  const { data, error } = await supabase.from(spec.table as "sections").delete().eq("id", id).eq("school_id", ctx.schoolId).select("id")
  if (error) {
    if (error.code === "23503") return { ok: false, error: `“${record.name}” is in use and can't be deleted. ${spec.instead}` }
    if (error.code === "P0001") return { ok: false, error: error.message }
    return fail(error, "deleteSetupRecord")
  }
  if (!data?.length) return { ok: false, error: "The record was not found or you do not have access to it." }

  revalidatePath(spec.path, "layout")
  return { ok: true, message: `${spec.label} “${record.name}” deleted.` }
}
