import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { TeacherForm } from "@/components/school/fields"
import { updateTeacher } from "@/lib/actions/people"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { uuidSchema } from "@/lib/validations"
import { getTeacher } from "@/services/people"

export const metadata: Metadata = { title: "Edit teacher" }

export default async function EditTeacherPage({ params }: PageProps<"/teachers/[id]/edit">) {
  await requireSchoolAdmin()
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) notFound()
  const { data: teacher, error } = await getTeacher(id)
  if (error) throw new Error("Unable to load teacher")
  if (!teacher) notFound()
  return (
    <>
      <PageHeader title={`Edit ${teacher.first_name} ${teacher.last_name}`} />
      <Card className="max-w-4xl">
        <CardBody>
          <TeacherForm action={updateTeacher.bind(null, teacher.id)} teacher={teacher} cancelHref={`/teachers/${teacher.id}`} />
        </CardBody>
      </Card>
    </>
  )
}
