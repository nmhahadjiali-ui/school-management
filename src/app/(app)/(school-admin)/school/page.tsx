import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { PageHeader, StatusBadge } from "@/components/ui/misc"
import { SchoolForm } from "@/components/schools/school-form"
import { updateSchool } from "@/lib/actions/schools"
import { requirePermission } from "@/lib/auth/session"
import { formatDate } from "@/lib/utils"
import { getSchool } from "@/services/schools"

export const metadata: Metadata = { title: "School" }

export default async function SchoolPage() {
  const ctx = await requirePermission("school.view")
  // The school id comes from the session; RLS would hide any other school anyway.
  const { data: school, error } = await getSchool(ctx.profile.school_id!)
  if (error) throw new Error("Unable to load school")
  if (!school) notFound()

  return (
    <>
      <PageHeader title="School" description="Your school's basic information." />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <SchoolForm action={updateSchool.bind(null, school.id)} school={school} mode="edit" />
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title="Platform status" />
          <CardBody>
            <dl className="grid grid-cols-[7rem_1fr] gap-y-3 text-sm">
              <dt className="text-muted">Code</dt>
              <dd className="font-mono">{school.code}</dd>
              <dt className="text-muted">Status</dt>
              <dd>
                <StatusBadge status={school.status} />
              </dd>
              <dt className="text-muted">Member since</dt>
              <dd>{formatDate(school.created_at, school.timezone)}</dd>
            </dl>
            <p className="mt-4 text-xs text-muted">Share the school code with staff, students and parents so they can register.</p>
          </CardBody>
        </Card>
      </div>
    </>
  )
}
