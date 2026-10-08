import "server-only"
import { createClient } from "@/lib/supabase/server"
import { likePattern, pageRange, type ListParams } from "@/lib/list-params"
import type { Json, TablesInsert, TablesUpdate } from "@/types/database"
import type { AnnouncementStatus, AnnouncementTargetType, AppRole } from "@/types/domain"

// Data access for Phase 4 (communication). Runs as the signed-in user: RLS
// limits notifications to their recipient, announcements to their audience,
// and delivery logs / SMS usage to school administrators.

const COUNT = { count: "exact" } as const

// --- Notification center --------------------------------------------------------------
export const NOTIFICATION_SORTS = ["created_at"] as const

export async function listNotifications(p: ListParams<(typeof NOTIFICATION_SORTS)[number]>) {
  const supabase = await createClient()
  let query = supabase
    .from("notifications")
    .select("id, type, title, message, data, priority, read_at, created_at, expires_at", COUNT)
    .eq("show_in_app", true)
    .is("dismissed_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
  if (p.filters.view === "unread") query = query.is("read_at", null)
  if (p.filters.view === "read") query = query.not("read_at", "is", null)
  if (p.filters.type) query = query.eq("type", p.filters.type)
  if (p.q) query = query.ilike("title", likePattern(p.q))
  const { data, count, error } = await query.order("created_at", { ascending: false }).range(...pageRange(p))
  return { rows: data ?? [], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

/** Unread count + a few recent items for the bell (one round trip each, indexed). */
export async function bellSummary() {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const [unread, recent] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("show_in_app", true).is("read_at", null).is("dismissed_at", null).or(`expires_at.is.null,expires_at.gt.${now}`),
    supabase
      .from("notifications")
      .select("id, type, title, message, read_at, created_at, priority")
      .eq("show_in_app", true)
      .is("dismissed_at", null)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: false })
      .limit(6),
  ])
  return { unread: unread.count ?? 0, recent: recent.data ?? [] }
}

export async function getNotification(id: string) {
  const supabase = await createClient()
  return supabase.from("notifications").select("id, type, data, read_at").eq("id", id).maybeSingle()
}

export async function setNotificationsRead(ids: string[], read: boolean) {
  const supabase = await createClient()
  return supabase.from("notifications").update({ read_at: read ? new Date().toISOString() : null }).in("id", ids).select("id")
}

export async function dismissNotifications(ids: string[]) {
  const supabase = await createClient()
  return supabase.from("notifications").update({ dismissed_at: new Date().toISOString() }).in("id", ids).select("id")
}

/**
 * Where a notification leads. Built only from the TYPE and entity ids; the
 * destination page re-authorizes, so a tampered payload just shows a 404.
 */
export function deepLink(type: string, data: Json): string {
  const d = (data && typeof data === "object" && !Array.isArray(data) ? data : {}) as Record<string, unknown>
  const id = typeof d.entity_id === "string" && /^[0-9a-f-]{36}$/i.test(d.entity_id) ? d.entity_id : null
  const student = typeof d.student_id === "string" && /^[0-9a-f-]{36}$/i.test(d.student_id) ? d.student_id : null
  switch (d.entity_type) {
    case "announcement":
      return id ? `/announcements/${id}` : "/announcements"
    case "assignment":
      return id ? `/coursework/${id}` : "/coursework"
    case "grade":
    case "attendance":
      return student ? `/students/${student}` : "/dashboard"
    case "schedule":
      return "/schedule"
    default:
      return type === "announcement" ? "/announcements" : "/notifications"
  }
}

// --- Preferences --------------------------------------------------------------------------
export async function notificationTypes() {
  const supabase = await createClient()
  return supabase.from("notification_types").select("*").order("category").order("name")
}

export async function myPreferences() {
  const supabase = await createClient()
  return supabase.from("notification_preferences").select("*")
}

export async function upsertPreference(row: TablesInsert<"notification_preferences">) {
  const supabase = await createClient()
  return supabase.from("notification_preferences").upsert(row, { onConflict: "user_id,notification_type" }).select("id").single()
}

// --- Announcements ------------------------------------------------------------------------
export const ANNOUNCEMENT_SORTS = ["created_at", "publish_at", "title"] as const

const ANNOUNCEMENT_SELECT = "*, targets:announcement_targets(id, target_type, target_id, roles)" as const

