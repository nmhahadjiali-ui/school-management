import type { Metadata } from "next"
import { Card, CardBody } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { SchoolForm } from "@/components/schools/school-form"
import { createSchool } from "@/lib/actions/schools"
import { requirePermission } from "@/lib/auth/session"

export const metadata: Metadata = { title: "New school" }

export default async function NewSchoolPage() {
  await requirePermission("platform.schools.manage")
  return (
    <>
      <PageHeader eyebrow="Platform" title="New school" description="Default settings and feature flags (all off) are created automatically." />
      <Card className="max-w-3xl">
        <CardBody>
          <SchoolForm action={createSchool} mode="create" />
        </CardBody>
      </Card>
    </>
  )
}
