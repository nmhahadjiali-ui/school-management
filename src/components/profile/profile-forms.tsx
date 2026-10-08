"use client"

import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { Field, Form, SubmitButton } from "@/components/ui/form"
import { updatePassword } from "@/lib/actions/auth"
import { updateProfile } from "@/lib/actions/settings"
import type { UserContext } from "@/types/domain"

export function ProfileForms({ profile }: { profile: UserContext["profile"] }) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Personal details" />
        <CardBody>
          <Form action={updateProfile}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field name="first_name" label="First name" defaultValue={profile.first_name} autoComplete="given-name" required />
              <Field name="last_name" label="Last name" defaultValue={profile.last_name} autoComplete="family-name" required />
              <Field name="phone" label="Phone" type="tel" defaultValue={profile.phone ?? ""} autoComplete="tel" />
              <Field name="avatar_url" label="Photo URL" type="url" placeholder="https://" defaultValue={profile.avatar_url ?? ""} />
            </div>
            <div className="flex justify-end">
              <SubmitButton>Save details</SubmitButton>
            </div>
          </Form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Change password" />
        <CardBody>
          <Form action={updatePassword}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field name="password" label="New password" type="password" autoComplete="new-password" required />
              <Field name="confirm_password" label="Confirm new password" type="password" autoComplete="new-password" required />
            </div>
            <div className="flex justify-end">
              <SubmitButton>Update password</SubmitButton>
            </div>
          </Form>
        </CardBody>
      </Card>
    </div>
  )
}
