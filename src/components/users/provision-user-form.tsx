"use client"

import { useRef } from "react"
import { Field, Form, SubmitButton } from "@/components/ui/form"
import { provisionUser } from "@/lib/actions/users"
import { ROLE_LABELS } from "@/lib/auth/permissions"
import type { AppRole } from "@/types/domain"

/** Create an account directly in a school (super admin or that school's admin). */
export function ProvisionUserForm({ schoolId, roles }: { schoolId: string; roles: readonly AppRole[] }) {
  const wrapper = useRef<HTMLDivElement>(null)
  return (
    <div ref={wrapper}>
      <Form
        action={provisionUser.bind(null, schoolId)}
        onSuccess={() => wrapper.current?.querySelector("form")?.reset()}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="first_name" label="First name" required />
          <Field name="last_name" label="Last name" required />
          <Field name="email" label="Email" type="email" autoComplete="off" required />
          <Field as="select" name="role" label="Role" required options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
          <Field
            name="password"
            label="Temporary password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters with a letter and a number. Ask the user to change it."
            required
          />
        </div>
        <div className="flex justify-end">
          <SubmitButton>Create account</SubmitButton>
        </div>
      </Form>
    </div>
  )
}
