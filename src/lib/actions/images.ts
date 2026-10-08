"use server"

import { revalidatePath } from "next/cache"
import { denied, fail, type ActionResult } from "@/lib/action-result"
import { schoolAdmin } from "@/lib/actions/helpers"
import { authorize } from "@/lib/auth/session"
import { LOGO_PATH, STUDENT_PHOTO_PATH, USER_PHOTO_PATH } from "@/lib/images"
import { createClient } from "@/lib/supabase/server"
import { uuidSchema } from "@/lib/validations"

// Pictures are uploaded by the browser straight to Storage with the user's
// own session (Storage RLS + bucket limits decide). These actions then record
// the uploaded path on the record — after checking, again, who may change it
// and that the path belongs to that record — and delete the picture it replaces.

const LOGO_PUBLIC_MARKER = "/storage/v1/object/public/school-logos/"
const badPath: ActionResult = { ok: false, error: "The uploaded picture does not belong to this record." }

async function removeObject(bucket: "school-logos" | "photos", path: string | null | undefined) {
  if (!path) return
  const supabase = await createClient()
  const { error } = await supabase.storage.from(bucket).remove([path])
  if (error) console.error("[images.remove]", bucket, error.message)
}

/** Super admin (any school) or the school's admin. `path` null removes the logo. */
export async function setSchoolLogo(schoolId: string, path: string | null): Promise<ActionResult> {
  if (!uuidSchema.safeParse(schoolId).success) return denied()
  const ctx = (await authorize("platform.schools.manage")) ?? (await authorize("school.settings.manage"))
  if (!ctx || (ctx.profile.role !== "super_admin" && ctx.profile.school_id !== schoolId)) return denied()
  if (path !== null && !LOGO_PATH(schoolId).test(path)) return badPath

  const supabase = await createClient()
  const { data: school } = await supabase.from("schools").select("logo_url").eq("id", schoolId).maybeSingle()
  if (!school) return denied()
  const logo_url = path ? supabase.storage.from("school-logos").getPublicUrl(path).data.publicUrl : null
  const { error } = await supabase.from("schools").update({ logo_url }).eq("id", schoolId).select("id").single()
  if (error) {
    await removeObject("school-logos", path)
    return fail(error, "setSchoolLogo")
  }
  const old = school.logo_url?.split(LOGO_PUBLIC_MARKER)[1]
  if (old && old !== path) await removeObject("school-logos", decodeURIComponent(old))
  revalidatePath("/", "layout")
  return { ok: true, message: path ? "Logo updated." : "Logo removed." }
}

/** Any signed-in user: their own profile photo. */
export async function setMyAvatar(path: string | null): Promise<ActionResult> {
  const ctx = await authorize("profile.self")
  if (!ctx) return denied()
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims?.sub
  if (!userId) return denied()
  if (path !== null && !USER_PHOTO_PATH(ctx.profile.school_id ?? "platform", userId).test(path)) return badPath

  const old = ctx.profile.avatar_path
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("user_id", userId).select("id").single()
  if (error) {
    await removeObject("photos", path)
    return fail(error, "setMyAvatar")
  }
  if (old && old !== path) await removeObject("photos", old)
  revalidatePath("/", "layout")
  return { ok: true, message: path ? "Photo updated." : "Photo removed." }
}

/** School admin: a student's photo. */
export async function setStudentPhoto(studentId: string, path: string | null): Promise<ActionResult> {
  if (!uuidSchema.safeParse(studentId).success) return denied()
  const ctx = await schoolAdmin()
  if (!ctx) return denied()
  const supabase = await createClient()
  const { data: student } = await supabase.from("students").select("id, school_id, photo_path").eq("id", studentId).maybeSingle()
  if (!student || student.school_id !== ctx.schoolId) return denied()
  if (path !== null && !STUDENT_PHOTO_PATH(ctx.schoolId, studentId).test(path)) return badPath

  const { error } = await supabase.from("students").update({ photo_path: path }).eq("id", studentId).select("id").single()
  if (error) {
    await removeObject("photos", path)
    return fail(error, "setStudentPhoto")
  }
  if (student.photo_path && student.photo_path !== path) await removeObject("photos", student.photo_path)
  revalidatePath(`/students/${studentId}`)
  return { ok: true, message: path ? "Photo updated." : "Photo removed." }
}
