import Link from "next/link"
import { Card, CardHeader } from "@/components/ui/card"
import { Badge, EmptyState } from "@/components/ui/misc"
import { formatDateTime } from "@/lib/dates"
import { announcementFeed } from "@/services/communication"

/** Latest active announcements for the viewer (RLS decides which). */
export async function AnnouncementsCard({ schoolId, timezone }: { schoolId: string; timezone?: string }) {
  const { data } = await announcementFeed(schoolId, 3)
  return (
    <Card>
      <CardHeader title="Announcements" action={<Link href="/announcements" className="text-sm font-medium text-brand hover:underline">View all</Link>} />
      {data.length === 0 ? (
        <EmptyState title="No announcements right now" />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((a) => (
            <li key={a.id} className="px-5 py-3">
              <Link href={`/announcements/${a.id}`} className="text-sm font-medium text-brand hover:underline">{a.title}</Link>
              {(a.priority === "high" || a.priority === "urgent") && <span className="ml-2"><Badge tone="red">{a.priority}</Badge></span>}
              <p className="line-clamp-2 text-sm text-muted">{a.content}</p>
              <p className="text-xs text-muted">{formatDateTime(a.published_at, timezone)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
