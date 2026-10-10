"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { authorize } from "@/lib/auth/session"
import { denied, fail, formToObject, invalid, type ActionResult } from "@/lib/action-result"
import { createSchoolSchema, updateSchoolSchema, uuidSchema } from "@/lib/validations"
import * as schools from "@/services/schools"
import * as features from "@/services/features"
import type { SchoolStatus } from "@/types/domain"

const notFound = { ok: false as const, error: "The school was not found or you do not have access to it." }

export async function createSchool(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!(await authorize("platform.schools.manage"))) return denied()
  const parsed = createSchoolSchema.safeParse(formToObject(formData))
  if (!parsed.success) return invalid(parsed.error)

  const { data, error } = await schools.createSchool(parsed.data)
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Please correct the highlighted fields.", fieldErrors: { code: ["This code is already in use"] } }
    }
    return fail(error, "createSchool")
  }
  revalidatePath("/platform", "layout")
  redirect(`/platform/schools/${data.id}?created=1`)
}

/** Super admin edits any school; a school admin edits only their own (RLS + check below). */
export async function updateSchool(schoolId: string, _prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (!uuidSchema.safeParse(schoolId).success) return notFound
  const ctx = (await authorize("platform.schools.manage")) ?? (await authorize("school.manage"))
  if (!ctx) return denied()
  if (ctx.profile.role !== "super_admin" && ctx.profile.school_id !== schoolId) return denied()

  const parsed = updateSchoolSchema.safeParse(formToObject(formData))
  if (!parsed.success) return invalid(parsed.error)

  const { error } = await schools.updateSchool(schoolId, parsed.data)
  if (error) return error.code === "PGRST116" ? notFound : fail(error, "updateSchool")
  revalidatePath("/", "layout")
  return { ok: true, message: "School details saved." }
}

export async function setSchoolStatus(schoolId: string, status: SchoolStatus): Promise<ActionResult> {
  if (!(await authorize("platform.schools.manage"))) return denied()
  if (!uuidSchema.safeParse(schoolId).success || !["active", "inactive"].includes(status)) return notFound

  const { error } = await schools.setSchoolStatus(schoolId, status)
  if (error) return error.code === "PGRST116" ? notFound : fail(error, "setSchoolStatus")
  revalidatePath("/platform", "layout")
  return { ok: true, message: status === "active" ? "School activated." : "School deactivated." }
}

export async function setSchoolFeature(schoolId: string, featureKey: string, enabled: boolean): Promise<ActionResult> {
  if (!(await authorize("platform.schools.manage"))) return denied()
  if (!uuidSchema.safeParse(schoolId).success || !/^[a-z][a-z0-9_]{1,49}$/.test(featureKey)) return notFound

  const { data: catalog } = await features.listFeatureCatalog()
  const availability = catalog?.find((f) => f.key === featureKey)?.availability
  if (enabled && availability === "coming_soon") return { ok: false, error: "This feature is coming soon and cannot be enabled yet." }

  const { error } = await features.setSchoolFeature(schoolId, featureKey, enabled)
  if (error) return fail(error, "setSchoolFeature")
  revalidatePath(`/platform/schools/${schoolId}`)
  return { ok: true, message: enabled ? "Feature enabled." : "Feature disabled." }
}
