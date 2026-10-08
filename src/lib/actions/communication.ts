"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"
import { denied, invalid, type ActionResult } from "@/lib/action-result"
import { dbFail, manage } from "@/lib/actions/helpers"
import { authorize } from "@/lib/auth/session"
import { zonedToIso } from "@/lib/dates"
import { createClient } from "@/lib/supabase/server"
import { uuidSchema } from "@/lib/validations"
import * as comm from "@/services/communication"
import type { UserContext } from "@/types/domain"

const valid = (...ids: string[]) => ids.every((id) => uuidSchema.safeParse(id).success)
const badId = { ok: false as const, error: "The record was not found or you do not have access to it." }
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter a valid date and time")
const optionalLocal = z.preprocess((v) => (v === "" || v === undefined ? null : v), localDateTime.nullable())

const targetSchema = z.object({
  target_type: z.enum(["school", "grade_level", "section", "class", "user"]),
  // Ignored (replaced by the session's school) for "school" targets.
  target_id: z.uuid().nullable(),
  roles: z.array(z.enum(["school_admin", "teacher", "student", "parent"])).min(1).nullable(),
})

const announcementSchema = z
  .object({
    id: z.uuid().nullable(),
    title: z.string().trim().min(1, "Title is required").max(200),
    content: z.string().trim().min(1, "Write the announcement").max(20000),
    priority: z.enum(["low", "normal", "high", "urgent"]),
    publish_at: optionalLocal,
    expires_at: optionalLocal,
    targets: z.array(targetSchema).max(50),
    intent: z.enum(["draft", "publish"]),
  })
  .refine((v) => v.intent === "draft" || v.targets.length > 0, { path: ["targets"], message: "Choose who should receive this announcement" })
  .refine((v) => !v.publish_at || !v.expires_at || v.publish_at < v.expires_at, { path: ["expires_at"], message: "Expiry must be after the publish time" })
  .refine((v) => v.targets.every((t) => t.target_type === "school" || t.target_id), { path: ["targets"], message: "Complete every audience row" })

/** School admin, or a teacher when the school allows teacher announcements. */
async function announcer(): Promise<(UserContext & { schoolId: string; isAdmin: boolean }) | null> {
  const ctx = (await authorize("school.records.manage")) ?? (await authorize("teacher.academics"))
  if (!ctx?.profile.school_id || !ctx.features.includes("announcements")) return null
  const isAdmin = ctx.profile.role === "school_admin"
  if (!isAdmin) {
    const supabase = await createClient()
    const { data } = await supabase.from("school_settings").select("teachers_can_announce").eq("school_id", ctx.profile.school_id).single()
    if (!data?.teachers_can_announce || ctx.record?.type !== "teacher") return null
  }
  return { ...ctx, schoolId: ctx.profile.school_id, isAdmin }
}

// --- Announcements ------------------------------------------------------------------------
export async function saveAnnouncement(input: z.input<typeof announcementSchema>): Promise<ActionResult> {
  const actor = await announcer()
  if (!actor) return denied()
  const parsed = announcementSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const d = parsed.data
  const tz = actor.school?.timezone
  const fields = {
    title: d.title,
    content: d.content,
    priority: d.priority,
    publish_at: d.publish_at ? zonedToIso(d.publish_at, tz) : null,
    expires_at: d.expires_at ? zonedToIso(d.expires_at, tz) : null,
  }

  let id = d.id
  if (id) {
    const { error } = await comm.updateAnnouncement(id, fields)
    if (error) return error.code === "PGRST116" ? badId : dbFail(error, "saveAnnouncement.update")
  } else {
    const { data, error } = await comm.createAnnouncement({ ...fields, school_id: actor.schoolId })
    if (error || !data) return dbFail(error, "saveAnnouncement.create")
    id = data.id
  }

  const current = await comm.getAnnouncement(id)
  if (!current.data) return badId
  if (current.data.status === "draft" || current.data.status === "scheduled") {
    const targets = d.targets.map((t) => ({
      target_type: t.target_type,
      target_id: t.target_type === "school" ? actor.schoolId : t.target_id!,
      roles: t.roles,
    }))
    const { error } = await comm.replaceTargets(id, actor.schoolId, targets)
    if (error) return dbFail(error, "saveAnnouncement.targets")
  }

  if (d.intent === "publish") {
    const { error } = await comm.publishAnnouncement(id)
    if (error) return dbFail(error, "saveAnnouncement.publish")
  }
  revalidatePath("/announcements", "layout")
  revalidatePath("/dashboard")
  redirect(`/announcements/${id}?saved=${d.intent}`)
}

