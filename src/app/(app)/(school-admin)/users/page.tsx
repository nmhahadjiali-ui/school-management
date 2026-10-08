import type { Metadata } from "next"
import Link from "next/link"
import { Alert } from "@/components/ui/alert"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { ProvisionUserForm } from "@/components/users/provision-user-form"
import { UsersTable } from "@/components/users/users-table"
import { SCHOOL_MEMBER_ROLES } from "@/lib/auth/permissions"
import { requirePermission } from "@/lib/auth/session"
import { cn } from "@/lib/utils"
import { listUsers } from "@/services/users"
import type { ProfileStatus } from "@/types/domain"

export const metadata: Metadata = { title: "Users" }

const FILTERS: { label: string; status?: ProfileStatus }[] = [
  { label: "All" },
  { label: "Pending approval", status: "pending" },
  { label: "Active", status: "active" },
  { label: "Inactive", status: "inactive" },
]

export default async function SchoolUsersPage({ searchParams }: PageProps<"/users">) {
  const ctx = await requirePermission("school.users.view")
  const { status } = await searchParams
  const current = FILTERS.find((f) => f.status === status) ?? FILTERS[0]
  const { data, error } = await listUsers({ schoolId: ctx.profile.school_id!, status: current.status })
  if (error) console.error("[SchoolUsersPage]", error.code, error.message)

  return (
    <>
      <PageHeader title="Users" description="People with an account at your school." />
      {error && (
        <Alert tone="error" className="mb-4">
          Users could not be loaded. Please refresh the page.
        </Alert>
      )}
      <Card className="mb-6">
        <nav aria-label="Filter users" className="flex flex-wrap gap-1 border-b border-border px-3 py-2">
          {FILTERS.map((f) => (
            <Link
              key={f.label}
              href={f.status ? `/users?status=${f.status}` : "/users"}
              aria-current={f === current ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                f === current ? "bg-brand/10 text-brand" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <UsersTable users={data} currentProfileId={ctx.profile.id} mode="school" />
      </Card>
      <Card className="max-w-3xl">
        <CardHeader title="Add user" description="Create an account for a teacher, student or parent." />
        <CardBody>
          <ProvisionUserForm schoolId={ctx.profile.school_id!} roles={SCHOOL_MEMBER_ROLES} />
        </CardBody>
      </Card>
    </>
  )
}
