import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { StudentForm } from "@/components/school/fields"
import { updateStudent } from "@/lib/actions/people"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { uuidSchema } from "@/lib/validations"
import { getStudent } from "@/services/people"

export const metadata: Metadata = { title: "Edit student" }

export default async function EditStudentPage({ params }: PageProps<"/students/[id]/edit">) {
  await requireSchoolAdmin()
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) notFound()
  const { data: student, error } = await getStudent(id)
  if (error) throw new Error("Unable to load student")
  if (!student) notFound()
  return (
    <>
      <PageHeader eyebrow={student.student_number} title={`Edit ${student.first_name} ${student.last_name}`} />
      <Card className="max-w-4xl">
        <CardBody>
          <StudentForm action={updateStudent.bind(null, student.id)} student={student} cancelHref={`/students/${student.id}`} />
        </CardBody>
      </Card>
    </>
  )
}
