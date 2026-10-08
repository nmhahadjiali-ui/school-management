import type { Metadata } from "next"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { TeacherForm } from "@/components/school/fields"
import { createTeacher } from "@/lib/actions/people"
import { requireSchoolAdmin } from "@/lib/auth/session"

export const metadata: Metadata = { title: "New teacher" }

export default async function NewTeacherPage() {
  await requireSchoolAdmin()
  return (
    <>
      <PageHeader title="New teacher" description="After saving, you can assign subjects and send an invitation from the teacher's profile." />
      <Card className="max-w-4xl">
        <CardBody>
          <TeacherForm action={createTeacher} cancelHref="/teachers" />
        </CardBody>
      </Card>
    </>
  )
}
