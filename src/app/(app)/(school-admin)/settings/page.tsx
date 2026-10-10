import type { Metadata } from "next"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { Badge, PageHeader } from "@/components/ui/misc"
import { SettingsForm } from "@/components/settings/settings-form"
import { AcademicPolicyForm } from "@/components/settings/academic-policy-form"
import { NumberingSettingsForm } from "@/components/settings/numbering-settings-form"
import { schoolYearNow } from "@/lib/record-number"
import { CommunicationSettingsForm } from "@/components/settings/communication-settings"
import { EmptyState, Table, Td, Th } from "@/components/ui/misc"
import { deliverySummary, recentFailures, smsUsage } from "@/services/communication"
import { requirePermission } from "@/lib/auth/session"
import { listSchoolFeatures } from "@/services/features"
import { getSchool } from "@/services/schools"
import { getSchoolSettings } from "@/services/settings"
import { ImageUpload } from "@/components/ui/image-upload"
import { setSchoolLogo } from "@/lib/actions/images"

export const metadata: Metadata = { title: "Settings" }

export default async function SchoolSettingsPage() {
  const ctx = await requirePermission("school.settings.manage")
  const schoolId = ctx.profile.school_id!
  const [school, settings, features, usage, deliveries, failures] = await Promise.all([
    getSchool(schoolId),
    getSchoolSettings(schoolId),
    listSchoolFeatures(schoolId),
    smsUsage(schoolId),
    deliverySummary(schoolId),
    recentFailures(schoolId),
  ])
  const has = (key: string) => (features.data ?? []).some((f) => f.key === key && f.enabled)
  if (school.error || settings.error || !school.data || !settings.data) throw new Error("Unable to load settings")

  return (
    <>
      <PageHeader title="Settings" description="Configure your school." />
      <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader title="School logo" description="Shown in the menu and on the dashboard." />
            <CardBody>
              <ImageUpload bucket="school-logos" folder={schoolId} currentSrc={school.data.logo_url} onSave={setSchoolLogo.bind(null, schoolId)} label="logo" />
            </CardBody>
          </Card>
          <SettingsForm school={school.data} settings={settings.data} />
          <AcademicPolicyForm settings={settings.data} />
          <NumberingSettingsForm settings={settings.data} year={schoolYearNow(school.data.timezone)} />
          <CommunicationSettingsForm settings={settings.data} available={{ email: has("email_notifications"), sms: has("sms"), push: has("push_notifications") }} />
          <Card>
            <CardHeader title="Delivery health (last 30 days)" description="Messages sent through external channels. In-app notifications are not counted here." />
            {Object.keys(deliveries).length === 0 ? (
              <EmptyState title="No external deliveries yet" />
            ) : (
              <Table label="Deliveries by channel">
                <thead>
                  <tr>
                    <Th>Channel</Th>
                    {["sent", "pending", "failed", "cancelled"].map((s) => <Th key={s} className="text-right">{s[0].toUpperCase() + s.slice(1)}</Th>)}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(deliveries).map(([channel, counts]) => (
                    <tr key={channel}>
                      <Td className="font-medium uppercase">{channel}</Td>
                      {["sent", "pending", "failed", "cancelled"].map((s) => <Td key={s} className="text-right tabular-nums">{counts[s] ?? 0}</Td>)}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {(failures.data ?? []).length > 0 && (
              <CardBody className="space-y-1 border-t border-border text-sm">
                <p className="font-medium">Recent failures</p>
                {(failures.data ?? []).map((f) => (
                  <p key={f.id} className="text-muted"><span className="uppercase">{f.channel}</span> · {f.error_message} ({f.attempts} attempts)</p>
                ))}
              </CardBody>
            )}
          </Card>
          {has("sms") && (
            <Card>
              <CardHeader title="SMS usage" description="Counted per month for usage reporting and future billing." />
              {(usage.data ?? []).length === 0 ? (
                <EmptyState title="No SMS sent yet" />
              ) : (
                <Table label="SMS usage by month">
                  <thead>
                    <tr>
                      <Th>Month</Th>
                      <Th className="text-right">Sent</Th>
                      <Th className="text-right">Failed</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(usage.data ?? []).map((u) => (
                      <tr key={u.id}>
                        <Td>{new Date(Date.UTC(u.year, u.month - 1, 1)).toLocaleString("en", { month: "long", year: "numeric", timeZone: "UTC" })}</Td>
                        <Td className="text-right tabular-nums">{u.messages_sent.toLocaleString()}</Td>
                        <Td className="text-right tabular-nums">{u.messages_failed.toLocaleString()}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card>
          )}
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
