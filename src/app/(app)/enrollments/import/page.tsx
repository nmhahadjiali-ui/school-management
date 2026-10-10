import type { Metadata } from "next"
import Link from "next/link"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { RecordImport } from "@/components/import/record-import"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { listAcademicYears, pickYear } from "@/services/academic"

export const metadata: Metadata = { title: "Import enrollments" }

export default async function ImportEnrollmentsPage({ searchParams }: PageProps<"/enrollments/import">) {
  const ctx = await requireSchoolAdmin()
  const sp = await searchParams
  const { data: years } = await listAcademicYears(ctx.schoolId)
  const year = pickYear(years ?? [], typeof sp.year === "string" ? sp.year : undefined)

  return (
    <>
      <PageHeader title={year ? `Import enrollments (${year.name})` : "Import enrollments"} description="Enroll many existing students at once from an Excel or CSV file." />
      {!year ? (
        <Alert tone="info">Create an academic year first.</Alert>
      ) : year.status === "archived" ? (
        <Alert tone="info">{year.name} is archived; enrollments can no longer be added.</Alert>
      ) : (
        <Card>
          <CardBody>
            <RecordImport
              entity="enrollments"
              numberKey="student_number"
              numberLabel="Student number"
              numberRequired
              autoNumbers={false}
              formFields={{ year: year.id }}
              templateHref={`/api/import/enrollments/template?year=${year.id}`}
              extraColumns={[["grade_level", "Grade level"], ["section", "Section"], ["enrollment_date", "Enrollment date"]]}
              intro={
                <p>
                  1. Students must already exist (add them or{" "}
                  <Link href="/students/import" className="font-medium underline">
                    import students
                  </Link>{" "}
                  first). Download the template and fill in one student per row: <strong>Student number</strong> and <strong>Grade level</strong> (name or code) are
                  required; <strong>Section</strong> and <strong>Enrollment date</strong> are optional. Everyone is enrolled in <strong>{year.name}</strong>; to use another year,
                  choose it on the{" "}
                  <Link href="/enrollments" className="font-medium underline">
                    Enrollments
                  </Link>{" "}
                  page first.
                </p>
              }
            />
          </CardBody>
        </Card>
      )}
    </>
  )
}
