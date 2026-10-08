import type { Metadata } from "next"
import Link from "next/link"
import { Field, Form, SubmitButton } from "@/components/ui/form"
import { register } from "@/lib/actions/auth"

export const metadata: Metadata = { title: "Create account" }

export default function RegisterPage() {
  return (
    <>
      <h1 className="text-xl font-semibold">Create an account</h1>
      <p className="mb-6 mt-1 text-sm text-muted">
        Use the code provided by your school. Your account will be activated once a school administrator approves it.
      </p>
      <Form action={register}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="first_name" label="First name" autoComplete="given-name" required />
          <Field name="last_name" label="Last name" autoComplete="family-name" required />
        </div>
        <Field name="email" label="Email" type="email" autoComplete="email" required />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="school_code" label="School code" autoComplete="off" required />
          <Field
            as="select"
            name="requested_role"
            label="I am a"
            required
            options={[
              { value: "student", label: "Student" },
              { value: "parent", label: "Parent" },
              { value: "teacher", label: "Teacher" },
            ]}
          />
        </div>
        <Field
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters, including a letter and a number."
          required
        />
        <Field name="confirm_password" label="Confirm password" type="password" autoComplete="new-password" required />
        <div className="flex justify-end">
          <SubmitButton>Create account</SubmitButton>
        </div>
      </Form>
      <p className="mt-6 border-t border-border pt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </>
  )
}
