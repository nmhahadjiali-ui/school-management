import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card, CardHeader } from "@/components/ui/card"
import { PageHeader, StatCard } from "@/components/ui/misc"
import { SchoolsTable } from "@/components/schools/schools-table"
import { getPlatformStats, listSchools } from "@/services/schools"

export async function PlatformDashboard() {
  const [stats, schools] = await Promise.all([getPlatformStats(), listSchools()])
  const error = stats.error ?? schools.error
  if (error) console.error("[PlatformDashboard]", error.code, error.message)

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Platform dashboard"
        description="Platform-wide overview across every school on this installation."
        actions={
          <LinkButton href="/platform/schools/new">
            <Plus className="size-4" aria-hidden /> New school
          </LinkButton>
        }
      />
      {error && (
        <Alert tone="error" className="mb-6">
          Some figures could not be loaded. Please refresh the page.
        </Alert>
      )}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total schools" value={stats.data.totalSchools} />
        <StatCard label="Active schools" value={stats.data.activeSchools} />
        <StatCard label="Inactive schools" value={stats.data.inactiveSchools} />
        <StatCard label="Total users" value={stats.data.totalUsers} hint="All accounts, all schools" />
      </div>
      <Card>
        <CardHeader
          title="Schools"
          description="Most recently created first."
          action={
            <LinkButton href="/platform/schools" variant="secondary" size="sm">
              Manage schools
            </LinkButton>
          }
        />
        <SchoolsTable schools={schools.data.slice(0, 10)} />
      </Card>
    </>
  )
}
