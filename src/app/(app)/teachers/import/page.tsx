import type { Metadata } from "next"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { RecordImport } from "@/components/import/record-import"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { formatRecordNumber, schoolYearNow } from "@/lib/record-number"
import { getSchoolSettings } from "@/services/settings"

export const metadata: Metadata = { title: "Import teachers" }

export default async function ImportTeachersPage() {
  const ctx = await requireSchoolAdmin()
  const { data: s } = await getSchoolSettings(ctx.schoolId)
  const auto = s?.employee_number_auto ?? false
  const next = auto && s ? formatRecordNumber(s.employee_number_format, s.employee_number_next, schoolYearNow(ctx.school?.timezone ?? "UTC")) : undefined
  return (
    <>
      <PageHeader title="Import teachers" description="Add many teachers at once from an Excel or CSV file. You can assign subjects and send app invitations afterwards." />
      <Card>
        <CardBody>
          <RecordImport
            entity="teachers"
            numberKey="employee_number"
            numberLabel="Employee number"
            numberRequired={false}
            autoNumbers={auto}
            nextNumber={next}
            extraColumns={[["email", "Email"], ["specialization", "Specialization"]]}
          />
        </CardBody>
      </Card>
    </>
  )
}
