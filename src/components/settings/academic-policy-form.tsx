"use client"

import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { CheckboxField, Field, Form, SubmitButton } from "@/components/ui/form"
import { updateAcademicSettings } from "@/lib/actions/operations"
import type { SchoolSettings } from "@/types/domain"

/** School-specific academic policies (enforced in the database, not just the UI). */
export function AcademicPolicyForm({ settings }: { settings: SchoolSettings }) {
  return (
    <Card>
      <CardHeader title="Academic policies" description="These rules are enforced by the database for every user and app." />
      <CardBody>
        <Form action={updateAcademicSettings}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              name="attendance_edit_days"
              label="Teachers may edit attendance up to (days back)"
              type="number"
              min={0}
              max={365}
              defaultValue={settings.attendance_edit_days ?? ""}
              hint="0 = same day only. Leave blank for no limit. Administrators can always correct, lock and unlock."
            />
            <div className="self-center">
              <CheckboxField name="enforce_room_conflicts" label="Prevent room double-booking in schedules" defaultChecked={settings.enforce_room_conflicts} />
            </div>
            <Field name="grade_max_score" label="Maximum score" type="number" step="0.01" defaultValue={Number(settings.grade_max_score)} required />
            <Field name="grade_passing_score" label="Passing score" type="number" step="0.01" defaultValue={Number(settings.grade_passing_score)} required hint="Used when no grading scale band applies." />
          </div>
          <div className="flex justify-end">
            <SubmitButton>Save policies</SubmitButton>
          </div>
        </Form>
      </CardBody>
    </Card>
  )
}
