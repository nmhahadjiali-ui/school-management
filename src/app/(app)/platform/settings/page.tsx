import type { Metadata } from "next"
import { Fragment } from "react"
import { Card, CardHeader } from "@/components/ui/card"
import { PageHeader, Table, Td, Th } from "@/components/ui/misc"
import { requirePermission } from "@/lib/auth/session"
import { groupFeatures } from "@/lib/feature-groups"
import { featuresInTestMode } from "@/server/notifications/providers"
import { listFeatureCatalog } from "@/services/features"

export const metadata: Metadata = { title: "Platform settings" }

export default async function PlatformSettingsPage() {
  await requirePermission("platform.settings")
  const { data } = await listFeatureCatalog()
  const groups = groupFeatures(data ?? [], featuresInTestMode())

  return (
    <>
      <PageHeader eyebrow="Platform" title="Platform settings" description="Platform-level configuration." />
      <Card>
        <CardHeader
          title="Feature catalog"
          description="Optional modules available to schools, grouped by how far they are built. Enable them per school from each school's page."
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
            {groups.map((g) => (
              <Fragment key={g.key}>
                <tr className="bg-slate-50">
                  <th scope="colgroup" colSpan={3} className="px-4 py-2 text-left">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {g.title} <span className="font-normal normal-case">({g.rows.length})</span>
                    </span>
                    <span className="block text-xs font-normal text-muted">{g.description}</span>
                  </th>
                </tr>
                {g.rows.map((f) => (
                  <tr key={f.id}>
                    <Td className="font-medium">{f.name}</Td>
                    <Td className="font-mono text-xs">{f.key}</Td>
                    <Td className="text-muted">{f.description}</Td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  )
}
