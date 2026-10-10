import type { Metadata } from "next"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { StudentForm } from "@/components/school/fields"
import { createStudent } from "@/lib/actions/people"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { formatRecordNumber, schoolYearNow } from "@/lib/record-number"
import { getSchoolSettings } from "@/services/settings"

export const metadata: Metadata = { title: "New student" }

export default async function NewStudentPage() {
  const ctx = await requireSchoolAdmin()
  const { data: settings } = await getSchoolSettings(ctx.schoolId)
  const autoNumber = settings?.student_number_auto
    ? formatRecordNumber(settings.student_number_format, settings.student_number_next, schoolYearNow(ctx.school?.timezone ?? "UTC"))
    : undefined
  return (
    <>
      <PageHeader title="New student" description="After saving, you can enroll the student and link guardians from their profile." />
      <Card className="max-w-4xl">
        <CardBody>
          <StudentForm action={createStudent} autoNumber={autoNumber} cancelHref="/students" />
        </CardBody>
      </Card>
    </>
  )
}
