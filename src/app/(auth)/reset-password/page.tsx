import type { Metadata } from "next"
import Link from "next/link"
import { Field, Form, SubmitButton } from "@/components/ui/form"
import { updatePassword } from "@/lib/actions/auth"
import { requireUser } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Choose a new password" }

/** Reached from the reset email via /auth/confirm, which signs the user in. */
export default async function ResetPasswordPage() {
  await requireUser()
  return (
    <>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      <p className="mb-6 mt-1 text-sm text-muted">At least 8 characters, including a letter and a number.</p>
      <Form action={updatePassword}>
        <Field name="password" label="New password" type="password" autoComplete="new-password" required />
        <Field name="confirm_password" label="Confirm new password" type="password" autoComplete="new-password" required />
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-brand hover:underline">
            Go to dashboard
          </Link>
          <SubmitButton>Update password</SubmitButton>
        </div>
      </Form>
    </>
  )
}
