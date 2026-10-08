import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card, CardHeader } from "@/components/ui/card"
import { Badge, EmptyState, PageHeader, StatusBadge, Table, Td, Th } from "@/components/ui/misc"
import { ListToolbar } from "@/components/data/list-toolbar"
import { Pagination, SortTh, TableSkeleton } from "@/components/data/list"
import { requireActiveUser, getUserId } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/dates"
import { parseListParams, type SearchParams } from "@/lib/list-params"
import { canAuthor, describeTargets } from "@/server/announcements"
import { ANNOUNCEMENT_SORTS, announcementFeed, listAnnouncements } from "@/services/communication"
import type { UserContext } from "@/types/domain"

export const metadata: Metadata = { title: "Announcements" }

const STATUSES = ["draft", "scheduled", "published", "archived"]

export default async function AnnouncementsPage({ searchParams }: PageProps<"/announcements">) {
  const ctx = await requireActiveUser()
  if (!ctx.profile.school_id || !ctx.features.includes("announcements")) redirect("/dashboard?denied=1")
  const sp = await searchParams
  const isAdmin = ctx.profile.role === "school_admin"
  const author = await canAuthor(ctx)

  return (
    <>
      <PageHeader
        title="Announcements"
        description={isAdmin ? "Create, schedule and manage school communication." : "News and notices from your school."}
        actions={author ? <LinkButton href="/announcements/new"><Plus className="size-4" aria-hidden /> New announcement</LinkButton> : null}
      />
      <div className="space-y-6">
        {author && (
          <Card>
            <CardHeader title={isAdmin ? "All announcements" : "My announcements"} description="Drafts, scheduled, published and archived. Expired announcements stay here for the record." />
            <ListToolbar searchPlaceholder="Search titles…" filters={[{ name: "status", label: "Statuses", options: STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) }]} />
            <Suspense key={JSON.stringify(sp)} fallback={<TableSkeleton />}>
              <ManageTable ctx={ctx} sp={sp} mineOnly={!isAdmin} />
            </Suspense>
          </Card>
        )}
        {!isAdmin && (
          <Suspense fallback={<Card><TableSkeleton rows={3} /></Card>}>
            <Feed ctx={ctx} />
          </Suspense>
        )}
      </div>
    </>
  )
}

async function ManageTable({ ctx, sp, mineOnly }: { ctx: UserContext; sp: SearchParams; mineOnly: boolean }) {
  const p = parseListParams(sp, { sorts: ANNOUNCEMENT_SORTS, defaultSort: "created_at", defaultDir: "desc", filters: ["status"] })
  if (p.filters.status && !STATUSES.includes(p.filters.status)) delete p.filters.status
  const page = await listAnnouncements(ctx.profile.school_id!, p, mineOnly ? ((await getUserId()) ?? undefined) : undefined)
  if (page.error) return <Alert tone="error" className="m-4">Announcements could not be loaded.</Alert>
  if (page.total === 0) return <EmptyState title="No announcements yet" />
  const audiences = await describeTargets(page.rows)
  const now = new Date().toISOString()
  const sort = { pathname: "/announcements", searchParams: sp, current: p }
  return (
    <>
      <Table label="Announcements">
        <thead>
          <tr>
            <SortTh label="Title" sortKey="title" {...sort} />
            <Th>Audience</Th>
            <Th>Status</Th>
            <SortTh label="Publish" sortKey="publish_at" {...sort} />
            <Th>Expires</Th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((a) => {
            const expired = a.status === "published" && a.expires_at !== null && a.expires_at <= now
            return (
              <tr key={a.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/announcements/${a.id}`} className="font-medium text-brand hover:underline">{a.title}</Link>
                  {(a.priority === "high" || a.priority === "urgent") && <span className="ml-2"><Badge tone="red">{a.priority}</Badge></span>}
                </Td>
                <Td className="max-w-xs text-muted">{(audiences.get(a.id) ?? []).join("; ") || "—"}</Td>
                <Td>{expired ? <Badge>Expired</Badge> : <StatusBadge status={a.status} />}</Td>
                <Td className="whitespace-nowrap text-muted">{formatDateTime(a.published_at ?? a.publish_at, ctx.school?.timezone)}</Td>
                <Td className="whitespace-nowrap text-muted">{a.expires_at ? formatDateTime(a.expires_at, ctx.school?.timezone) : "—"}</Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
      <Pagination pathname="/announcements" searchParams={sp} page={page.page} pageSize={page.pageSize} total={page.total} />
    </>
  )
}

async function Feed({ ctx }: { ctx: UserContext }) {
  const { data, error } = await announcementFeed(ctx.profile.school_id!)
  if (error) return <Alert tone="error">Announcements could not be loaded.</Alert>
  return (
    <Card>
      <CardHeader title="For you" />
      {data.length === 0 ? (
        <EmptyState title="No announcements right now" />
      ) : (
        <ul className="divide-y divide-border">
          {data.map((a) => (
            <li key={a.id} className="px-5 py-4">
              <Link href={`/announcements/${a.id}`} className="font-semibold text-brand hover:underline">{a.title}</Link>
              {(a.priority === "high" || a.priority === "urgent") && <span className="ml-2"><Badge tone="red">{a.priority}</Badge></span>}
              <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm">{a.content}</p>
              <p className="mt-1 text-xs text-muted">{formatDateTime(a.published_at, ctx.school?.timezone)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
