import type { Metadata } from "next"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { StudentImport } from "@/components/students/student-import"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { formatRecordNumber, schoolYearNow } from "@/lib/record-number"
import { getSchoolSettings } from "@/services/settings"

export const metadata: Metadata = { title: "Import students" }

export default async function ImportStudentsPage() {
  const ctx = await requireSchoolAdmin()
  const { data: s } = await getSchoolSettings(ctx.schoolId)
  const auto = s?.student_number_auto ?? false
  const next = auto && s ? formatRecordNumber(s.student_number_format, s.student_number_next, schoolYearNow(ctx.school?.timezone ?? "UTC")) : undefined
  return (
    <>
      <PageHeader title="Import students" description="Add many students at once from an Excel or CSV file. You can enroll them and link guardians afterwards." />
      <Card>
        <CardBody>
          <StudentImport autoNumbers={auto} nextNumber={next} />
        </CardBody>
      </Card>
    </>
  )
}
