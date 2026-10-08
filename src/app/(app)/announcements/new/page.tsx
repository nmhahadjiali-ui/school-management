import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { AnnouncementEditor } from "@/components/communication/announcement-editor"
import { requireActiveUser } from "@/lib/auth/session"
import { audienceOptions, canAuthor } from "@/server/announcements"

export const metadata: Metadata = { title: "New announcement" }

export default async function NewAnnouncementPage() {
  const ctx = await requireActiveUser()
  if (!(await canAuthor(ctx))) redirect("/dashboard?denied=1")
  const options = await audienceOptions(ctx)
  return (
    <>
      <PageHeader title="New announcement" description={ctx.profile.role === "teacher" ? "You can address your own sections and classes." : undefined} />
      <Card className="max-w-4xl">
        <CardBody>
          <AnnouncementEditor options={options} allowed={options.allowed} timezoneLabel={ctx.school?.timezone ?? "UTC"} />
        </CardBody>
      </Card>
    </>
  )
}
