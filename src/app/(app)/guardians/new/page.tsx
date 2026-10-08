import type { Metadata } from "next"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { GuardianForm } from "@/components/school/fields"
import { createGuardian } from "@/lib/actions/people"
import { requireSchoolAdmin } from "@/lib/auth/session"

export const metadata: Metadata = { title: "New parent / guardian" }

export default async function NewGuardianPage() {
  await requireSchoolAdmin()
  return (
    <>
      <PageHeader title="New parent / guardian" description="After saving, link their children from the profile." />
      <Card className="max-w-4xl">
        <CardBody>
          <GuardianForm action={createGuardian} cancelHref="/guardians" />
        </CardBody>
      </Card>
    </>
  )
}
