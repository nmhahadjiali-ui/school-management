import type { Metadata } from "next"
import { Field, Form, SubmitButton } from "@/components/ui/form"
import { acceptInvitation } from "@/lib/actions/auth"
import { requireUser } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Accept invitation" }

/** Reached from the invitation email via /auth/confirm, which signs the user in. */
export default async function AcceptInvitePage() {
  const { profile, school } = await requireUser()
  return (
    <>
      <h1 className="text-xl font-semibold">Welcome{profile.first_name ? `, ${profile.first_name}` : ""}</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        {school?.name ? `${school.name} invited you to the platform. ` : ""}Choose a password to finish setting up your account.
      </p>
      <Form action={acceptInvitation}>
        <Field name="password" label="Password" type="password" autoComplete="new-password" hint="At least 8 characters, including a letter and a number." required />
        <Field name="confirm_password" label="Confirm password" type="password" autoComplete="new-password" required />
        <div className="flex justify-end">
          <SubmitButton>Set password and continue</SubmitButton>
        </div>
      </Form>
    </>
  )
}
