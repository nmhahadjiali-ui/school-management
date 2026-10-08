import type { Metadata } from "next"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { Badge, PageHeader } from "@/components/ui/misc"
import { SettingsForm } from "@/components/settings/settings-form"
import { AcademicPolicyForm } from "@/components/settings/academic-policy-form"
import { requirePermission } from "@/lib/auth/session"
import { listSchoolFeatures } from "@/services/features"
import { getSchool } from "@/services/schools"
import { getSchoolSettings } from "@/services/settings"

export const metadata: Metadata = { title: "Settings" }

export default async function SchoolSettingsPage() {
  const ctx = await requirePermission("school.settings.manage")
  const schoolId = ctx.profile.school_id!
  const [school, settings, features] = await Promise.all([
    getSchool(schoolId),
    getSchoolSettings(schoolId),
    listSchoolFeatures(schoolId),
  ])
  if (school.error || settings.error || !school.data || !settings.data) throw new Error("Unable to load settings")

  return (
    <>
      <PageHeader title="Settings" description="Configure your school." />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <SettingsForm school={school.data} settings={settings.data} />
          <AcademicPolicyForm settings={settings.data} />
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Modules" description="Enabled by the platform administrator." />
            <ul className="divide-y divide-border">
              {features.data.map((f) => (
                <li key={f.key} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  {f.name}
                  <Badge tone={f.enabled ? "green" : "gray"}>{f.enabled ? "Enabled" : "Off"}</Badge>
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title="Grading" />
            <CardBody className="text-sm text-muted">
              Configure <a href="/grading-periods" className="font-medium text-brand hover:underline">grading periods</a> and your{" "}
              <a href="/grading-scales" className="font-medium text-brand hover:underline">grading scale</a>.
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
