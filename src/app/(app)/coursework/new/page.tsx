import type { Metadata } from "next"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody } from "@/components/ui/card"
import { Form, SubmitButton } from "@/components/ui/form"
import { PageHeader } from "@/components/ui/misc"
import { CourseworkFields } from "@/components/academics/fields"
import { createCoursework } from "@/lib/actions/operations"
import { requireAcademicActor } from "@/lib/auth/session"
import { loadLabel, teachingLoads } from "@/services/operations"

export const metadata: Metadata = { title: "New assignment" }

export default async function NewCourseworkPage() {
  const actor = await requireAcademicActor("coursework")
  const year = actor.current_academic_year
  const loads = year ? await teachingLoads(actor.schoolId, year.id, actor.isAdmin ? undefined : actor.teacherId!) : { data: [] }
  const options = loads.data.map((l) => ({ value: l.id, label: actor.isAdmin ? `${loadLabel(l)} · ${l.teacher.last_name}` : loadLabel(l) }))

  return (
    <>
      <PageHeader title="New assignment" description="Students in the class (and their parents) are notified when it is published. You can attach a file after saving." />
      {options.length === 0 ? (
        <Alert tone="info">{actor.isAdmin ? "There are no teaching loads for the current year." : "You are not assigned to teach any class this year."}</Alert>
      ) : (
        <Card className="max-w-3xl">
          <CardBody>
            <Form action={createCoursework}>
              <CourseworkFields loads={options} />
              <div className="flex justify-end border-t border-border pt-4">
                <SubmitButton>Create assignment</SubmitButton>
              </div>
            </Form>
          </CardBody>
        </Card>
      )}
    </>
  )
}
