import type { Metadata } from "next"
import { Plus } from "lucide-react"
import { Alert } from "@/components/ui/alert"
import { LinkButton } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { PageHeader } from "@/components/ui/misc"
import { SchoolsTable } from "@/components/schools/schools-table"
import { requirePermission } from "@/lib/auth/session"
import { listSchools } from "@/services/schools"

export const metadata: Metadata = { title: "Schools" }

export default async function SchoolsPage() {
  await requirePermission("platform.schools.manage")
  const { data, error } = await listSchools()
  if (error) console.error("[SchoolsPage]", error.code, error.message)

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Schools"
        description="Every school on the platform."
        actions={
          <LinkButton href="/platform/schools/new">
            <Plus className="size-4" aria-hidden /> New school
          </LinkButton>
        }
      />
      {error && (
        <Alert tone="error" className="mb-4">
          Schools could not be loaded. Please refresh the page.
        </Alert>
      )}
      <Card>
        <SchoolsTable schools={data} />
      </Card>
    </>
  )
}
