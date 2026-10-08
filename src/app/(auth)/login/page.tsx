import type { Metadata } from "next"
import Link from "next/link"
import { Alert } from "@/components/ui/alert"
import { Field, Form, SubmitButton } from "@/components/ui/form"
import { signIn } from "@/lib/actions/auth"

export const metadata: Metadata = { title: "Sign in" }

const NOTICES: Record<string, { tone: "info" | "error" | "success"; text: string }> = {
  expired: { tone: "info", text: "Your session has expired. Please sign in again." },
  link: { tone: "error", text: "That link is invalid or has expired. Please request a new one." },
  signed_out: { tone: "success", text: "You have been signed out." },
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams
  const next = typeof params.next === "string" ? params.next : ""
  const notice = NOTICES[String(params.reason ?? params.error ?? "")]

  return (
    <>
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-muted">Welcome back. Sign in to your school account.</p>
      {notice && (
        <Alert tone={notice.tone} className="mb-4">
          {notice.text}
        </Alert>
      )}
      <Form action={signIn}>
        <input type="hidden" name="next" value={next} />
        <Field name="email" label="Email" type="email" autoComplete="email" required />
        <Field name="password" label="Password" type="password" autoComplete="current-password" required />
        <div className="flex items-center justify-between">
          <Link href="/forgot-password" className="text-sm text-brand hover:underline">
            Forgot password?
          </Link>
          <SubmitButton>Sign in</SubmitButton>
        </div>
      </Form>
      <p className="mt-6 border-t border-border pt-4 text-center text-sm text-muted">
        New to your school?{" "}
        <Link href="/register" className="font-medium text-brand hover:underline">
          Create an account
        </Link>
      </p>
    </>
  )
}
