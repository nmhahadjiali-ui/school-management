import type { Metadata } from "next"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { StudentForm } from "@/components/school/fields"
import { createStudent } from "@/lib/actions/people"
import { requireSchoolAdmin } from "@/lib/auth/session"

export const metadata: Metadata = { title: "New student" }

export default async function NewStudentPage() {
  await requireSchoolAdmin()
  return (
    <>
      <PageHeader title="New student" description="After saving, you can enroll the student and link guardians from their profile." />
      <Card className="max-w-4xl">
        <CardBody>
          <StudentForm action={createStudent} cancelHref="/students" />
        </CardBody>
      </Card>
    </>
  )
}
