import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { GuardianForm } from "@/components/school/fields"
import { updateGuardian } from "@/lib/actions/people"
import { requireSchoolAdmin } from "@/lib/auth/session"
import { uuidSchema } from "@/lib/validations"
import { getGuardian } from "@/services/people"

export const metadata: Metadata = { title: "Edit parent / guardian" }

export default async function EditGuardianPage({ params }: PageProps<"/guardians/[id]/edit">) {
  await requireSchoolAdmin()
  const { id } = await params
  if (!uuidSchema.safeParse(id).success) notFound()
  const { data: guardian, error } = await getGuardian(id)
  if (error) throw new Error("Unable to load guardian")
  if (!guardian) notFound()
  return (
    <>
      <PageHeader title={`Edit ${guardian.first_name} ${guardian.last_name}`} />
      <Card className="max-w-4xl">
        <CardBody>
          <GuardianForm action={updateGuardian.bind(null, guardian.id)} guardian={guardian} cancelHref={`/guardians/${guardian.id}`} />
        </CardBody>
      </Card>
    </>
  )
}