export async function publishAnnouncement(id: string): Promise<ActionResult> {
  if (!valid(id)) return badId
  if (!(await announcer())) return denied()
  const { data, error } = await comm.publishAnnouncement(id)
  if (error) return dbFail(error, "publishAnnouncement")
  revalidatePath("/announcements", "layout")
  return { ok: true, message: data === "scheduled" ? "Announcement scheduled." : "Announcement published and recipients notified." }
}

export async function archiveAnnouncement(id: string): Promise<ActionResult> {
  if (!valid(id)) return badId
  if (!(await announcer())) return denied()
  const { error } = await comm.updateAnnouncement(id, { status: "archived" })
  if (error) return error.code === "PGRST116" ? badId : dbFail(error, "archiveAnnouncement")
  revalidatePath("/announcements", "layout")
  return { ok: true, message: "Announcement archived. It is kept for your records." }
}

export async function unscheduleAnnouncement(id: string): Promise<ActionResult> {
  if (!valid(id)) return badId
  if (!(await announcer())) return denied()
  const { error } = await comm.updateAnnouncement(id, { status: "draft" })
  if (error) return error.code === "PGRST116" ? badId : dbFail(error, "unscheduleAnnouncement")
  revalidatePath("/announcements", "layout")
  return { ok: true, message: "Moved back to drafts." }
}

// --- Notification center -------------------------------------------------------------------
async function member() {
  return authorize("notifications.view")
}

export async function setRead(ids: string[], read: boolean): Promise<ActionResult> {
  if (!(await member())) return denied()
  if (ids.length === 0 || ids.length > 200 || !valid(...ids)) return badId
  const { error } = await comm.setNotificationsRead(ids, read)
  if (error) return dbFail(error, "setRead")
  revalidatePath("/", "layout")
  return { ok: true }
}

export async function dismiss(ids: string[]): Promise<ActionResult> {
  if (!(await member())) return denied()
  if (ids.length === 0 || ids.length > 200 || !valid(...ids)) return badId
  const { error } = await comm.dismissNotifications(ids)
  if (error) return dbFail(error, "dismiss")
  revalidatePath("/", "layout")
  return { ok: true, message: "Dismissed." }
}

// --- Preferences ------------------------------------------------------------------------------
const preferenceSchema = z.object({
  notification_type: z.string().regex(/^[a-z][a-z_]{1,49}$/),
  in_app_enabled: z.boolean(),
  email_enabled: z.boolean(),
  sms_enabled: z.boolean(),
  push_enabled: z.boolean(),
})

export async function savePreference(input: z.input<typeof preferenceSchema>): Promise<ActionResult> {
  const ctx = await member()
  if (!ctx?.profile.school_id) return denied()
  const parsed = preferenceSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims?.sub) return denied()
  // user_id and school_id come from the session; RLS enforces the same.
  const { error } = await comm.upsertPreference({ ...parsed.data, user_id: claims.claims.sub, school_id: ctx.profile.school_id })
  if (error) return dbFail(error, "savePreference")
  return { ok: true, message: "Preference saved." }
}

// --- School communication settings (school admins) ---------------------------------------------
const commSettingsSchema = z.object({
  notifications_enabled: z.preprocess((v) => v === "on", z.boolean()),
  email_notifications_enabled: z.preprocess((v) => v === "on", z.boolean()),
  sms_notifications_enabled: z.preprocess((v) => v === "on", z.boolean()),
  push_notifications_enabled: z.preprocess((v) => v === "on", z.boolean()),
  teachers_can_announce: z.preprocess((v) => v === "on", z.boolean()),
})

export async function updateCommunicationSettings(_p: ActionResult | null, fd: FormData) {
  return manage(
    fd,
    commSettingsSchema,
    async (d, ctx) => {
      const supabase = await createClient()
      return supabase.from("school_settings").update(d).eq("school_id", ctx.schoolId).select("id").single()
    },
    { context: "updateCommunicationSettings", success: "Communication settings saved.", revalidate: ["/settings"] }
  )
}
