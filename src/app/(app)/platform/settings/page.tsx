import type { Metadata } from "next"
import { Card, CardHeader } from "@/components/ui/card"
import { PageHeader, Table, Td, Th } from "@/components/ui/misc"
import { requirePermission } from "@/lib/auth/session"
import { listFeatureCatalog } from "@/services/features"

export const metadata: Metadata = { title: "Platform settings" }

export default async function PlatformSettingsPage() {
  await requirePermission("platform.settings")
  const { data } = await listFeatureCatalog()

  return (
    <>
      <PageHeader eyebrow="Platform" title="Platform settings" description="Platform-level configuration." />
      <Card>
        <CardHeader
          title="Feature catalog"
          description="Optional modules available to schools. Enable them per school from each school's page. New features are added through database migrations."
        />
        <Table label="Feature catalog">
          <thead>
            <tr>
              <Th>Feature</Th>
              <Th>Key</Th>
              <Th>Description</Th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((f) => (
              <tr key={f.id}>
                <Td className="font-medium">{f.name}</Td>
                <Td className="font-mono text-xs">{f.key}</Td>
                <Td className="text-muted">{f.description}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  )
}
