import type { Metadata } from "next"
import Link from "next/link"
import { Field, Form, SubmitButton } from "@/components/ui/form"
import { requestPasswordReset } from "@/lib/actions/auth"

export const metadata: Metadata = { title: "Reset password" }

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Reset your password</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Enter your email and we will send you a link to choose a new password.</p>
      <Form action={requestPasswordReset}>
        <Field name="email" label="Email" type="email" autoComplete="email" required />
        <div className="flex items-center justify-between">
          <Link href="/login" className="text-sm text-brand hover:underline">
            Back to sign in
          </Link>
          <SubmitButton>Send reset link</SubmitButton>
        </div>
      </Form>
    </>
  )
}
