import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { AnnouncementEditor } from "@/components/communication/announcement-editor"
import { getUserId, requireActiveUser } from "@/lib/auth/session"
import { isoToZonedInput } from "@/lib/dates"
import { uuidSchema } from "@/lib/validations"
import { audienceOptions, canAuthor, describeTargets } from "@/server/announcements"
import { getAnnouncement } from "@/services/communication"

export const metadata: Metadata = { title: "Edit announcement" }

export default async function EditAnnouncementPage({ params }: PageProps<"/announcements/[id]/edit">) {
  const ctx = await requireActiveUser()
  if (!(await canAuthor(ctx))) redirect("/dashboard?denied=1")
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) notFound()
  const { data: a } = await getAnnouncement(id)
  if (!a) notFound()
  if (ctx.profile.role !== "school_admin" && a.author_user_id !== (await getUserId())) notFound()
  if (a.status === "archived") redirect(`/announcements/${id}`)
  const [options, labels] = await Promise.all([audienceOptions(ctx), describeTargets([a])])
  const tz = ctx.school?.timezone

  return (
    <>
      <PageHeader title="Edit announcement" />
      <Card className="max-w-4xl">
        <CardBody>
          <AnnouncementEditor
            options={options}
            allowed={options.allowed}
            timezoneLabel={tz ?? "UTC"}
            value={{
              id: a.id,
              title: a.title,
              content: a.content,
              priority: a.priority,
              status: a.status,
              publish_at: a.status === "scheduled" ? isoToZonedInput(a.publish_at, tz) : "",
              expires_at: isoToZonedInput(a.expires_at, tz),
              targets: a.targets.map((t, i) => ({ target_type: t.target_type, target_id: t.target_type === "school" ? null : t.target_id, roles: t.roles as ("school_admin" | "teacher" | "student" | "parent")[] | null, label: labels.get(a.id)?.[i] })),
            }}
          />
        </CardBody>
      </Card>
    </>
  )
}
