"use client"

import Link from "next/link"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { Field, Form, SubmitButton } from "@/components/ui/form"
import { updateSchoolSettings } from "@/lib/actions/settings"
import type { School, SchoolSettings } from "@/types/domain"

export function SettingsForm({ school, settings }: { school: School; settings: SchoolSettings }) {
  return (
    <Form action={updateSchoolSettings} className="space-y-6">
      <Card>
        <CardHeader title="General" />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field name="timezone" label="Time zone" defaultValue={school.timezone} hint="IANA name, e.g. Asia/Manila" required />
          <p className="self-end pb-2 text-sm text-muted">
            Academic years are managed on the{" "}
            <Link href="/academic-years" className="font-medium text-brand hover:underline">
              Academic Years
            </Link>{" "}
            page.
          </p>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Branding" />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Field name="logo_url" label="Logo URL" type="url" placeholder="https://" defaultValue={school.logo_url ?? ""} />
          <Field name="primary_color" label="Primary color" type="color" defaultValue={settings.primary_color} />
        </CardBody>
      </Card>
      <div className="flex justify-end">
        <SubmitButton>Save settings</SubmitButton>
      </div>
    </Form>
  )
}
