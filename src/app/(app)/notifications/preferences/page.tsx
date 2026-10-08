import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { PreferencesGrid } from "@/components/communication/preferences-grid"
import { requirePermission } from "@/lib/auth/session"
import { myPreferences, notificationTypes } from "@/services/communication"
import { getSchoolSettings } from "@/services/settings"

export const metadata: Metadata = { title: "Notification preferences" }

export default async function PreferencesPage() {
  const ctx = await requirePermission("notifications.view")
  if (!ctx.features.includes("notifications")) redirect("/dashboard?denied=1")
  const [{ data: types }, prefs, settings] = await Promise.all([notificationTypes(), myPreferences(), getSchoolSettings(ctx.profile.school_id!)])
  const st = settings.data
  const on = (f: string) => ctx.features.includes(f)
  // Offer only the channels this school actually provides.
  const channels = [
    "in_app" as const,
    ...(on("email_notifications") && st?.email_notifications_enabled ? (["email"] as const) : []),
    ...(on("sms") && st?.sms_notifications_enabled ? (["sms"] as const) : []),
    ...(on("push_notifications") && st?.push_notifications_enabled ? (["push"] as const) : []),
  ]
  const role = ctx.profile.role
  const relevant = (types ?? []).filter((t) => {
    // Hide academic alerts that never apply to the role (e.g. teachers don't receive grade alerts).
    if (role === "teacher") return !["grade_published", "grade_updated", "attendance_absent", "attendance_late", "assignment_due", "assignment_graded", "assignment_created"].includes(t.key)
    if (role === "school_admin") return ["announcement", "school_event", "system", "account"].includes(t.key)
    return true
  })
  const mine = new Map((prefs.data ?? []).map((p) => [p.notification_type, p]))

  return (
    <>
      <PageHeader title="Notification preferences" description="Choose how you hear about each kind of update." />
      <Card className="max-w-4xl">
        <CardHeader title="Channels" description={channels.length === 1 ? "Your school currently sends notifications in the app only. Email, SMS and push appear here when your school turns them on." : undefined} />
        <PreferencesGrid
          channels={channels}
          rows={relevant.map((t) => {
            const p = mine.get(t.key)
            return {
              key: t.key,
              name: t.name,
              description: t.description,
              mandatory: t.mandatory,
              values: {
                in_app: p?.in_app_enabled ?? t.default_in_app,
                email: p?.email_enabled ?? t.default_email,
                sms: p?.sms_enabled ?? t.default_sms,
                push: p?.push_enabled ?? t.default_push,
              },
            }
          })}
        />
        <CardBody className="text-xs text-muted">
          Urgent school announcements are always shown in the app. Some messages (account and system notices) cannot be turned off.
        </CardBody>
      </Card>
    </>
  )
}
