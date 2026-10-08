import type { Metadata } from "next"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { UsersTable } from "@/components/users/users-table"
import { requirePermission } from "@/lib/auth/session"
import { listUsers } from "@/services/users"

export const metadata: Metadata = { title: "Users" }

export default async function PlatformUsersPage() {
  const ctx = await requirePermission("platform.users.view")
  const { data, error } = await listUsers()
  if (error) console.error("[PlatformUsersPage]", error.code, error.message)

  return (
    <>
      <PageHeader eyebrow="Platform" title="Users" description="Accounts across all schools (latest 500)." />
      {error && (
        <Alert tone="error" className="mb-4">
          Users could not be loaded. Please refresh the page.
        </Alert>
      )}
      <Card>
        <UsersTable users={data} currentProfileId={ctx.profile.id} mode="platform" />
      </Card>
    </>
  )
}
