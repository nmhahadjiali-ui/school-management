import type { Metadata } from "next"
import { Alert } from "@/components/ui/alert"
import { MemberDashboard } from "@/components/dashboard/member-dashboard"
import { PlatformDashboard } from "@/components/dashboard/platform-dashboard"
import { SchoolDashboard } from "@/components/dashboard/school-dashboard"
import { FinanceDashboard } from "@/components/dashboard/finance-dashboard"
import { requireActiveUser } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const ctx = await requireActiveUser()
  const { denied } = await searchParams

  return (
    <>
      {denied && (
        <Alert tone="warning" className="mb-6">
          You do not have permission to open that page.
        </Alert>
      )}
      {ctx.profile.role === "super_admin" ? (
        <PlatformDashboard />
      ) : ctx.profile.role === "school_admin" ? (
        <SchoolDashboard ctx={ctx} />
      ) : ctx.profile.role === "finance_admin" || ctx.profile.role === "finance_staff" ? (
        <FinanceDashboard ctx={ctx} />
      ) : (
        <MemberDashboard ctx={ctx} />
      )}
    </>
  )
}
