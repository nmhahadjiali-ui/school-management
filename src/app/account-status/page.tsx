import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Clock, ShieldOff } from "lucide-react"
import { signOut } from "@/lib/actions/auth"
import { getUserContext, getUserId } from "@/lib/auth/session"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = { title: "Account status" }

/** Shown to signed-in users who cannot use the app yet (pending, disabled, or school inactive). */
export default async function AccountStatusPage() {
  const ctx = await getUserContext()
  if (!ctx) {
    if (!(await getUserId())) redirect("/login")
    return (
      <StatusCard icon={ShieldOff} title="Account not linked to a school">
        Your sign-in works, but your account is not linked to a school yet. Please contact your school administrator.
      </StatusCard>
    )
  }
  const { profile, school, access_active } = ctx
  if (access_active) redirect("/dashboard")

  const pending = profile.status === "pending"
  const schoolInactive = school?.status === "inactive"
  const Icon = pending && !schoolInactive ? Clock : ShieldOff

  return (
    <StatusCard icon={Icon} title={schoolInactive ? "School access is disabled" : pending ? "Awaiting approval" : "Account disabled"}>
          {schoolInactive
            ? `${school?.name ?? "Your school"} is currently not active on the platform. Please contact your school.`
            : pending
              ? `Your registration with ${school?.name ?? "your school"} was received. A school administrator needs to approve your account before you can continue.`
              : "Your account has been deactivated. Please contact your school administrator."}
    </StatusCard>
  )
}

function StatusCard({ icon: Icon, title, children }: { icon: typeof Clock; title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8 text-center shadow-sm">
        <Icon className="mx-auto size-10 text-slate-400" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{children}</p>
        <form action={signOut} className="mt-6">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  )
}