export type AnnouncementRow = {
  id: string
  school_id: string
  author_user_id: string | null
  title: string
  content: string
  priority: "low" | "normal" | "high" | "urgent"
  status: AnnouncementStatus
  publish_at: string | null
  expires_at: string | null
  published_at: string | null
  created_at: string
  targets: { id: string; target_type: AnnouncementTargetType; target_id: string; roles: AppRole[] | null }[]
}

/** Management list (school admins: all of the school; teachers: their own). */
export async function listAnnouncements(schoolId: string, p: ListParams<(typeof ANNOUNCEMENT_SORTS)[number]>, authorId?: string) {
  const supabase = await createClient()
  let query = supabase.from("announcements").select(ANNOUNCEMENT_SELECT, COUNT).eq("school_id", schoolId)
  if (authorId) query = query.eq("author_user_id", authorId)
  if (p.filters.status) query = query.eq("status", p.filters.status as AnnouncementStatus)
  if (p.q) query = query.ilike("title", likePattern(p.q))
  const { data, count, error } = await query.order(p.sort, { ascending: p.dir === "asc", nullsFirst: false }).range(...pageRange(p))
  return { rows: (data ?? []) as unknown as AnnouncementRow[], total: count ?? 0, page: p.page, pageSize: p.pageSize, error }
}

/** Active announcements addressed to the viewer (RLS: published, not expired, targeted). */
export async function announcementFeed(schoolId: string, limit = 20) {
  const supabase = await createClient()
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, content, priority, published_at, expires_at, author_user_id")
    .eq("school_id", schoolId)
    .eq("status", "published")
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order("published_at", { ascending: false })
    .limit(limit)
  return { data: data ?? [], error }
}

export async function getAnnouncement(id: string) {
  const supabase = await createClient()
  const { data, error } = await supabase.from("announcements").select(ANNOUNCEMENT_SELECT).eq("id", id).maybeSingle()
  return { data: data as unknown as AnnouncementRow | null, error }
}

export async function createAnnouncement(row: TablesInsert<"announcements">) {
  const supabase = await createClient()
  return supabase.from("announcements").insert(row).select("id").single()
}

export async function updateAnnouncement(id: string, row: TablesUpdate<"announcements">) {
  const supabase = await createClient()
  return supabase.from("announcements").update(row).eq("id", id).select("id").single()
}

/** Replace an unpublished announcement's audience (moderated by the database). */
export async function replaceTargets(announcementId: string, schoolId: string, targets: { target_type: AnnouncementTargetType; target_id: string; roles: AppRole[] | null }[]) {
  const supabase = await createClient()
  const del = await supabase.from("announcement_targets").delete().eq("announcement_id", announcementId)
  if (del.error) return del
  if (targets.length === 0) return { error: null }
  return supabase.from("announcement_targets").insert(targets.map((t) => ({ ...t, announcement_id: announcementId, school_id: schoolId })))
}

export async function publishAnnouncement(id: string) {
  const supabase = await createClient()
  return supabase.rpc("publish_announcement", { p_id: id })
}

export async function audienceCount(id: string) {
  const supabase = await createClient()
  const { data } = await supabase.rpc("announcement_audience_count", { p_id: id })
  return data ?? 0
}

/** Delivery summary for one announcement (admins; RLS hides it from others). */
export async function announcementDeliveryStats(id: string) {
  const supabase = await createClient()
  const { data: notes } = await supabase.from("notifications").select("id").eq("event_key", `announcement:${id}`)
  return { recipients: notes?.length ?? null }
}

// --- School communication: settings, usage, delivery health ---------------------------------
export async function smsUsage(schoolId: string) {
  const supabase = await createClient()
  return supabase.from("sms_usage").select("*").eq("school_id", schoolId).order("year", { ascending: false }).order("month", { ascending: false }).limit(12)
}

export async function deliverySummary(schoolId: string) {
  const supabase = await createClient()
  const since = new Date(Date.now() - 30 * 864e5).toISOString()
  const { data } = await supabase.from("notification_deliveries").select("channel, status").eq("school_id", schoolId).gte("created_at", since).limit(10000)
  const summary: Record<string, Record<string, number>> = {}
  for (const d of data ?? []) {
    summary[d.channel] ??= {}
    summary[d.channel][d.status] = (summary[d.channel][d.status] ?? 0) + 1
  }
  return summary
}

export async function recentFailures(schoolId: string) {
  const supabase = await createClient()
  return supabase
    .from("notification_deliveries")
    .select("id, channel, error_message, attempts, failed_at, provider")
    .eq("school_id", schoolId)
    .eq("status", "failed")
    .order("failed_at", { ascending: false })
    .limit(10)
}
