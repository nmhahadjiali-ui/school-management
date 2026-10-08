"use client"

import { Field, Form, SubmitButton } from "@/components/ui/form"
import type { ActionResult } from "@/lib/action-result"
import type { School } from "@/types/domain"

type Props = {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>
  school?: School
  /** Code and initial status can only be set at creation (by a super admin). */
  mode: "create" | "edit"
}

export function SchoolForm({ action, school, mode }: Props) {
  return (
    <Form action={action}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field name="name" label="School name" defaultValue={school?.name} required />
        {mode === "create" ? (
          <Field name="code" label="School code" hint="2–20 letters, numbers or dashes. Users enter this to join." required />
        ) : (
          <Field name="code_display" label="School code" defaultValue={school?.code} disabled hint="The code cannot be changed." />
        )}
        <Field name="contact_email" label="Contact email" type="email" defaultValue={school?.contact_email ?? ""} />
        <Field name="contact_phone" label="Contact phone" type="tel" defaultValue={school?.contact_phone ?? ""} />
        <Field name="address" label="Address" as="textarea" defaultValue={school?.address ?? ""} className="md:col-span-2" />
        <Field name="timezone" label="Time zone" defaultValue={school?.timezone ?? "UTC"} hint="IANA name, e.g. Asia/Manila" required />
        {mode === "create" && (
          <Field
            as="select"
            name="status"
            label="Initial status"
            defaultValue="active"
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
        )}
      </div>
      <div className="flex justify-end">
        <SubmitButton>{mode === "create" ? "Create school" : "Save changes"}</SubmitButton>
      </div>
    </Form>
  )
}
