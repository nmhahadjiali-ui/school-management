import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { Award, Bell, CalendarClock, CheckSquare, Megaphone, NotebookPen, Settings2 } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, TableSkeleton } from "@/components/data/list"
import { NotificationActions } from "@/components/communication/notification-actions"
import { markNotificationsRead } from "@/lib/actions/operations"
import { requirePermission } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/dates"
import { listHref, parseListParams, type SearchParams } from "@/lib/list-params"
import { cn } from "@/lib/utils"
import { listNotifications, notificationTypes, NOTIFICATION_SORTS } from "@/services/communication"

export const metadata: Metadata = { title: "Notifications" }

const ICONS: Record<string, typeof Bell> = {
  announcement: Megaphone, school_event: Megaphone, assignment_created: NotebookPen, assignment_due: NotebookPen,
  assignment_graded: NotebookPen, attendance_absent: CheckSquare, attendance_late: CheckSquare,
  grade_published: Award, grade_updated: Award, schedule_changed: CalendarClock,
}
const VIEWS = [["", "All"], ["unread", "Unread"], ["read", "Read"]] as const

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const ctx = await requirePermission("notifications.view")
  if (!ctx.features.includes("notifications")) redirect("/dashboard?denied=1")
  const sp = await searchParams
  const { data: types } = await notificationTypes()
  const view = sp.view === "unread" || sp.view === "read" ? sp.view : ""

  return (
    <>
      <PageHeader
        title="Notifications"
        actions={
          <>
            <LinkButton href="/notifications/preferences" variant="secondary"><Settings2 className="size-4" aria-hidden /> Preferences</LinkButton>
            <ConfirmAction size="md" trigger="Mark all as read" title="Mark all notifications as read?" description="They stay in your list." confirmLabel="Mark as read" onConfirm={markNotificationsRead.bind(null, null)} />
          </>
        }
      />
      <Card>
        <nav aria-label="Filter by status" className="flex gap-1 border-b border-border px-3 py-2">
          {VIEWS.map(([v, label]) => (
            <Link
              key={label}
              href={listHref("/notifications", sp, { view: v || null, page: null })}
              aria-current={view === v ? "page" : undefined}
              className={cn("rounded-md px-3 py-1.5 text-sm font-medium", view === v ? "bg-brand/10 text-brand" : "text-slate-600 hover:bg-slate-100")}
            >
              {label}
            </Link>
          ))}
        </nav>
        <ListToolbar searchPlaceholder="Search titles…" filters={[{ name: "type", label: "Types", options: (types ?? []).map((t) => ({ value: t.key, label: t.name })) }]} />
        <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
          <NotificationList sp={sp} timezone={ctx.school?.timezone} />
        </Suspense>
      </Card>
    </>
  )
}

async function NotificationList({ sp, timezone }: { sp: SearchParams; timezone?: string }) {
  const p = parseListParams(sp, { sorts: NOTIFICATION_SORTS, defaultSort: "created_at", filters: ["view", "type"] })
  if (p.filters.type && !/^[a-z_]{2,50}$/.test(p.filters.type)) delete p.filters.type
  const page = await listNotifications(p)
  if (page.error) return <Alert tone="error" className="m-4">Notifications could not be loaded.</Alert>
  if (page.total === 0) return <EmptyState title={p.filters.view === "unread" ? "No unread notifications" : "No notifications"} description="Announcements, grades, attendance alerts and assignment updates appear here." />
  return (
    <>
      <ul className="divide-y divide-border">
        {page.rows.map((n) => {
          const Icon = ICONS[n.type] ?? Bell
          return (
            <li key={n.id} className={cn("flex items-start gap-3 px-5 py-3", !n.read_at && "bg-brand/5")}>
              <Icon className={cn("mt-0.5 size-5 shrink-0", n.read_at ? "text-slate-300" : "text-brand")} aria-hidden />
              <a href={`/notifications/${n.id}/open`} className="min-w-0 flex-1 hover:underline-offset-2">
                <p className={cn("text-sm", !n.read_at && "font-semibold")}>
                  {n.title}
                  {(n.priority === "high" || n.priority === "urgent") && <span className="ml-2"><Badge tone="red">{n.priority}</Badge></span>}
                </p>
                <p className="text-sm text-muted">{n.message}</p>
                <p className="mt-0.5 text-xs text-muted">{formatDateTime(n.created_at, timezone)}</p>
              </a>
              <NotificationActions id={n.id} read={Boolean(n.read_at)} />
            </li>
          )
        })}
      </ul>
      <Pagination pathname="/notifications" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}
