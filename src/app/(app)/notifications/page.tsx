import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Award, Bell, CheckSquare, NotebookPen } from "lucide-react"
import { Card } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { EmptyState, PageHeader } from "@/components/ui/misc"
import { markNotificationsRead } from "@/lib/actions/operations"
import { requirePermission } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/dates"
import { cn } from "@/lib/utils"
import { myNotifications } from "@/services/operations"
import type { Json } from "@/types/database"

export const metadata: Metadata = { title: "Notifications" }

const ICONS = { assignment_created: NotebookPen, assignment_due: NotebookPen, attendance_recorded: CheckSquare, grade_published: Award }

/** Where a notification leads, from its data payload (never trusted for authorization: the target page re-checks). */
function hrefFor(type: string, data: Json) {
  const d = (data ?? {}) as Record<string, string>
  if (d.assignment_id) return `/coursework/${d.assignment_id}`
  if (d.student_id && (type === "grade_published" || type === "attendance_recorded")) return `/students/${d.student_id}`
  return null
}

export default async function NotificationsPage() {
  const ctx = await requirePermission("notifications.view")
  if (!ctx.features.includes("notifications")) redirect("/dashboard?denied=1")
  const { data } = await myNotifications(100)
  const items = data ?? []
  const unread = items.filter((n) => !n.read_at).length

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} unread` : "You're all caught up."}
        actions={unread ? <ConfirmAction size="md" trigger="Mark all as read" title="Mark all notifications as read?" description="They stay in your list." confirmLabel="Mark as read" onConfirm={markNotificationsRead.bind(null, null)} /> : null}
      />
      <Card>
        {items.length === 0 ? (
          <EmptyState title="No notifications yet" description="New assignments, published grades and attendance updates appear here." />
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => {
              const Icon = ICONS[n.type as keyof typeof ICONS] ?? Bell
              const href = hrefFor(n.type, n.data)
              const body = (
                <div className="flex gap-3">
                  <Icon className={cn("mt-0.5 size-5 shrink-0", n.read_at ? "text-slate-300" : "text-brand")} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", !n.read_at && "font-semibold")}>{n.title}</p>
                    <p className="text-sm text-muted">{n.message}</p>
                    <p className="mt-0.5 text-xs text-muted">{formatDateTime(n.created_at, ctx.school?.timezone)}</p>
                  </div>
                  {!n.read_at && <span className="mt-1.5 size-2 rounded-full bg-brand" aria-label="Unread" />}
                </div>
              )
              return (
                <li key={n.id} className={cn(!n.read_at && "bg-brand/5")}>
                  {href ? <Link href={href} className="block px-5 py-3 hover:bg-slate-50">{body}</Link> : <div className="px-5 py-3">{body}</div>}
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </>
  )
}
