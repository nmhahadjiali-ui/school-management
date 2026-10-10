"use server"

import { manage } from "@/lib/actions/helpers"
import { numberingSettingsSchema } from "@/lib/validations/school"

import { revalidatePath } from "next/cache"
import { authorize } from "@/lib/auth/session"
import { denied, fail, formToObject, invalid, type ActionResult } from "@/lib/action-result"
import { schoolSettingsSchema, updateProfileSchema } from "@/lib/validations"
import { updateSchool } from "@/services/schools"
import { updateSchoolSettings as saveSettings } from "@/services/settings"
import { updateOwnProfile } from "@/services/users"
import { createClient } from "@/lib/supabase/server"

/** School admin: settings for their own school. The school id comes from the session, never the form. */
export async function updateSchoolSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await authorize("school.settings.manage")
  const schoolId = ctx?.profile.school_id
  if (!schoolId) return denied()

  const parsed = schoolSettingsSchema.safeParse(formToObject(formData))
  if (!parsed.success) return invalid(parsed.error)
  // The logo is uploaded separately (lib/actions/images.ts).
  const { timezone, ...settings } = parsed.data

  const [school, saved] = await Promise.all([
    updateSchool(schoolId, { timezone }),
    saveSettings(schoolId, settings),
  ])
  const error = school.error ?? saved.error
  if (error) return fail(error, "updateSchoolSettings")
  revalidatePath("/", "layout")
  return { ok: true, message: "Settings saved." }
}

/** Any active user: their own contact details. Role/status are not accepted here. */
export async function updateProfile(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await authorize("profile.self")
  if (!ctx) return denied()
  const parsed = updateProfileSchema.safeParse(formToObject(formData))
  if (!parsed.success) return invalid(parsed.error)

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims?.sub) return denied()

  const { error } = await updateOwnProfile(data.claims.sub, parsed.data)
  if (error) return fail(error, "updateProfile")
  revalidatePath("/", "layout")
  return { ok: true, message: "Profile saved." }
}

/** School admin: automatic student / employee numbers (format and next counter value). */
export async function updateNumberingSettings(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return manage(
    formData,
    numberingSettingsSchema,
    async (d, ctx) => {
      const supabase = await createClient()
      return supabase.from("school_settings").update(d).eq("school_id", ctx.schoolId).select("id").single()
    },
    { context: "updateNumberingSettings", success: "Numbering settings saved.", revalidate: ["/settings", "/students/new", "/teachers/new"] }
  )
}
