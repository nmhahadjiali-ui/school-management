import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Pencil } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { ConfirmAction } from "@/components/ui/confirm-dialog"
import { Badge, PageHeader, StatusBadge } from "@/components/ui/misc"
import { DescriptionList } from "@/components/data/list"
import { archiveAnnouncement, publishAnnouncement, unscheduleAnnouncement } from "@/lib/actions/communication"
import { getUserId, requireActiveUser } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/dates"
import { uuidSchema } from "@/lib/validations"
import { describeTargets } from "@/server/announcements"
import { announcementDeliveryStats, audienceCount, getAnnouncement } from "@/services/communication"

export const metadata: Metadata = { title: "Announcement" }

/** Recipients see published, unexpired announcements addressed to them (RLS); managers and authors see everything. */
export default async function AnnouncementPage({ params, searchParams }: PageProps<"/announcements/[id]">) {
  const ctx = await requireActiveUser()
  const { id } = await params
  const { saved } = await searchParams
  if (!uuidSchema.safeParse(id).success || !ctx.features.includes("announcements")) notFound()
  const { data: a } = await getAnnouncement(id)
  if (!a) notFound()

  const tz = ctx.school?.timezone
  const userId = await getUserId()
  const manager = ctx.profile.role === "school_admin" || a.author_user_id === userId
  const [labels, count, stats] = manager ? await Promise.all([describeTargets([a]), audienceCount(a.id), announcementDeliveryStats(a.id)]) : [null, 0, null]
  const expired = a.expires_at !== null && new Date(a.expires_at) <= new Date()

  return (
    <>
      <PageHeader
        eyebrow="Announcement"
        title={a.title}
        description={
          <span className="inline-flex gap-2">
            {manager && (expired && a.status === "published" ? <Badge>Expired</Badge> : <StatusBadge status={a.status} />)}
            {a.priority !== "normal" && <Badge tone={a.priority === "low" ? "gray" : "red"}>{a.priority}</Badge>}
          </span>
        }
        actions={
          manager ? (
            <>
              {a.status !== "archived" && <LinkButton href={`/announcements/${a.id}/edit`} variant="secondary"><Pencil className="size-4" aria-hidden /> Edit</LinkButton>}
              {a.status === "draft" && (
                <ConfirmAction size="md" trigger="Publish" title="Publish this announcement?" description={`It will be delivered to ${count} recipient${count === 1 ? "" : "s"} now, or at the scheduled time if one is set.`} confirmLabel="Publish" onConfirm={publishAnnouncement.bind(null, a.id)} />
              )}
              {a.status === "scheduled" && (
                <ConfirmAction size="md" trigger="Unschedule" title="Move back to drafts?" description="It will not be published automatically." confirmLabel="Unschedule" onConfirm={unscheduleAnnouncement.bind(null, a.id)} />
              )}
              {a.status !== "archived" && (
                <ConfirmAction destructive size="md" trigger="Archive" title="Archive this announcement?" description="It disappears from feeds but stays in the records. This cannot be undone." confirmLabel="Archive" onConfirm={archiveAnnouncement.bind(null, a.id)} />
              )}
            </>
          ) : null
        }
      />
      {saved === "publish" && <Alert tone="success" className="mb-6">{a.status === "scheduled" ? `Scheduled for ${formatDateTime(a.publish_at, tz)}.` : `Published to ${stats?.recipients ?? count} recipient(s).`}</Alert>}
      {saved === "draft" && <Alert tone="info" className="mb-6">Saved.</Alert>}
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardBody>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{a.content}</p>
            <p className="mt-6 text-xs text-muted">{a.published_at ? `Published ${formatDateTime(a.published_at, tz)}` : "Not published yet"}{a.expires_at ? ` · ${expired ? "Expired" : "Expires"} ${formatDateTime(a.expires_at, tz)}` : ""}</p>
          </CardBody>
        </Card>
        {manager && (
          <Card className="self-start">
            <CardHeader title="Audience & delivery" />
            <CardBody>
              <DescriptionList
                items={[
                  ["Audience", <ul key="a" className="list-disc pl-4">{(labels?.get(a.id) ?? []).map((l) => <li key={l}>{l}</li>)}</ul>],
                  ["Reaches", `${count} account${count === 1 ? "" : "s"} (current)`],
                  ["Notified", stats?.recipients === null || stats === null ? "—" : `${stats.recipients} account${stats.recipients === 1 ? "" : "s"}`],
                  ["Publish", a.publish_at ? formatDateTime(a.publish_at, tz) : "Immediately"],
                  ["Expires", a.expires_at ? formatDateTime(a.expires_at, tz) : "Never"],
                ]}
              />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  )
}
