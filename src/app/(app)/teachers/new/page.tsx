import type { Metadata } from "next"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { TeacherForm } from "@/components/school/fields"
import { createTeacher } from "@/lib/actions/people"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { formatRecordNumber, schoolYearNow } from "@/lib/record-number"
import { getSchoolSettings } from "@/services/settings"

export const metadata: Metadata = { title: "New teacher" }

export default async function NewTeacherPage() {
  const ctx = await requireSchoolAdmin()
  const { data: settings } = await getSchoolSettings(ctx.schoolId)
  const autoNumber = settings?.employee_number_auto
    ? formatRecordNumber(settings.employee_number_format, settings.employee_number_next, schoolYearNow(ctx.school?.timezone ?? "UTC"))
    : undefined
  return (
    <>
      <PageHeader title="New teacher" description="After saving, you can assign subjects and send an invitation from the teacher's profile." />
      <Card className="max-w-4xl">
        <CardBody>
          <TeacherForm action={createTeacher} autoNumber={autoNumber} cancelHref="/teachers" />
        </CardBody>
      </Card>
    </>
  )
}
