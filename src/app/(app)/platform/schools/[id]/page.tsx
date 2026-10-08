import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { PageHeader, StatusBadge } from "@/components/ui/misc"
import { SchoolForm } from "@/components/schools/school-form"
import { ImageUpload } from "@/components/ui/image-upload"
import { setSchoolLogo } from "@/lib/actions/images"
import { FeatureToggles, SchoolStatusControl } from "@/components/schools/school-admin-controls"
import { ProvisionUserForm } from "@/components/users/provision-user-form"
import { UsersTable } from "@/components/users/users-table"
import { updateSchool } from "@/lib/actions/schools"
import { PROVISIONABLE_ROLES } from "@/lib/auth/permissions"
import { requirePermission } from "@/lib/auth/session"
import { uuidSchema } from "@/lib/validations"
import { listSchoolFeatures } from "@/services/features"
import { getSchool } from "@/services/schools"
import { listUsers } from "@/services/users"

export const metadata: Metadata = { title: "School" }

export default async function SchoolDetailPage({ params, searchParams }: PageProps<"/platform/schools/[id]">) {
  const ctx = await requirePermission("platform.schools.manage")
  const { id } = await params
  const { created } = await searchParams
  if (!uuidSchema.safeParse(id).success) notFound()

  const [school, features, users] = await Promise.all([getSchool(id), listSchoolFeatures(id), listUsers({ schoolId: id })])
  if (school.error) throw new Error("Unable to load school")
  if (!school.data) notFound()
  const s = school.data

  return (
    <>
      <PageHeader
        eyebrow={`Platform · ${s.code}`}
        title={s.name}
        description={<StatusBadge status={s.status} />}
        actions={<SchoolStatusControl schoolId={s.id} name={s.name} status={s.status} />}
      />
      {created && (
        <Alert tone="success" className="mb-6">
          School created. Next, add a school administrator below.
        </Alert>
      )}
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Logo" />
            <CardBody>
              <ImageUpload bucket="school-logos" folder={s.id} currentSrc={s.logo_url} onSave={setSchoolLogo.bind(null, s.id)} label="logo" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <SchoolForm action={updateSchool.bind(null, s.id)} school={s} mode="edit" />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Add user" description="Create an account in this school, e.g. its first school administrator." />
            <CardBody>
              <ProvisionUserForm schoolId={s.id} roles={PROVISIONABLE_ROLES} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Users" description={`${users.data.length} account(s)`} />
            <UsersTable users={users.data} currentProfileId={ctx.profile.id} mode="platform" />
          </Card>
        </div>
        <Card className="self-start">
          <CardHeader title="Features" description="Optional modules for this school." />
          <FeatureToggles schoolId={s.id} features={features.data} />
        </Card>
      </div>
    </>
  )
}
